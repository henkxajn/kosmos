// FleetManagerOverlay — trójdzielny overlay zarządzania flotą
//
// Otwierany klawiszem F lub kliknięciem FLOTA w Outlinerze.
// Layout zakładki taktycznej: REJESTR (tabela + oś czasu) | RIGHT (szczegóły + akcje).
// Rysowany na Canvas 2D (#ui-canvas), NA WIERZCHU istniejącego UI.
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC, BOTTOM_RESERVED } from '../config/LayoutConfig.js';
import { BOTTOM_STRIP_H } from './MapInsets.js';   // ARKUSZ UI U4-2 — pas dolny z jednego źródła (TIME_STRIP_H)
import { CIV_SIDEBAR_W, getSubNavHeight }  from './CivPanelDrawer.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { canBuildHullAt }  from '../data/ShipBuildRules.js';
import { SHIP_MODULES, calcShipCost, countModuleSlots, getModuleCapabilities } from '../data/ShipModulesData.js';
import { RESOURCE_ICONS }  from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES }   from '../data/ResourcesData.js';
import { TECHS }           from '../data/TechData.js';
import { effectiveRange, loadColonists, unloadColonists, isEnemyVessel, warpRange, canColonize as vesselCanColonize, getPrimaryRole, canDoEnvoy }  from '../entities/Vessel.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import { ALL_DOCTRINES, doctrineNameKey } from '../data/FleetDoctrines.js';
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
import { returnJumpTransactional } from '../utils/ReturnJump.js';
import { foreignActionsBodyId, foreignActionsContext, isForeignColonizeType } from '../utils/ForeignActions.js';   // Finding 578 — akcje obce kluczuje predykat
import {
  TRANSIT_KEY, buildRegistryRows, sortRows, filterRows,
  collectSystemChoices, collectRoleChoices, REGISTRY_COLUMNS,
  groupRows, GROUP_MODES, UNGROUPED_KEY,
} from './FleetRegistryLogic.js';

// Rejestr 2.0 (3e): szerokość prawego panelu zakładki taktycznej (_drawRight liczy z parametru w).
const REGISTRY_RIGHT_W = 300;

import {
  defaultViewport, zoomViewport, layoutTimelineRows, nowLineX, timelineTicks, xToYear,
} from './TimelineLayout.js';
import { buildTimelineRows, toneColor } from './FleetPictureLogic.js';
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
// ARC KONSOLE K7-A — Dowództwo na szablonie konsoli (FEATURES.consoleCommand, czytane w chwili użycia)
import { isKitScreen } from './ConsoleLayoutLogic.js';
import { applyConsoleHalo } from './ConsoleKit.js';
import { drawCommandConsole } from './CommandConsoleView.js';
import { defaultRegistryFilter, searchInputCss, focusPlan } from './CommandConsoleLogic.js';
import { dialogAnchorCss } from './CommandInspectorLogic.js';
import { UNIT_ARCHETYPES, checkArchetypeUnlocked, GROUND_UNIT_CAP_EXEMPT, ARCHETYPE_ICONS } from '../data/unitArchetypes.js';   // K7-C (dane, bez three)
const kitOn = () => isKitScreen('fleet', GAME_CONFIG.FEATURES);
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

// ── Helper: ikona ciała dla list redirect (spójna: interstellar_redirect + foreign_redirect) ──
// ⚠ MARTWY od (f-A, Finding 253): obie listy usunięte, ZERO konsumentów. Zostaje do sweepu 127
//   razem z `issueReturn` / `_dispatchReturnJump` / `ACTIONS.return_home` — nie kasujemy tu,
//   bo to osobna, jednorodna praca.
function _redirectBodyIcon(type) {
  return type === 'moon'      ? '🌙'
       : type === 'planetoid' ? '🪨'
       : type === 'asteroid'  ? '◆'
       : type === 'comet'     ? '☄'
       : '🪐';   // planet (i fallback)
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

// ── Stałe layoutu ────────────────────────────────────────────────────────────
const TAB_H     = 28;   // wysokość paska zakładek (tytuł + 4 zakładki) pod nagłówkiem overlay

// Typy hitów pochodzące z osadzonego edytora projektów (UnitDesignOverlay._drawShipDesigner) —
// delegowane do instancji edytora w _handleHit. ('ground:*' idą osobną gałęzią po prefiksie —
// zakładka Jednostki osadza GroundUnitPanel.)
const DESIGN_EDITOR_HIT_TYPES = new Set([
  'select_hull', 'select_slot', 'clear_slot', 'pick_module',
  'save_template', 'clear_design', 'edit_template', 'delete_template', 'tpl_row',
]);

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
const TIME_STRIP_H = BOTTOM_STRIP_H;   // pas dolny (`MapInsets`; pasek zegara nad nawigacją) — ARKUSZ UI U4-2: dawniej 20 na sztywno
const OUTLINER_W = COSMIC.OUTLINER_W;  // 180

// Kolory statusów statków
// Finding 266: klucz = TOKEN KANONU (`utils/VesselStatus`), nie surowy `position.state`.
const STATUS_COLORS = {
  docked:     () => THEME.success,
  in_transit: () => THEME.warning,
  orbiting:   () => THEME.mint,
  in_space:   () => THEME.mint,
  unknown:    () => THEME.textDim,
};

const STATUS_ICONS = {
  idle:       '✓',
  on_mission: '→',
  orbiting:   '⊙',
  refueling:  '⚡',
  damaged:    '!',
};

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
function _truncateStr(s, max) {
  if (!s) return '';
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

// Pełny katalog transportowalnych dóbr: surowce (bez research/energy — niefizyczne)
// + wszystkie towary (commodities). Kolejność: surowce, potem towary.
const _LOGI_GOOD_CATALOG = [
  ...Object.keys(ALL_RESOURCES).filter(id => id !== 'research' && id !== 'energy'),
  ...Object.keys(COMMODITIES),
];

function _actionStyle(actionId, ok) {
  if (!ok) return { bg: THEME.bgTertiary, fg: THEME.textDim, border: THEME.border };
  if (actionId === 'return_home') return { bg: 'rgba(255,51,68,0.12)', fg: THEME.danger, border: THEME.dangerDim };
  if (actionId === 'colonize')    return { bg: 'rgba(170,136,255,0.12)', fg: THEME.purple, border: THEME.purple };
  return { bg: 'rgba(0,255,180,0.06)', fg: THEME.accent, border: THEME.borderActive };
}

// M3 P3.1 — generic section button (rally assignment + future use)
function _drawSectionButton(ctx, x, y, w, h, label, fgColor, borderColor) {
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = borderColor ?? THEME.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
  ctx.fillStyle = fgColor ?? THEME.textPrimary;
  // Truncate label do szerokości buttona
  let txt = label ?? '';
  const maxW = w - 12;
  while (txt.length > 4 && ctx.measureText(txt).width > maxW) {
    txt = txt.slice(0, -2) + '…';
  }
  ctx.fillText(txt, x + 6, y + h * 0.5 + 4);
}

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
    this._registryRects = null;                 // {table, timeline} — regiony scroll/zoom
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

    // Tooltip ciała pod kursorem (wiersze katalogu Atlasu — strefy 'map_body')
    this._mapHoverBody = null;    // { bodyId, screenX, screenY } — hover info

    // Skok międzygwiezdny — hover ciała z poprzedniego układu nie ma sensu w nowym.
    EventBus.on('system:switched', () => {
      this._mapHoverBody = null;
    });
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
    // Wyczyść hovery wszystkich widoków
    this._mapHoverBody = null;
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

    // K7-A — konsola: nagłówek z czipami zakładek, rejestr w 4 strefach (żywa, przyciemniona scena za tekstem)
    if (kitOn()) {
      ctx.save();
      applyConsoleHalo(ctx);
      try { drawCommandConsole(this, ctx, W, H); } finally { ctx.restore(); }
      return;
    }
    this.consoleZones = null;

    // ── Tło ──────────────────────────────────────────────────
    // Pełna nieprzezroczystość — overlay zakrywa 3D mapę układu, żeby ruchome
    // ciała pod spodem nie rozpraszały i prawy klik nie raycast'ował przez niego.
    ctx.fillStyle = '#000';
    ctx.fillRect(ox, oy, ow, oh);

    // Obramowanie glass
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // ── Pasek zakładek + tytuł (TAB_H pod nagłówkiem) ───────
    this._drawTabBar(ctx, ox, oy, ow);

    // Przycisk zamknięcia [X] — prawy górny róg
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._hitZones.push({ x: closeX - 4, y: closeY, w: 22, h: 22, type: 'close', data: {} });

    // Obszar treści pod paskiem zakładek — z rezerwą na leżący na nim zegar (TIME_STRIP_H).
    // Wartość contentH jest identyczna jak przed rozdzieleniem tła i treści: dawniej oh kończyło
    // się na górnej krawędzi zegara, dziś oh sięga nawigacji, a te same 20 px odejmujemy tutaj.
    const contentY = oy + TAB_H;
    const contentH = oh - TAB_H - TIME_STRIP_H;
    this._contentBounds = { x: ox, y: contentY, w: ow, h: contentH };

    // ── Pobierz dane ────────────────────────────────────────
    const vMgr = window.KOSMOS?.vesselManager;
    const ms   = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const allVessels = vMgr?.getAllVessels() ?? [];
    const activePid = colMgr?.activePlanetId;

    // ── Zawartość zależna od aktywnej zakładki ──────────────
    if (this._activeTab === 'tactical') {
      // REJESTR 2.0 (3e): PEŁNA szerokość + prawy panel szczegółów (parametr szerokości, nie globalna
      // stała — _drawRight i helpery liczą z parametru w). K7-pre: uśpiona mapa 2D usunięta (D-K-14/D-K-18).
      const rightW = REGISTRY_RIGHT_W;
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + ow - rightW, contentY); ctx.lineTo(ox + ow - rightW, contentY + contentH);
      ctx.stroke();
      this._drawRegistry(ctx, ox, contentY, ow - rightW, contentH, allVessels);
      this._drawRight(ctx, ox + ow - rightW, contentY, rightW, contentH, vMgr, ms, colMgr, activePid);
    } else if (this._activeTab === 'atlas') {
      this._drawAtlasCatalog(ctx, ox, contentY, ow, contentH, allVessels);
    } else if (this._activeTab === 'ground') {
      // Jednostki naziemne = prawa połowa UnitDesignOverlay (GroundUnitPanel),
      // osadzona jak edytor projektów w Stoczni. Panel ma własny scroll i layout
      // kotwiczony do dołu → dostaje pełną wysokość treści, bez triku BIG.
      const guW = Math.min(ow, 560);
      this._drawGroundTab(ctx, ox + Math.floor((ow - guW) / 2), contentY, guW, contentH);
    } else if (this._activeTab === 'logistics') {
      this._drawLogisticsTab(ctx, ox, contentY, ow, contentH, colMgr);
    }
  }

  // ── Zakładka LOGISTYKA (MVP Zlecenia Transportowe) ──────────────────────────
  // Dwukolumnowy layout (wzór TradeOverlay._drawMarket): lewa = builder zlecenia
  // (picker kolonii gracza + lista towarów z magazynu źródła + qty [−]N[+]),
  // prawa = aktywne zlecenia z paskami postępu per dobro + liczba statków + FIFO.
  _drawLogisticsTab(ctx, ox, oy, ow, oh, colMgr) {
    const LEFT_W = Math.min(460, Math.floor(ow * 0.5));
    // Separator kolumn
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.stroke();
    this._drawLogiBuilder(ctx, ox, oy, LEFT_W, oh, colMgr);
    this._drawLogiOrders(ctx, ox + LEFT_W, oy, ow - LEFT_W, oh, colMgr);
  }

  // Lewa kolumna — builder nowego zlecenia (źródło → cel → dobra → utwórz).
  // Zawartość (pickery + towary) jest PRZEWIJALNA (`_logiBuilderScrollY`); przycisk
  // „Utwórz" przypięty do dołu (zawsze widoczny/klikalny). Bez tego przy większej
  // liczbie kolonii/towarów przyciski +/− na dole były nieosiągalne.
  _drawLogiBuilder(ctx, x, y, w, h, colMgr) {
    const tos = window.KOSMOS?.transportOrderSystem;
    const pad = 14;
    const playerCols = colMgr?.getPlayerColonies?.() ?? [];
    const activePid = colMgr?.activePlanetId;

    // Domyślne źródło = aktywna kolonia gracza (jeśli jest na liście).
    if (!this._logiFrom && playerCols.some(c => c.planetId === activePid)) this._logiFrom = activePid;

    // Geometria: przycisk Utwórz przypięty do dołu, reszta przewijalna nad nim.
    const btnH = 30, by = y + h - btnH - 8;
    const scrollTop = y + 6;
    const viewH = (by - 6) - scrollTop;

    // Defensywny clamp scrolla wg poprzedniej klatki (gdy zawartość się skurczyła).
    const maxScrollPrev = Math.max(0, (this._logiBuilderContentH || 0) - viewH);
    this._logiBuilderScrollY = Math.max(0, Math.min(maxScrollPrev, this._logiBuilderScrollY || 0));
    const scrollY = this._logiBuilderScrollY;

    ctx.save();
    ctx.beginPath(); ctx.rect(x, scrollTop, w, viewH); ctx.clip();
    const hzStart = this._hitZones.length;   // do przycięcia hit-zon poza widokiem

    let cy = scrollTop - scrollY;
    // Podsumowanie puli.
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('transportOrder.poolSummary', tos?.getPool?.().length ?? 0), x + pad, cy + 10);
    cy += 24;

    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('transportOrder.newOrder'), x + pad, cy + 12);
    cy += 26;

    // ── Drop-down źródła / celu ──────────────────────────────────
    const drawColDropdownBtn = (label, selId, toggleType, cyStart) => {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + pad, cyStart + 10);
      const btnY = cyStart + 14, btnH = 22, btnW = w - pad * 2;
      let selName;
      if (selId) {
        const sc = colMgr?.getColony(selId);
        selName = `${_truncateStr(sc?.name ?? selId, 16)} · ${_truncateStr(this._sysName(sc?.systemId), 10)}`;
      } else {
        selName = t('transportOrder.pickColony');
      }
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(x + pad, btnY, btnW, btnH);
      ctx.strokeStyle = selId ? THEME.accent : THEME.border;
      ctx.lineWidth = 1; ctx.strokeRect(x + pad + 0.5, btnY + 0.5, btnW - 1, btnH - 1);
      ctx.fillStyle = selId ? THEME.accent : THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(selName, x + pad + 8, btnY + 15);
      ctx.textAlign = 'right';
      ctx.fillText('▾', x + pad + btnW - 8, btnY + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + pad, y: btnY, w: btnW, h: btnH, type: toggleType, data: {} });
      return btnY + btnH + 8;
    };
    cy = drawColDropdownBtn(t('transportOrder.from'), this._logiFrom, 'logi_from_dropdown_toggle', cy);
    cy = drawColDropdownBtn(t('transportOrder.to'),   this._logiTo,   'logi_to_dropdown_toggle',   cy);

    // ── Towary do przewiezienia (drop-down z pełnego katalogu) ───
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    ctx.fillText(t('transportOrder.goodsHeader'), x + pad, cy + 10);
    cy += 18;

    const srcCol = this._logiFrom ? colMgr?.getColony(this._logiFrom) : null;
    const srcInv = srcCol?.resourceSystem?.inventory;
    const srcAmount = (id) => (srcInv instanceof Map ? Math.floor(srcInv.get(id) ?? 0) : 0);

    // Przycisk otwierający drop-down (dodaj dowolny towar — surowiec LUB commodity).
    const ddH = 24;
    ctx.fillStyle = 'rgba(0,200,255,0.08)';
    ctx.fillRect(x + pad, cy, w - pad * 2, ddH);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1; ctx.strokeRect(x + pad + 0.5, cy + 0.5, w - pad * 2 - 1, ddH - 1);
    ctx.fillStyle = THEME.accent;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(t('transportOrder.addGood'), x + pad + 8, cy + 16);
    this._hitZones.push({ x: x + pad, y: cy, w: w - pad * 2, h: ddH, type: 'logi_good_dropdown_toggle', data: {} });
    cy += ddH + 6;

    // Lista wybranych towarów (każdy: nazwa · [−] N [+] · [✕]).
    const selected = Object.entries(this._logiGoods).filter(([, q]) => q > 0);
    if (selected.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(t('transportOrder.noGoodsSelected'), x + pad, cy + 12);
      cy += 20;
    } else {
      const rowH = 22, btnW = 22, qtyW = 34;
      for (const [id, qty] of selected) {
        const rmX  = x + w - pad - 18;
        const incX = rmX - 6 - btnW;
        const qtyX = incX - 4 - qtyW;
        const decX = qtyX - 4 - btnW;
        // Nazwa
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.textAlign = 'left';
        ctx.fillText(`${_cargoIcon(id)} ${_truncateStr(_cargoName(id), 11)}`, x + pad, cy + 15);
        // Podpowiedź „w magazynie" (jeśli źródło ma ten towar) — wyrównana do prawej przed [−]
        const inStock = srcAmount(id);
        if (inStock > 0) {
          ctx.fillStyle = THEME.textDim;
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.textAlign = 'right';
          ctx.fillText(t('transportOrder.inStock', inStock), decX - 6, cy + 15);
          ctx.textAlign = 'left';
        }
        // [−]
        this._drawMiniBtn(ctx, decX, cy, btnW, rowH - 2, '−', qty > 0);
        this._hitZones.push({ x: decX, y: cy, w: btnW, h: rowH - 2, type: 'logi_good_dec', data: { goodId: id } });
        // Pole ilości — KLIKANE (ręczne wpisanie, wzór safety stock)
        ctx.fillStyle = 'rgba(0,200,255,0.08)';
        ctx.fillRect(qtyX, cy, qtyW, rowH - 2);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1; ctx.strokeRect(qtyX + 0.5, cy + 0.5, qtyW - 1, rowH - 3);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.textAlign = 'center';
        ctx.fillText(String(qty), qtyX + qtyW / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: qtyX, y: cy, w: qtyW, h: rowH - 2, type: 'logi_good_qty_input',
          data: { goodId: id, boxCanvasX: qtyX, boxCanvasY: cy } });
        // [+]
        this._drawMiniBtn(ctx, incX, cy, btnW, rowH - 2, '+', true);
        this._hitZones.push({ x: incX, y: cy, w: btnW, h: rowH - 2, type: 'logi_good_inc', data: { goodId: id } });
        // [✕] usuń towar
        this._drawMiniBtn(ctx, rmX, cy, 18, rowH - 2, '✕', true);
        this._hitZones.push({ x: rmX, y: cy, w: 18, h: rowH - 2, type: 'logi_good_remove', data: { goodId: id } });
        cy += rowH + 3;
      }
    }

    // Wysokość zawartości (do clampu scrolla) + przycięcie hit-zon poza widokiem.
    this._logiBuilderContentH = (cy + scrollY) - scrollTop;
    this._logiBuilderViewH = viewH;
    ctx.restore();
    this._clipRightHitZones(hzStart, scrollTop, viewH);

    // Mini-pasek scrolla (gdy zawartość przekracza widok).
    if (this._logiBuilderContentH > viewH + 1) {
      const trackH = viewH, thumbH = Math.max(20, trackH * (viewH / this._logiBuilderContentH));
      const maxS = this._logiBuilderContentH - viewH;
      const thumbY = scrollTop + (trackH - thumbH) * (maxS > 0 ? (scrollY / maxS) : 0);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(x + w - 5, scrollTop, 3, trackH);
      ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = THEME.accent;
      ctx.fillRect(x + w - 5, thumbY, 3, thumbH); ctx.restore();
    }

    // ── Przycisk Utwórz (przypięty do dołu kolumny) ──────────────
    const totalGoods = Object.values(this._logiGoods).filter(q => q > 0).length;
    const canCreate = !!this._logiFrom && !!this._logiTo && this._logiFrom !== this._logiTo && totalGoods > 0;
    ctx.fillStyle = canCreate ? 'rgba(0,200,255,0.14)' : THEME.bgTertiary;
    ctx.fillRect(x + pad, by, w - pad * 2, btnH);
    ctx.strokeStyle = canCreate ? THEME.accent : THEME.border;
    ctx.lineWidth = 1; ctx.strokeRect(x + pad + 0.5, by + 0.5, w - pad * 2 - 1, btnH - 1);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = canCreate ? THEME.accent : THEME.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(t('transportOrder.createBtn', totalGoods), x + w / 2, by + 19);
    ctx.textAlign = 'left';
    if (canCreate) this._hitZones.push({ x: x + pad, y: by, w: w - pad * 2, h: btnH, type: 'logi_create', data: {} });

    // Drop-downy (kolonia LUB towar) — NAD wszystkim; hit-zony na końcu = priorytet.
    if (this._logiColDropdown) {
      this._drawLogiColDropdown(ctx, x, scrollTop, w, viewH, colMgr, playerCols);
      this._logiDropdownRect = null;
    } else if (this._logiGoodDropdownOpen) {
      this._drawLogiGoodDropdown(ctx, x, scrollTop, w, viewH, colMgr);
      this._logiColDropdownRect = null;
    } else {
      this._logiDropdownRect = null;
      this._logiColDropdownRect = null;
    }
  }

  // Panel drop-downu kolonii (źródło LUB cel wg `_logiColDropdown`). Wzór _drawLogiGoodDropdown.
  _drawLogiColDropdown(ctx, x, top, w, viewH, colMgr, playerCols) {
    const pad = 14;
    const px = x + pad, py = top + 2, pw = w - pad * 2, ph = viewH - 4;
    this._logiColDropdownRect = { x: px, y: py, w: pw, h: ph };
    const which = this._logiColDropdown;               // 'from' | 'to'
    const selId = which === 'from' ? this._logiFrom : this._logiTo;
    const oppId = which === 'from' ? this._logiTo   : this._logiFrom;

    ctx.fillStyle = 'rgba(8,14,22,0.98)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    this._hitZones.push({ x: px, y: py, w: pw, h: ph, type: 'logi_col_dropdown_bg', data: {} });

    const headH = 22;
    ctx.fillStyle = THEME.accentMed; ctx.fillRect(px, py, pw, headH);
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(which === 'from' ? t('transportOrder.pickSource') : t('transportOrder.pickTarget'), px + 8, py + 15);
    const clX = px + pw - 22;
    ctx.fillStyle = THEME.danger ?? '#ff4444';
    ctx.textAlign = 'center'; ctx.fillText('✕', clX + 8, py + 15); ctx.textAlign = 'left';
    this._hitZones.push({ x: clX, y: py, w: 22, h: headH, type: 'logi_col_dropdown_close', data: {} });

    const listY = py + headH, listH = ph - headH;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, listY, pw, listH); ctx.clip();
    const hzStart = this._hitZones.length;
    const rowH = 22;
    let ry = listY + 2 - (this._logiColDropdownScrollY || 0);
    for (let i = 0; i < playerCols.length; i++) {
      const c = playerCols[i];
      const isSel = c.planetId === selId;
      const isOpp = c.planetId === oppId;   // przeciwny koniec — niewybieralny
      ctx.fillStyle = isSel ? 'rgba(0,200,255,0.14)' : (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');
      ctx.fillRect(px + 2, ry, pw - 4, rowH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = isOpp ? THEME.textDim : (isSel ? THEME.accent : THEME.textSecondary);
      ctx.textAlign = 'left';
      const mark = isSel ? '● ' : (isOpp ? '· ' : '○ ');
      ctx.fillText(`${mark}${_truncateStr(c.name ?? c.planetId, 18)}`, px + 8, ry + 15);
      // Nazwa układu (prawa) — czytelne przy trasach warp.
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(_truncateStr(this._sysName(c.systemId), 12), px + pw - 10, ry + 15);
      ctx.textAlign = 'left';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      if (!isOpp) this._hitZones.push({ x: px + 2, y: ry, w: pw - 4, h: rowH, type: 'logi_col_pick', data: { which, colonyId: c.planetId } });
      ry += rowH;
    }
    this._logiColDropdownContentH = playerCols.length * rowH + 4;
    this._logiColDropdownViewH = listH;
    ctx.restore();
    this._clipRightHitZones(hzStart, listY, listH);
  }

  // DOM <input> ręcznego wpisania ilości towaru (wzór EconomyOverlay._openOneShotQtyInput).
  _openLogiQtyInput(goodId, canvasX, canvasY, kitBox = null) {
    this._closeLogiQtyInput();
    let sx, sy, sw, sh;
    if (kitBox) {
      // K7-C — konsola: prostokąt pola z rysunku strefy inspektora (`consoleZones`) × skala UI z ostatniego rysunku; bez `window.inner*`
      const css = searchInputCss({ x: canvasX, y: canvasY, w: kitBox.w, h: kitBox.h }, this._uiScale || 1);
      sx = css.left; sy = css.top; sw = css.width; sh = css.height;
    } else {
      const SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
      const boxW = 34, boxH = 20;
      sx = (canvasX ?? 100) * SCALE; sy = (canvasY ?? 100) * SCALE;
      sw = boxW * SCALE; sh = boxH * SCALE;
    }

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

  // Panel drop-downu — pełny katalog dóbr (surowce + commodities), scrollowalny.
  // Klik pozycji → dodaje towar (+10) i zamyka; [✕] zamyka. Wypełnia obszar buildera.
  _drawLogiGoodDropdown(ctx, x, top, w, viewH, colMgr) {
    const pad = 14;
    const px = x + pad, py = top + 2, pw = w - pad * 2, ph = viewH - 4;
    this._logiDropdownRect = { x: px, y: py, w: pw, h: ph };

    // Tło panelu + absorber (klik w puste miejsce panelu = nic; nie przebija do pickerów).
    ctx.fillStyle = 'rgba(8,14,22,0.98)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1; ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    this._hitZones.push({ x: px, y: py, w: pw, h: ph, type: 'logi_dropdown_bg', data: {} });

    // Nagłówek + [✕]
    const headH = 22;
    ctx.fillStyle = THEME.accentMed; ctx.fillRect(px, py, pw, headH);
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('transportOrder.pickGood'), px + 8, py + 15);
    const clX = px + pw - 22;
    ctx.fillStyle = THEME.danger ?? '#ff4444';
    ctx.textAlign = 'center'; ctx.fillText('✕', clX + 8, py + 15); ctx.textAlign = 'left';
    this._hitZones.push({ x: clX, y: py, w: 22, h: headH, type: 'logi_dropdown_close', data: {} });

    // Lista dóbr (scrollowalna).
    const listY = py + headH, listH = ph - headH;
    ctx.save();
    ctx.beginPath(); ctx.rect(px, listY, pw, listH); ctx.clip();
    const hzStart = this._hitZones.length;
    const rowH = 20;
    const srcInv = this._logiFrom ? colMgr?.getColony(this._logiFrom)?.resourceSystem?.inventory : null;
    const srcAmt = (id) => (srcInv instanceof Map ? Math.floor(srcInv.get(id) ?? 0) : 0);
    let ry = listY + 2 - (this._logiGoodDropdownScrollY || 0);
    for (let i = 0; i < _LOGI_GOOD_CATALOG.length; i++) {
      const id = _LOGI_GOOD_CATALOG[i];
      const already = (this._logiGoods[id] ?? 0) > 0;
      ctx.fillStyle = already ? 'rgba(0,200,255,0.12)' : (i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent');
      ctx.fillRect(px + 2, ry, pw - 4, rowH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = already ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(`${_cargoIcon(id)} ${_truncateStr(_cargoName(id), 22)}`, px + 8, ry + 14);
      const amt = srcAmt(id);
      if (amt > 0) {
        ctx.fillStyle = THEME.textDim;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(String(amt), px + pw - 10, ry + 14);
        ctx.textAlign = 'left';
      }
      this._hitZones.push({ x: px + 2, y: ry, w: pw - 4, h: rowH, type: 'logi_good_pick', data: { goodId: id } });
      ry += rowH;
    }
    this._logiDropdownContentH = _LOGI_GOOD_CATALOG.length * rowH + 4;
    this._logiDropdownViewH = listH;
    ctx.restore();
    this._clipRightHitZones(hzStart, listY, listH);
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

  _drawMiniBtn(ctx, x, y, w, h, label, enabled) {
    ctx.fillStyle = enabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = enabled ? THEME.border : 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = enabled ? THEME.textPrimary : THEME.textDim;
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  // Prawa kolumna — aktywne zlecenia z postępem per dobro.
  _drawLogiOrders(ctx, x, y, w, h, colMgr) {
    const tos = window.KOSMOS?.transportOrderSystem;
    const pad = 14;
    const orders = tos?.getOrders?.() ?? [];

    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(t('transportOrder.activeHeader', orders.length), x + pad, y + 16);

    const listY = y + 30, listH = h - 30;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, listY, w, listH); ctx.clip();
    let ry = listY + 4 - (this._logiOrdersScrollY || 0);

    if (orders.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('transportOrder.noneActive'), x + pad, ry + 14);
      ctx.restore();
      return;
    }

    const vMgr = window.KOSMOS?.vesselManager;
    const phaseLabel = (phase) => {
      switch (phase) {
        case 'hauling':   return t('transportOrder.phase_hauling');
        case 'to_origin': return t('transportOrder.phase_to_origin');
        case 'waiting':   return t('transportOrder.phase_waiting');
        default:          return t('transportOrder.phase_idle');
      }
    };
    const colName = (id) => _truncateStr(colMgr?.getColony(id)?.name ?? id, 14);
    let fifo = 0;
    for (const o of orders) {
      fifo++;
      const goodIds = Object.keys(o.goods);
      const assigns = o.assignments ?? [];
      const cardH = 30 + goodIds.length * 16 + (assigns.length ? assigns.length * 14 + 4 : 0) + 20;
      // Tło karty
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x + pad, ry, w - pad * 2, cardH);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1; ctx.strokeRect(x + pad + 0.5, ry + 0.5, w - pad * 2 - 1, cardH - 1);

      // Nagłówek: #N  [⚡] Źródło → Cel   [✕]
      const fromSys = colMgr?.getColony(o.fromColonyId)?.systemId;
      const toSys   = colMgr?.getColony(o.toColonyId)?.systemId;
      const cross   = fromSys && toSys && fromSys !== toSys;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = cross ? (THEME.warning ?? '#ffcc44') : THEME.textPrimary;
      ctx.fillText(`#${o.id}  ${cross ? '⚡ ' : ''}${colName(o.fromColonyId)} → ${colName(o.toColonyId)}`, x + pad + 8, ry + 16);
      // Przycisk anuluj
      const cxB = x + w - pad - 24;
      ctx.fillStyle = 'rgba(255,60,60,0.12)';
      ctx.fillRect(cxB, ry + 4, 20, 18);
      ctx.strokeStyle = THEME.danger ?? '#ff4444';
      ctx.strokeRect(cxB + 0.5, ry + 4.5, 19, 17);
      ctx.fillStyle = THEME.danger ?? '#ff4444';
      ctx.textAlign = 'center';
      ctx.fillText('✕', cxB + 10, ry + 17);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: cxB, y: ry + 4, w: 20, h: 18, type: 'logi_cancel', data: { orderId: o.id } });

      // Paski postępu per dobro
      let gy = ry + 26;
      for (const g of goodIds) {
        const total = o.goods[g] ?? 0;
        const done = o.delivered?.[g] ?? 0;
        const pct = total > 0 ? done / total : 0;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`${_cargoIcon(g)} ${_truncateStr(_cargoName(g), 8)}`, x + pad + 8, gy + 9);
        const barX = x + pad + 96, barW = w - pad * 2 - 96 - 70;
        // Pasek postępu (inline — FleetManagerOverlay nie dziedziczy BaseOverlay._drawBar).
        ctx.fillStyle = THEME.border;
        ctx.fillRect(barX, gy + 2, barW, 8);
        ctx.fillStyle = THEME.success ?? THEME.accent;
        ctx.fillRect(barX, gy + 2, Math.round(barW * Math.max(0, Math.min(1, pct))), 8);
        ctx.fillStyle = THEME.textDim;
        ctx.textAlign = 'right';
        ctx.fillText(`${done}/${total}`, x + w - pad - 8, gy + 9);
        ctx.textAlign = 'left';
        gy += 16;
      }

      // Statki wykonujące + ich etap
      if (assigns.length) {
        gy += 2;
        for (const a of assigns) {
          const v = vMgr?.getVessel?.(a.vesselId);
          const vName = _truncateStr(v?.name ?? a.vesselId, 14);
          const warping = v?.mission?.phase === 'warp_transit';   // skok warp między układami
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textSecondary;
          ctx.textAlign = 'left';
          ctx.fillText(`🚀 ${vName}`, x + pad + 8, gy + 10);
          ctx.fillStyle = warping ? (THEME.info ?? THEME.accent)
                        : a.phase === 'hauling' ? (THEME.success ?? THEME.accent)
                        : a.phase === 'waiting' ? (THEME.warning ?? '#ffcc44')
                        : THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(warping ? t('transportOrder.phase_warp') : phaseLabel(a.phase), x + w - pad - 8, gy + 10);
          ctx.textAlign = 'left';
          gy += 14;
        }
        gy += 2;
      }

      // Stopka: statki + pozycja FIFO
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const ships = assigns.length;
      ctx.fillText(t('transportOrder.orderFooter', ships, fifo), x + pad + 8, gy + 12);

      ry += cardH + 6;
    }

    this._logiOrdersContentH = ry - (listY + 4) + (this._logiOrdersScrollY || 0);
    this._logiOrdersViewH = listH;
    ctx.restore();
  }

  // ── Pasek zakładek (wzór EconomyOverlay) ────────────────────────────────────
  _drawTabBar(ctx, ox, oy, ow) {
    // Tytuł overlay (lewy)
    const title = t('fleet.tacticalCommandTitle');
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, ox + 12, oy + 19);
    const titleW = ctx.measureText(title).width;

    // Zakładki (od lewej po tytule)
    const tabs = [
      { id: 'tactical', label: t('fleet.tabTactical') },
      // C8 — 'shipyard' wyprowadzone do osobnego overlayu (nav-slot 🛠 / klawisz S).
      { id: 'ground',   label: t('fleet.tabGround') },
      { id: 'atlas',    label: t('fleet.tabAtlas') },
      // MVP Zlecenia Transportowe — zakładka tylko gdy funkcja włączona (kill-switch).
      ...(GAME_CONFIG.FEATURES?.transportOrders ? [{ id: 'logistics', label: t('fleet.tabLogistics') }] : []),
    ];
    const TW = 118, TH = 20, ty = oy + 4;
    let tx = ox + 12 + titleW + 24;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    for (const tab of tabs) {
      const active = this._activeTab === tab.id;
      ctx.fillStyle = active ? THEME.accentMed : 'transparent';
      ctx.fillRect(tx, ty, TW, TH);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, TW, TH);
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(tab.label, tx + TW / 2, ty + 14);
      this._hitZones.push({ x: tx, y: ty, w: TW, h: TH, type: 'tab', data: { tab: tab.id } });
      tx += TW + 4;
    }
    ctx.textAlign = 'left';

    // Separator pod paskiem
    ctx.strokeStyle = THEME.borderLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ox, oy + TAB_H);
    ctx.lineTo(ox + ow, oy + TAB_H);
    ctx.stroke();
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
      if (kitOn() && inRect(this._atlasKitRects?.insp)) {
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
      if (inRect(this._contentBounds)) {
        this._getDesignEditor()?._groundPanel?.handleScroll(delta, mx, my);
      }
      return true;
    }

    // ── LOGISTYKA — scroll buildera (lewa) LUB listy zleceń (prawa) wg kursora ─
    if (this._activeTab === 'logistics') {
      const cb = this._contentBounds;
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
      if (kitOn() && this._logiKitRects) {
        if (inRect(this._logiKitRects.list)) {
          this._logiOrdersScrollY = Math.max(0, Math.min(Math.max(0, (this._logiOrdersContentH || 0) - (this._logiOrdersViewH || 0)), (this._logiOrdersScrollY || 0) + delta * 0.5));
        } else if (inRect(this._logiKitRects.insp)) {
          this._logiBuilderScrollY = Math.max(0, Math.min(Math.max(0, (this._logiBuilderContentH || 0) - (this._logiBuilderViewH || 0)), (this._logiBuilderScrollY || 0) + delta * 0.5));
        }
        return true;
      }
      if (inRect(cb)) {
        const leftW = Math.min(460, Math.floor(cb.w * 0.5));
        if (mx < cb.x + leftW) {
          const maxB = Math.max(0, (this._logiBuilderContentH || 0) - (this._logiBuilderViewH || 0));
          this._logiBuilderScrollY = Math.max(0, Math.min(maxB, (this._logiBuilderScrollY || 0) + delta * 0.5));
        } else {
          const maxO = Math.max(0, (this._logiOrdersContentH || 0) - (this._logiOrdersViewH || 0));
          this._logiOrdersScrollY = Math.max(0, Math.min(maxO, (this._logiOrdersScrollY || 0) + delta * 0.5));
        }
      }
      return true;
    }

    // ── K7-A — konsola rejestru: przewijanie po strefach `consoleZones` (lista / tabela / pas = zoom osi / inspektor) ──
    if (kitOn() && this._cmdRects) {
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

    // ── TACTICAL (REJESTR) — scroll tabeli / zoom osi czasu (pivot = rok pod kursorem) ──
    const r = this._registryRects;
    if (r && inRect(r.timeline) && this._timelineYears) {
      const vp = { ...this._timelineYears, x0: r.timeline.vx0, x1: r.timeline.vx1 };
      const nv = zoomViewport(vp, delta > 0 ? 1.2 : 0.83, xToYear(mx, vp));
      this._timelineYears = { startYear: nv.startYear, endYear: nv.endYear };
      return true;
    }
    if (r && inRect(r.table)) {
      this._registryScroll = Math.max(0, this._registryScroll + delta * 0.5);
      return true;
    }
    // Scroll w RIGHT (panel szczegółów statku/floty, szerokość REJESTRU) — obejmuje TAKŻE konfigurator
    // misji (krok 'select' i 'confirm'): picker celów jest rysowany jako część przewijalnej treści
    // panelu, więc jeden `_rightScrollY` przewija całość.
    if (mx > b.x + b.w - REGISTRY_RIGHT_W && (this._selectedVesselId || this._selectedFleetId)) {
      this._applyRightScroll(delta);
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
    if (kitOn()) this._kitHoverZone = resolveStratcomZone(this._hitZones, mx, my) ?? null;

    // Hover na ciele (wiersze katalogu Atlasu)
    this._mapHoverBody = null;
    // ⚠ map_body ZOSTAJE pierwszo-trafieniowy (decyzja E4). Ma tę samą klasę rozjazdu co gwiazdy
    //   (Finding 159) — nie ruszamy go przy okazji.
    for (const z of this._hitZones) {
      if (z.type === 'map_body' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._mapHoverBody = { bodyId: z.data.bodyId, screenX: z.x + z.w / 2, screenY: z.y + z.h };
        break;
      }
    }
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
    // Edytor projektów osadzony w zakładce Stocznia — jego hity (select_hull,
    // select_slot, pick_module, save_template, edit/delete_template itd.) trafiają
    // do wspólnej tablicy _hitZones i są tu delegowane do instancji edytora.
    // Panel jednostek naziemnych (zakładka Jednostki) — UDO._onHit rozpakowuje prefix.
    if (zone.type?.startsWith('ground:')) {
      if (kitOn() && this._activeTab === 'ground') {
        // K7-C — konsola: rekrutacja celuje w kolonię strony; wybór kafla archetypu zdejmuje wybór jednostki
        if (zone.type === 'ground:select_tile') this._groundSelUnitId = null;
        this._withGroundColony(() => this._getDesignEditor()?._onHit(zone));
        return;
      }
      this._getDesignEditor()?._onHit(zone);
      return;
    }
    if (DESIGN_EDITOR_HIT_TYPES.has(zone.type)) {
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
        this._openRegistrySearch(zone);
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
        if (kitOn()) { this._focusVesselKit(zone.data.vesselId); break; }
        // 🎯 = zamknij overlay → (inny układ? przełącz kanałem STAR ATLAS) → dolot.
        const { vesselId, systemId } = zone.data;
        window.KOSMOS?.uiManager?.overlayManager?.closeActive?.();
        const activeSys = window.KOSMOS?.activeSystemId ?? 'sys_home';
        if (systemId && systemId !== activeSys) {
          window.KOSMOS?.starSystemManager?.switchActiveSystem?.(systemId);
        }
        this._setSelectedVesselViaUI(vesselId);
        EventBus.emit('vessel:focus', { vesselId });
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
          // M4 P2 — fly camera 3D do vessela. Dla wraków (deep-space lub orbital
          // graveyard) sprite.position jest już ustawione poprawnie, więc handler
          // vessel:focus w ThreeRenderer zrobi focusOnInstant prawidłowo.
          // K7-A (bramka właściciela) — na konsoli klik wiersza TYLKO zaznacza; kamerą rusza „POKAŻ” (`registryFocus`).
          if (!kitOn()) EventBus.emit('vessel:focus', { vesselId: zone.data.vesselId });
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
          this._mapHoverBody = null;
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
          this._mapHoverBody = null;
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
          (kitOn() && zone.data.boxW) ? { w: zone.data.boxW, h: zone.data.boxH } : null);
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
          this._mapHoverBody = null;
          // Przełącz na zakładkę taktyki żeby gracz widział nowy układ
          this._activeTab = 'tactical';
        }
        break;
      }
      case 'interstellar_redirect': {
        EventBus.emit('vessel:interstellarRedirect', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'interstellar_return': {
        // Powrót międzygwiezdny do macierzystego układu
        const vMgr3 = window.KOSMOS?.vesselManager;
        const v = vMgr3?.getVessel(zone.data.vesselId);
        if (v) {
          // Finding 125 — skok TRANSAKCYJNY + Z POWODEM. Komentarz, który tu stał
          // („dispatchInterstellar wymaga idle+docked"), był NIEPRAWDĄ: dyspozytor przyjmuje też
          // `orbiting` i nie patrzy na `status`. Fałszywy dok kosztował statek wszystkie rozkazy.
          const res = this._dispatchReturnJump(v, zone.data.fromSystemId);
          if (!res.ok) this._toastReturnFailed(res.reason);
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
      case 'foreign_redirect': {
        // Redirect do innego ciała w tym samym układzie (reuse interstellar redirect)
        EventBus.emit('vessel:interstellarRedirect', {
          vesselId: zone.data.vesselId,
          targetId: zone.data.targetId,
        });
        break;
      }
      case 'foreign_return':
      case 'foreign_return_from_recon': {
        // Powrót do macierzystego układu (skok warp)
        const vMgr4 = window.KOSMOS?.vesselManager;
        const v2 = vMgr4?.getVessel(zone.data.vesselId);
        if (v2) {
          // Przerwij rekon jeśli aktywny (POZA transakcją — sam ląduje statek na orbicie).
          if (v2.mission?.type === 'foreign_recon') {
            vMgr4.abortForeignRecon(zone.data.vesselId);
          }
          // Finding 125 — skok TRANSAKCYJNY + Z POWODEM (patrz ReturnJump.js).
          const res2 = this._dispatchReturnJump(v2, zone.data.fromSystemId);
          if (!res2.ok) this._toastReturnFailed(res2.reason);
        }
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
      case 'map_planet': {
        EventBus.emit('camera:focusTarget', { targetId: zone.data.planetId });
        break;
      }
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

  // RIGHT panel — szczegóły wybranej floty (gdy activeTab='fleets' i fleet selected).
  _drawRightFleet(ctx, x, y, w, h, fleet) {
    const pad = 8;
    let cy = y + pad;

    // Powrót do listy
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const backLabel = '← ' + t('fleet.backToFleetList');
    ctx.fillText(backLabel, x + pad, cy + 10);
    const backW = ctx.measureText(backLabel).width + 4;
    this._hitZones.push({ x: x + pad - 2, y: cy, w: backW, h: 16, type: 'fleetBackToList', data: {} });
    cy += 22;

    // Nazwa + ✎ rename
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    const nameTxt = fleet.name.length > 14 ? fleet.name.slice(0, 13) + '…' : fleet.name;
    ctx.fillText(nameTxt, x + pad, cy + 14);
    const renX = x + pad + ctx.measureText(nameTxt).width + 8;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✎', renX, cy + 14);
    this._hitZones.push({ x: renX - 2, y: cy + 2, w: 14, h: 16, type: 'fleetRename', data: { fleetId: fleet.id } });
    cy += 24;

    // ── P2 — Status floty + przyciski rozkazów ──────────────────────────
    const fleetStatus = this._computeFleetStatus(fleet);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('fleet.statusLabel') + ': ', x + pad, cy + 10);
    const labelW = ctx.measureText(t('fleet.statusLabel') + ': ').width;
    ctx.fillStyle = fleetStatus.color;
    ctx.fillText(fleetStatus.label, x + pad + labelW, cy + 10);
    cy += 16;

    // Order buttons (2×2 grid) — Move/Engage/Return/Cancel
    const oBtnW = (w - pad * 3) / 2;
    const oBtnH = 22;
    const hasOrder = !!fleet.activeOrder;
    const engagePickActive = this._fleetEngagePickMode?.fleetId === fleet.id;
    const orderButtons = [
      { id: 'fleetMoveToPoint', label: '🎯 ' + t('fleet.orderMove'),   enabled: true,     bg: 'rgba(255,170,30,0.12)', fg: THEME.warning },
      { id: 'fleetEngage',      label: (engagePickActive ? '⏳ ' : '⚔ ') + t('fleet.orderEngage'),
                                  enabled: true,
                                  bg: engagePickActive ? 'rgba(255,68,102,0.30)' : 'rgba(255,68,102,0.10)',
                                  fg: THEME.danger },
      { id: 'fleetReturnBase',  label: '⏎ ' + t('fleet.orderReturn'), enabled: true,     bg: 'rgba(0,255,180,0.10)',  fg: THEME.accent },
      { id: 'fleetCancelOrder', label: '✕ ' + t('fleet.orderCancel'), enabled: hasOrder, bg: 'rgba(128,128,128,0.10)', fg: THEME.textDim },
    ];
    for (let i = 0; i < orderButtons.length; i++) {
      const btn = orderButtons[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = x + pad + col * (oBtnW + pad);
      const by = cy + row * (oBtnH + 4);
      ctx.fillStyle = btn.enabled ? btn.bg : 'rgba(20,30,45,0.4)';
      ctx.fillRect(bx, by, oBtnW, oBtnH);
      ctx.strokeStyle = btn.enabled ? btn.fg : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, oBtnW, oBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = btn.enabled ? btn.fg : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, bx + oBtnW / 2, by + 15);
      ctx.textAlign = 'left';
      if (btn.enabled) {
        this._hitZones.push({ x: bx, y: by, w: oBtnW, h: oBtnH, type: btn.id, data: { fleetId: fleet.id } });
      }
    }
    cy += oBtnH * 2 + 8;

    // P2.5 polish — Pick mode hint (stały, w panelu, gdy aktywny).
    // Toast jest transient (znika), gracz potrzebuje też trwałego wskazania
    // żeby pamiętać że pick mode wciąż aktywny i jak go anulować.
    if (engagePickActive) {
      const hintH = 36;
      ctx.fillStyle = 'rgba(255,68,102,0.10)';
      ctx.fillRect(x + pad, cy, w - pad * 2, hintH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, w - pad * 2, hintH);
      ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('⏳ ' + t('fleet.pickModeActive'), x + pad + 6, cy + 13);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.pickModeHint'), x + pad + 6, cy + 28);
      cy += hintH + 6;
    }

    // Doctrine — 4 mini-buttony stacked
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('fleet.doctrineLabel'), x + pad, cy + 10);
    cy += 16;
    const dBtnH = 20;
    for (const doctrine of ALL_DOCTRINES) {
      const active = fleet.doctrine === doctrine;
      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : 'rgba(20,30,45,0.6)';
      ctx.fillRect(x + pad, cy, w - pad * 2, dBtnH);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, w - pad * 2, dBtnH);
      ctx.font = `${active ? 'bold ' : ''}${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.fillText(t(doctrineNameKey(doctrine)), x + pad + 6, cy + 14);
      this._hitZones.push({ x: x + pad, y: cy, w: w - pad * 2, h: dBtnH, type: 'fleetSetDoctrine', data: { fleetId: fleet.id, doctrine } });
      cy += dBtnH + 2;
    }
    cy += 6;

    // P3 — retreat threshold slider (tylko gdy doctrine === 'retreat_at_50').
    if (fleet.doctrine === 'retreat_at_50') {
      const thr = (typeof fleet.retreatThreshold === 'number')
        ? fleet.retreatThreshold : 0.5;
      const pct = Math.round(thr * 100);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.retreatThreshold.label') + ':', x + pad, cy + 10);
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, x + w - pad, cy + 10);
      ctx.textAlign = 'left';
      cy += 14;

      // Slider track
      const sliderX = x + pad;
      const sliderY = cy + 4;
      const sliderW = w - pad * 2;
      const sliderH = 10;
      ctx.fillStyle = 'rgba(20,30,45,0.8)';
      ctx.fillRect(sliderX, sliderY, sliderW, sliderH);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(sliderX, sliderY, sliderW, sliderH);
      // Fill (0.05 → 0.95 range)
      const normFrac = Math.max(0, Math.min(1, (thr - 0.05) / 0.9));
      ctx.fillStyle = 'rgba(0,255,180,0.40)';
      ctx.fillRect(sliderX + 1, sliderY + 1, (sliderW - 2) * normFrac, sliderH - 2);
      // Handle
      const handleX = sliderX + (sliderW - 2) * normFrac;
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(handleX - 2, sliderY - 2, 4, sliderH + 4);
      // Hit zone (cały slider — klik mapuje x na threshold)
      this._hitZones.push({
        x: sliderX, y: sliderY - 4, w: sliderW, h: sliderH + 8,
        type: 'fleetRetreatThreshold',
        data: { fleetId: fleet.id, sliderX, sliderW },
      });
      cy += sliderH + 8;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // Members
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('fleet.fleetMembers') + ` [${fleet.memberIds.length}]`, x + pad, cy + 10);
    cy += 18;
    const vMgr = window.KOSMOS?.vesselManager;
    if (fleet.memberIds.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.fleetMembersEmpty'), x + pad, cy + 10);
      return;
    }
    const ROW = 18;
    const listMaxY = y + h - pad;
    const ao = fleet.activeOrder;
    for (const vid of fleet.memberIds) {
      if (cy + ROW > listMaxY) break;
      const v = vMgr?.getVessel?.(vid);
      const vName = v?.name ?? vid;
      const statusCol = v ? (STATUS_COLORS[resolveVesselStatus(v).token]?.() ?? THEME.textSecondary) : THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = statusCol;
      const dispName = vName.length > 14 ? vName.slice(0, 13) + '…' : vName;
      ctx.fillText('• ' + dispName, x + pad, cy + 12);
      // Badge: [fleet] gdy member ma orderId odpowiadający fleet.activeOrder; [own]
      // gdy ma własny order (diverged — player override); [—] gdy idle.
      let badge = null; let badgeCol = THEME.textDim;
      if (v?.movementOrder) {
        const trackedOrderId = ao?.memberOrderIds?.[vid];
        if (trackedOrderId && v.movementOrder.id === trackedOrderId) {
          badge = '[fleet]'; badgeCol = THEME.accent;
        } else {
          badge = '[own]'; badgeCol = THEME.warning;
        }
      }
      if (badge) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = badgeCol;
        ctx.textAlign = 'right';
        ctx.fillText(badge, x + w - pad, cy + 12);
        ctx.textAlign = 'left';
      }
      // Klik wiersza → select vessel (przełącza na vessels tab i pokazuje vessel detail)
      this._hitZones.push({ x: x + pad, y: cy, w: w - pad * 2, h: ROW, type: 'fleetMemberSelect', data: { vesselId: vid } });
      cy += ROW;
    }
  }

  // ═══ F3 (Obraz Operacyjny) — REJESTR K3: tabela + oś czasu ═══════════════
  // Pod-widok centrum zakładki tactical. Wiersze WYŁĄCZNIE z FleetRegistryLogic
  // (buildShipEntry), paski osi WYŁĄCZNIE z buildTimelineRows (te same dane co
  // duchy ETA trybu Y). Oś READ-ONLY — rozkazy tylko mapa/PPM (plan §0).

  // Ucinanie px-owe do szerokości kolumny (font ustawiony na ctx wcześniej).
  _truncate(ctx, text, maxW) {
    const s0 = String(text ?? '');
    if (ctx.measureText(s0).width <= maxW) return s0;
    let s = s0;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

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

  _drawRegistry(ctx, x, y, w, h, allVessels) {
    const pad = 8;
    const rowH = 24;                                    // gęstość wg planu §5
    const regCtx = this._registryCtx();
    const gameYear = regCtx.pictureCtx.gameYear;

    const rowsAll = buildRegistryRows(allVessels, regCtx);
    const rowsFiltered = filterRows(rowsAll, this._registryFilter);
    const rows = sortRows(rowsFiltered, this._registrySort.col, this._registrySort.dir);

    // ── Chipy filtrów (układy + 🌀 tranzyt, role) + szukajka ──
    let cy = y + 26;
    ctx.font = `9px ${THEME.fontFamily}`;
    let cx = x + pad;
    const chip = (label, active, type, data, color = THEME.textSecondary) => {
      const tw = ctx.measureText(label).width + 10;
      if (cx + tw > x + w - 130) return;                 // nie wyjeżdżaj na szukajkę
      ctx.fillStyle = active ? 'rgba(0,255,180,0.14)' : 'rgba(255,255,255,0.04)';
      ctx.fillRect(cx, cy, tw, 15);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.strokeRect(cx + 0.5, cy + 0.5, tw - 1, 14);
      ctx.fillStyle = active ? THEME.accent : color;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx + tw / 2, cy + 10.5);
      this._hitZones.push({ x: cx, y: cy, w: tw, h: 15, type, data });
      cx += tw + 4;
    };
    // 3e — przełącznik grupowania: „grupuj: — / ⚑ flota / układ"
    chip(t('registry.groupNone'), this._registryGroupMode === 'none', 'registryGroupMode', { mode: 'none' });
    chip(t('registry.groupFleet'), this._registryGroupMode === 'fleet', 'registryGroupMode', { mode: 'fleet' });
    chip(t('registry.groupSystem'), this._registryGroupMode === 'system', 'registryGroupMode', { mode: 'system' });
    cx += 8;
    for (const c of collectSystemChoices(rowsAll)) {
      chip(c.isTransit ? t('registry.transit') : c.name,
           this._registryFilter.systemKey === c.key, 'registryChipSystem', { key: c.key });
    }
    cx += 6;
    for (const role of collectRoleChoices(rowsAll.filter(r => r.kind === 'own'))) {
      chip(t(`fleetPicture.role.${role}`), this._registryFilter.role === role,
           'registryChipRole', { role });
    }
    // 3f — sekcje WRAKI/KONTAKTY (domyślnie odfiltrowane; chip pokazuje licznik).
    cx += 6;
    const nWrecks = rowsAll.filter(r => r.kind === 'wreck').length;
    const nContacts = rowsAll.filter(r => r.kind === 'contact').length;
    if (nWrecks > 0) {
      chip(`💀 ${t('registry.wrecks')} ×${nWrecks}`, this._registryFilter.showWrecks,
           'registryChipKind', { field: 'showWrecks' }, THEME.textDim);
    }
    if (nContacts > 0) {
      chip(`👁 ${t('registry.contacts')} ×${nContacts}`, this._registryFilter.showContacts,
           'registryChipKind', { field: 'showContacts' }, THEME.danger);
    }
    // Szukajka (DOM input po kliku — adaptacja TradeOverlay._openQtyInput).
    const sw = 118, sx = x + w - pad - sw;
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(sx, cy, sw, 15);
    ctx.strokeStyle = this._registrySearchEl ? THEME.accent : THEME.border;
    ctx.strokeRect(sx + 0.5, cy + 0.5, sw - 1, 14);
    ctx.textAlign = 'left';
    ctx.fillStyle = this._registryFilter.search ? THEME.textPrimary : THEME.textDim;
    ctx.fillText(`🔍 ${this._registryFilter.search || t('registry.searchPlaceholder')}`,
                 sx + 4, cy + 10.5);
    this._hitZones.push({ x: sx, y: cy, w: sw - 14, h: 15, type: 'registrySearch', data: {} });
    if (this._registryFilter.search) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('✕', sx + sw - 10, cy + 10.5);
      this._hitZones.push({ x: sx + sw - 14, y: cy, w: 14, h: 15, type: 'registrySearchClear', data: {} });
    }
    ctx.textAlign = 'left';

    // ── Fix 1 (#registry-assign-bar) — pasek „Przypisz (N)" jako element
    // REJESTRU (niezależny od ukrytej lewej listy); TE SAME handlery co dotąd
    // (fleetAssignMenuOpen → showFleetAssignModal bulk-assign; ✕ → clear).
    let assignH = 0;
    const multiCount = this._multiSelectedIds.size;
    if (multiCount > 0) {
      const barY = cy + 19;
      assignH = 22;
      ctx.fillStyle = 'rgba(0,255,180,0.10)';
      ctx.fillRect(x + pad, barY, w - pad * 2, 18);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad + 0.5, barY + 0.5, w - pad * 2 - 1, 17);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      const assignLabel = t('fleet.assignSelectedTo') + ` (${multiCount}) ▼`;
      ctx.fillText(assignLabel, x + pad + 6, barY + 13);
      const labelW = ctx.measureText(assignLabel).width + 10;
      this._hitZones.push({ x: x + pad, y: barY, w: labelW, h: 18, type: 'fleetAssignMenuOpen', data: {} });
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'right';
      ctx.fillText('✕', x + w - pad - 6, barY + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + w - pad - 18, y: barY, w: 14, h: 18, type: 'fleetClearMultiSelect', data: {} });
    }

    // ── Nagłówki kolumn (sort klikiem) ──
    const hy = cy + 21 + assignH;
    const cols = this._registryColumnRects(x + pad, w - pad * 2);
    ctx.font = `bold 9px ${THEME.fontFamily}`;
    for (const c of cols) {
      const sorted = this._registrySort.col === c.id;
      ctx.fillStyle = sorted ? THEME.accent : THEME.textSecondary;
      ctx.fillText(`${t(`registry.col_${c.id}`)}${sorted ? (this._registrySort.dir > 0 ? ' ▲' : ' ▼') : ''}`,
                   c.x, hy + 10);
      this._hitZones.push({ x: c.x, y: hy, w: c.w, h: 14, type: 'registrySort', data: { col: c.id } });
    }
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, hy + 15.5); ctx.lineTo(x + w - pad, hy + 15.5); ctx.stroke();

    // ── Obszary: tabela + oś czasu ──
    const timelineH = this._timelineCollapsed ? 18 : Math.floor(h * 0.32);
    const tableY = hy + 18;
    const tableH = h - (tableY - y) - timelineH - 4;
    this._registryRects = {
      table:    { x, y: tableY, w, h: tableH },
      timeline: { x, y: y + h - timelineH, w, h: timelineH, vx0: x + pad + 110, vx1: x + w - pad },
    };

    // ── Wiersze + grupy (3e: groupRows — sort wewnątrz grup = sort tabeli) ──
    const { items, visibleRows } = groupRows(rows, this._registryGroupMode,
                                             this._registryCollapsedGroups);
    const maxScroll = Math.max(0, items.length * rowH - tableH);
    if (this._registryScroll > maxScroll) this._registryScroll = maxScroll;
    // 4d (Dok 🎯) — jednorazowy scroll rejestru do wybranego statku po open({focusVesselId}).
    if (this._pendingFocusVesselId) {
      const idx = items.findIndex((it) => it.type === 'row' && it.row?.id === this._pendingFocusVesselId);
      if (idx >= 0) {
        const top = idx * rowH;
        if (top < this._registryScroll) this._registryScroll = top;
        else if (top + rowH > this._registryScroll + tableH) this._registryScroll = top + rowH - tableH;
        this._registryScroll = Math.max(0, Math.min(maxScroll, this._registryScroll));
      }
      this._pendingFocusVesselId = null;
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x, tableY, w, tableH); ctx.clip();
    const selId = window.KOSMOS?.uiManager?.getSelectedVesselId?.();
    const selFleetId = window.KOSMOS?.uiManager?.getSelectedFleetId?.();
    let ry = tableY - this._registryScroll;
    for (const it of items) {
      if (ry + rowH >= tableY && ry <= tableY + tableH) {
        if (it.type === 'header') {
          this._drawRegistryGroupHeader(ctx, x + pad, ry, w - pad * 2, rowH, it, selFleetId);
        } else {
          this._drawRegistryRow(ctx, cols, x + pad, ry, w - pad * 2, rowH, it.row, selId, gameYear);
        }
      }
      ry += rowH;
    }
    ctx.restore();
    if (items.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('registry.empty'), x + w / 2, tableY + 30);
      ctx.textAlign = 'left';
    }

    // ── Oś czasu (READ-ONLY) — przejmuje kolejność i grupowanie tabeli ──
    this._drawTimelinePanel(ctx, this._registryRects.timeline, visibleRows, allVessels, gameYear);
  }

  // Kolumny: name flex; reszta stała. Zwraca [{id,x,w}].
  _registryColumnRects(x0, totalW) {
    const fixed = { role: 54, fleet: 80, system: 66, body: 76, state: 62, activity: 96, from: 78, to: 82, eta: 42, fuel: 38, alerts: 28 };
    const fixedSum = Object.values(fixed).reduce((a, b) => a + b, 0) + 20 /*🎯*/ + 18 /*checkbox*/;
    const nameW = Math.max(90, totalW - fixedSum);
    const out = [];
    let cx = x0 + 18;   // miejsce na checkbox
    for (const id of REGISTRY_COLUMNS) {
      const w = id === 'name' ? nameW : fixed[id];
      out.push({ id, x: cx, w });
      cx += w;
    }
    return out;
  }

  // 3e — nagłówek grupy (⚑ flota / układ / „Bez floty" / 🌀): caret zwija,
  // klik reszty nagłówka FLOTY = setSelectedFleetId → prawy panel floty
  // (rename/disband/rozkazy pozostają osiągalne — nic nie jest ekskluzywne dla lewej listy).
  _drawRegistryGroupHeader(ctx, x, ry, w, rowH, it, selFleetId) {
    const isFleetHeader = it.fleetId != null;
    const selected = isFleetHeader && it.fleetId === selFleetId;
    ctx.fillStyle = selected ? 'rgba(0,255,180,0.10)' : 'rgba(255,255,255,0.045)';
    ctx.fillRect(x - 4, ry + 1, w + 8, rowH - 2);
    ctx.font = `bold 10px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(it.collapsed ? '▸' : '▾', x + 2, ry + rowH / 2 + 3.5);
    const label = it.isTransit ? t('registry.transit')
      : it.label ?? (isFleetHeader === false && it.key === UNGROUPED_KEY
        ? t('registry.ungrouped') : (it.label ?? t('registry.ungrouped')));
    ctx.fillStyle = selected ? THEME.accent : (isFleetHeader ? THEME.accent : THEME.textSecondary);
    ctx.fillText(`${isFleetHeader ? '⚑ ' : ''}${this._truncate(ctx, label, w - 90)}  ×${it.count}`,
                 x + 16, ry + rowH / 2 + 3.5);
    // caret = zwijanie; reszta = selekcja floty (dla grup flotowych) lub też zwijanie
    this._hitZones.push({ x: x - 4, y: ry, w: 16, h: rowH, type: 'registryGroupToggle', data: { key: it.key } });
    if (isFleetHeader) {
      this._hitZones.push({ x: x + 14, y: ry, w: w - 14, h: rowH, type: 'registryGroupFleet',
        data: { fleetId: it.fleetId } });
    } else {
      this._hitZones.push({ x: x + 14, y: ry, w: w - 14, h: rowH, type: 'registryGroupToggle',
        data: { key: it.key } });
    }
  }

  _drawRegistryRow(ctx, cols, x, ry, w, rowH, r, selId, gameYear) {
    const isSel = r.id === selId;
    const isMulti = this._multiSelectedIds.has(r.id);
    const kind = r.kind ?? 'own';
    if (isSel) {
      ctx.fillStyle = 'rgba(0,255,180,0.08)';
      ctx.fillRect(x - 4, ry, w + 8, rowH);
    }
    // checkbox tylko dla WŁASNYCH żywych (wraki/kontakty = read-only)
    if (kind === 'own') {
      ctx.strokeStyle = isMulti ? THEME.accent : THEME.border;
      ctx.strokeRect(x + 1.5, ry + 7.5, 9, 9);
      if (isMulti) { ctx.fillStyle = THEME.accent; ctx.fillRect(x + 3.5, ry + 9.5, 5, 5); }
      this._hitZones.push({ x: x, y: ry + 4, w: 14, h: 16, type: 'vesselMultiToggle', data: { vesselId: r.id } });
    }

    const tone = kind === 'contact' ? THEME.danger
      : kind === 'wreck' ? THEME.textDim
      : (toneColor(r.tone, THEME) ?? THEME.textPrimary);
    ctx.font = `10px ${THEME.fontFamily}`;
    const cell = (colId, text, color = THEME.textSecondary, bold = false) => {
      const c = cols.find(k => k.id === colId);
      if (!c) return;
      ctx.font = `${bold ? 'bold ' : ''}10px ${THEME.fontFamily}`;
      ctx.fillStyle = color;
      ctx.fillText(this._truncate(ctx, text, c.w - 8), c.x, ry + rowH / 2 + 3.5);
    };
    cell('name', `${r.glyph} ${r.name}`, tone, true);
    cell('role', kind === 'wreck' ? t(r.isEnemy ? 'registry.enemyShort' : 'registry.ownShort')
      : (r.role ? t(`fleetPicture.role.${r.role}`) : '—'));
    cell('fleet', r.fleetName ?? '—');
    cell('system', r.isTransit ? t('registry.transit') : (r.systemName ?? ''), r.isTransit ? THEME.info : THEME.textSecondary);
    cell('body', r.body ?? (kind === 'own' ? t('registry.bodyTransit') : '—'),
      r.body ? THEME.textSecondary : THEME.textDim);
    cell('state', r.stateKey ? t(r.stateKey) : '—');
    cell('activity', kind === 'wreck'
      ? (r.wreckedYear != null ? `☠ ${t('registry.wreckYear', Math.floor(r.wreckedYear))}` : '—')
      : (r.activityKey ? `${t(r.activityKey)}${r.isLoop ? ' ↻' : ''}` : '—'));
    cell('from', r.fromName ?? '—');
    cell('to', r.toName ?? '—');
    cell('eta', r.eta.year === null ? '—'
      : `${r.eta.confidence === 'moving' ? '~' : ''}${Math.round(r.eta.year)}`,
      r.eta.confidence === 'moving' ? THEME.warning : THEME.textSecondary);
    cell('fuel', r.fuelPct === null ? '—' : `${Math.round(r.fuelPct * 100)}%`,
      r.fuelPct !== null && r.fuelPct < 0.2 ? THEME.danger : THEME.textSecondary);
    cell('alerts', r.alertCount > 0 ? `⚠${r.alertCount}` : '', THEME.warning);

    // 3f — KONTAKTY: zero akcji (bez selekcji/checkboxa/🎯 — czysty read-only).
    if (kind === 'contact') return;
    // wiersz klikalny = selekcja wspólna (wrak → prawy panel z raportem bitwy)
    this._hitZones.push({ x: x + 16, y: ry, w: w - 40, h: rowH, type: 'vessel', data: { vesselId: r.id } });
    // 🎯 — dolot (dla tranzytu i wraków bez sprite'a brak sensu; wraki mają klawisz K)
    if (!r.isTransit && kind === 'own') {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('🎯', x + w - 16, ry + rowH / 2 + 3.5);
      this._hitZones.push({ x: x + w - 20, y: ry, w: 20, h: rowH, type: 'registryFocus',
        data: { vesselId: r.id, systemId: r.systemId } });
    }
  }

  // Oś czasu: gutter nazw + paski z buildTimelineRows (kolory jak linie tras mapy).
  _drawTimelinePanel(ctx, rect, rows, allVessels, gameYear) {
    const { x, y, w, h } = rect;
    this._timelineBarZones = [];
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x, y + 0.5); ctx.lineTo(x + w, y + 0.5); ctx.stroke();
    // Nagłówek + zwijanie
    ctx.font = `bold 9px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${this._timelineCollapsed ? '▸' : '▾'} ${t('registry.timeline')}`, x + 8, y + 13);
    this._hitZones.push({ x, y, w: 120, h: 17, type: 'timelineCollapse', data: {} });
    if (this._timelineCollapsed) return;

    if (!this._timelineYears) {
      const d = defaultViewport(gameYear, 0, 1);
      this._timelineYears = { startYear: d.startYear, endYear: d.endYear };
    }
    const vp = { ...this._timelineYears, x0: rect.vx0, x1: rect.vx1 };

    // Podziałka + linia „teraz"
    ctx.font = `8px ${THEME.fontFamily}`;
    for (const tick of timelineTicks(vp)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.moveTo(tick.x, y + 17); ctx.lineTo(tick.x, y + h - 2); ctx.stroke();
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(tick.year * 100) / 100), tick.x, y + 13);
    }
    ctx.textAlign = 'left';
    const nx = nowLineX(gameYear, vp);
    if (nx !== null) {
      ctx.strokeStyle = THEME.accent;
      ctx.beginPath(); ctx.moveTo(nx, y + 5); ctx.lineTo(nx, y + h - 2); ctx.stroke();
    }

    // Wiersze = PRZEFILTROWANA lista tabeli (spójność tabela↔oś); scroll dzielony.
    const laneH = 15;
    const vesselById = new Map((allVessels ?? []).map(v => [v.id, v]));
    const tlVessels = rows.map(r => vesselById.get(r.id)).filter(Boolean);
    const tlRows = buildTimelineRows(tlVessels, window.KOSMOS?.fleetSystem?.listFleets?.() ?? [], gameYear);
    const laid = layoutTimelineRows(tlRows, vp);
    const startIdx = Math.floor(this._registryScroll / 24);
    const visLanes = Math.floor((h - 20) / laneH);
    const KIND_COLOR = (kind) =>
      kind === 'warp' ? THEME.info
      : kind === 'return' ? 'rgba(255,255,255,0.35)'
      : kind.startsWith('mission-recon') || kind.startsWith('mission-survey') || kind.startsWith('mission-deep') ? 'rgba(0,204,255,0.75)'
      : kind.startsWith('mission-colony') ? 'rgba(170,136,255,0.75)'
      : kind.startsWith('mission-transport') ? 'rgba(255,204,68,0.75)'
      : 'rgba(160,200,190,0.6)';
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y + 17, w, h - 19); ctx.clip();
    for (let i = startIdx; i < Math.min(laid.length, startIdx + visLanes + 1); i++) {
      const lane = laid[i];
      const ly = y + 19 + (i - startIdx) * laneH;
      const row = rows[i];
      ctx.font = `8px ${THEME.fontFamily}`;
      ctx.fillStyle = row?.id === window.KOSMOS?.uiManager?.getSelectedVesselId?.()
        ? THEME.accent : THEME.textDim;
      ctx.fillText(this._truncate(ctx, row?.name ?? '', 100), x + 8, ly + 9);
      for (const b of lane.bars) {
        ctx.fillStyle = KIND_COLOR(b.kind);
        ctx.globalAlpha = lane.confidence === 'moving' ? 0.55 : 0.9;
        ctx.fillRect(b.x0, ly + 2, Math.max(2, b.x1 - b.x0), laneH - 5);
        ctx.globalAlpha = 1;
        const zone = { x: b.x0, y: ly + 2, w: Math.max(2, b.x1 - b.x0), h: laneH - 5,
          labelKey: b.labelKey, vesselId: lane.entryId, kind: b.kind };
        this._timelineBarZones.push(zone);
        this._hitZones.push({ ...zone, type: 'timelineBar', data: { vesselId: lane.entryId } });
      }
    }
    ctx.restore();

    // Hover-tooltip paska (READ-ONLY info)
    const mx = this._regMouseX, my = this._regMouseY;
    const hov = this._timelineBarZones.find(z =>
      mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h);
    if (hov) {
      const label = t(hov.labelKey);
      ctx.font = `9px ${THEME.fontFamily}`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(8,12,20,0.92)';
      ctx.fillRect(mx + 10, my - 18, tw, 15);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(mx + 10.5, my - 17.5, tw - 1, 14);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(label, mx + 15, my - 7.5);
    }
  }

  // Wyszukiwarka rejestru — inline DOM input NAD polem canvasa (adaptacja
  // wzorca TradeOverlay._openQtyInput; żyje tylko w widoku REJESTR).
  _openRegistrySearch(zone) {
    this._closeRegistrySearch();
    // K7-A — konsola: prostokąt pola ze strefy listy (`consoleZones`) i skala z ostatniego rysunku (`uiViewport`)
    const kitRect = kitOn() ? this._cmdRects?.search : null;
    if (kitRect) { this._openRegistrySearchKit(kitRect); return; }
    const SCALE = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this._registryFilter.search;
    Object.assign(input.style, {
      position: 'fixed',
      left: `${zone.x * SCALE}px`, top: `${zone.y * SCALE}px`,
      width: `${(zone.w + 14) * SCALE}px`, height: `${16 * SCALE}px`,
      zIndex: '300', background: '#0a1016', color: '#cfeee4',
      border: '1px solid #2a4a44', font: `${Math.round(10 * SCALE)}px monospace`,
      padding: '0 4px', outline: 'none',
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
   * bez `window.inner*`). Poza konsolą rejestru (flaga OFF, inne zakładki) → null = dzisiejsze okno na środku ekranu.
   */
  _dialogAnchor(zoneKey = 'inspector', { anyTab = false, minWcss = 0 } = {}) {
    // K7-C (751): `anyTab` — strony Atlas / Logistyka / Jednostki też są konsolą; `minWcss` — szerokość okna, które nie
    // zmieści się w strefie (okno ładunku 440 px, raport ciała 520 px CSS) — dosunięte do prawej krawędzi ramy
    if (!kitOn() || (!anyTab && (this._activeTab ?? 'tactical') !== 'tactical')) return null;
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

  _drawAtlasCatalog(ctx, x, y, w, h) {
    const PAD = 10;
    const ROW_H = 38;
    let cy = y + 6;

    // Tło — solidne czarne (overlay zakrywa 3D mapę układu)
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, y, w - 2, h - 1);

    // Nagłówek
    const entries = this._getAllCatalogBodies();
    const exploredCount = entries.filter(e => e.explored).length;

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('fleet.catalogHeaderFull'), x + PAD, cy + 10);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(t('fleet.catalogExplored', exploredCount, entries.length), x + w - PAD, cy + 10);
    ctx.textAlign = 'left';
    cy += 18;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 4;

    if (entries.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.catalogNoBodiesInSystem'), x + PAD, cy + 12);
      this._atlasContentH = 0;
      this._atlasVisibleH = 0;
      return;
    }

    // Scroll + clip
    const visibleH = h - (cy - y) - 2;
    this._atlasVisibleH = visibleH;
    this._atlasContentH = entries.length * ROW_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, visibleH);
    ctx.clip();

    const scrollY = this._atlasScrollY || 0;
    let ry = cy - scrollY;

    const colMgr = window.KOSMOS?.colonyManager;

    for (const entry of entries) {
      const { body, explored } = entry;
      const isMoon = !!entry.isMoon;
      const indent = isMoon ? 14 : 0;

      // Cull poza widocznością
      if (ry + ROW_H < cy - 2) { ry += ROW_H; continue; }
      if (ry > cy + visibleH + 2) break;

      // Hover highlight
      const isHover = this._mapHoverBody?.bodyId === body.id;
      if (isHover) {
        ctx.fillStyle = 'rgba(0,255,180,0.06)';
        ctx.fillRect(x + 1, ry, w - 2, ROW_H);
      }

      // Kolonia marker
      const hasColony = colMgr?.hasColony(body.id);

      const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
      const orbA = body.orbital?.a ?? 0;
      const distHome = DistanceUtils.orbitalFromHomeAU(body);
      let _reportX = null;

      if (explored) {
        // Nazwa
        ctx.font = `${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
        const isHome = !!entry.isHome;
        ctx.fillStyle = isHome ? THEME.accent : hasColony ? THEME.mint : isMoon ? THEME.textSecondary : THEME.textPrimary;
        const namePrefix = isMoon ? '└ ' : '';
        const homeMark = isHome ? '🏛 ' : '';
        const targetMark = body._markedAsTarget ? ' 🎯' : '';
        const maxNameLen = isMoon ? 14 : 20;
        const rawName = body.name ?? body.id;
        const truncName = rawName.length > maxNameLen ? rawName.slice(0, maxNameLen) + '…' : rawName;
        const nameStr = `${namePrefix}${icon} ${homeMark}${truncName}${targetMark}`;
        ctx.fillText(nameStr, x + PAD + indent, ry + 14);

        // Ikona raportu 📋 — obok nazwy (hit zone dodana po map_body)
        const nameTextW = ctx.measureText(nameStr).width;
        _reportX = x + PAD + indent + nameTextW + 8;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('📋', _reportX, ry + 14);

        // Kolonia badge — pod nazwą, obok typu
        let typeLineStr = '';
        const typeStr = body.planetType ?? body.subType ?? body.type;
        const tempStr = (body.temperatureC != null || body.temperatureK) ? ` ${Math.round(body.temperatureC ?? (body.temperatureK - 273))}°C` : '';
        typeLineStr = `${typeStr}${tempStr}`;

        if (hasColony) {
          const col = colMgr.getColony(body.id);
          const pop = col?.civSystem?.population ?? 0;
          typeLineStr += `  ● ${pop} POP`;
        }

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasColony ? THEME.mint : THEME.textDim;
        ctx.fillText(typeLineStr, x + PAD + indent, ry + 28);

        // Odległości (prawo)
        ctx.textAlign = 'right';
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 14);

        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 28);

        // Złoża (środek-prawo)
        const deps = body.deposits ?? [];
        if (deps.length > 0) {
          const topDeps = [...deps].filter(d => d.remaining > 0).sort((a, b) => b.richness - a.richness).slice(0, 3);
          const depStr = topDeps.map(d => {
            const stars = d.richness >= 0.7 ? '★★★' : d.richness >= 0.4 ? '★★' : '★';
            return `${d.resourceId}${stars}`;
          }).join(' ');
          ctx.fillStyle = THEME.yellow;
          const depX = x + w / 2 + 30;
          ctx.textAlign = 'left';
          ctx.fillText(depStr, depX, ry + 28);
        }

        ctx.textAlign = 'left';
      } else {
        // Niezbadane
        ctx.font = `${THEME.fontSizeSmall + 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const namePrefix = isMoon ? '└ ' : '';
        ctx.fillText(`${namePrefix}${icon} ???`, x + PAD + indent, ry + 14);

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(body.type === 'planet' ? t('fleet.bodyTypePlanet') : body.type === 'moon' ? t('fleet.bodyTypeMoon') : t('fleet.bodyTypePlanetoid'), x + PAD + indent, ry + 28);

        ctx.textAlign = 'right';
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${orbA.toFixed(2)} AU`, x + w - PAD, ry + 14);
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🏠 ${distHome.toFixed(1)} AU`, x + w - PAD, ry + 28);
        ctx.textAlign = 'left';
      }

      // Hit zone — cały wiersz do hover/tooltip i wyboru celu
      this._hitZones.push({
        x: x + 1, y: ry, w: w - 2, h: ROW_H,
        type: 'map_body', data: { bodyId: body.id },
      });

      // Hit zone raportu — NA WIERZCHU (po map_body, wyższy index = sprawdzany pierwszy w reverse)
      if (_reportX !== null) {
        this._hitZones.push({
          x: _reportX - 2, y: ry + 4, w: 20, h: 16,
          type: 'atlas_report', data: { bodyId: body.id },
        });
      }

      // Separator wierszy
      ctx.strokeStyle = 'rgba(40,60,80,0.2)';
      ctx.beginPath(); ctx.moveTo(x + PAD, ry + ROW_H - 1); ctx.lineTo(x + w - PAD, ry + ROW_H - 1); ctx.stroke();

      ry += ROW_H;
    }

    ctx.restore();

    // Scrollbar
    if (this._atlasContentH > visibleH) {
      const sbH = Math.max(10, visibleH * (visibleH / this._atlasContentH));
      const maxScroll = this._atlasContentH - visibleH;
      const sbY = cy + (scrollY / maxScroll) * (visibleH - sbH);
      ctx.fillStyle = 'rgba(0,255,180,0.25)';
      ctx.fillRect(x + w - 4, sbY, 3, sbH);
    }

    // Tooltip ciała (na hover)
    if (this._mapHoverBody) {
      this._drawBodyTooltip(ctx, x, y, w, h);
    }
  }

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

  // Finding 125 (dogrywka po live-gate) — JEDNO wejście skoku „powrót do bazy" dla trzech
  // przycisków panelu obcego układu (Interstellar Arrival / orbita obcego ciała / przerwany rekon).
  //
  // ⚠ Dlaczego przez `OrderService.issueWarp`, a nie wprost przez `dispatchInterstellar`:
  // dyspozytor zwraca GOŁY BOOL, więc gracz dostawał samo „Nie można wydać rozkazu" — bez
  // informacji, że brakuje rdzeni warp. Fasada zwraca `{ok, reason}` i jest tym samym silnikiem,
  // którego używa „Powrót" z rejestru floty i skok z mapy galaktyki (`runGalaxyWarpOrder`); dawne
  // przyciski skoku zakładki Stratcom (`cluster_send`, `cluster_send_pick`, `warp_order_send`)
  // zniknęły z zakładką w G5.
  // KONSEKWENCJA, ZADEKLAROWANA: powrót idzie teraz przez planer wielo-przeskokowy, więc trasa
  // dłuższa niż jeden skok zostanie ZŁOŻONA zamiast po cichu odmówić. Cel skoku BEZ ZMIAN —
  // bierzemy dokładnie ten `systemId`, który niesie hit-zone.
  _dispatchReturnJump(vessel, toSystemId) {
    const os   = window.KOSMOS?.orderService;
    const vMgr = window.KOSMOS?.vesselManager;
    return returnJumpTransactional(vessel, () => {
      if (os?.issueWarp) return os.issueWarp(vessel.id, toSystemId);
      // Brak fasady (headless/legacy) — stara ścieżka; bool nie niesie powodu.
      return { ok: !!vMgr?.dispatchInterstellar?.(vessel.id, toSystemId) };
    });
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

  _drawBodyTooltip(ctx, areaX, areaY, areaW, areaH) {
    const { bodyId, screenX, screenY } = this._mapHoverBody;
    const body = _findBody(bodyId);
    // Gwiazda — zachowana w canvas (NEW Universal Tooltip nie obsługuje 'star' type, M4 cleanup).
    if (!body) {
      const stars = EntityManager.getByType('star') ?? [];
      const star = stars.find(s => s.id === bodyId);
      if (!star) { this._mapHoverBody = null; return; }
      return this._drawTooltipBox(ctx, screenX, screenY, areaX, areaY, areaW, areaH, [
        { text: `⭐ ${star.name ?? t('fleet.tooltipStarName')}`, color: THEME.yellow, bold: true },
        { text: t('fleet.tooltipStarType', star.spectralType ?? star.starType ?? '?'), color: THEME.textSecondary },
        { text: t('fleet.tooltipStarMass', (star.mass ?? 0).toFixed(2)), color: THEME.textSecondary },
        { text: t('fleet.tooltipStarTemp', Math.round(star.temperatureK ?? 0)), color: THEME.textSecondary },
      ]);
    }

    // M3 migration: body tooltip (planet/moon/planetoid/asteroid/comet) zmigrowany
    // do NEW Universal Tooltip przez TooltipContent._planetContent. NEW pokazuje
    // superset (Status, Distance, Atmosphere, Resources, Owner, Population). Disable
    // canvas draw — _mapHoverBody tracking zachowany dla sprite highlight (L2052).
    // OLD body code w git history (commit pre-migracja).
    return;
  }

  _drawTooltipBox(ctx, sx, sy, areaX, areaY, areaW, areaH, lines) {
    const padX = 8, padY = 6, lineH = 14;
    const boldFont  = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const normFont  = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;

    // Mierz szerokość
    let maxW = 0;
    for (const l of lines) {
      ctx.font = l.bold ? boldFont : normFont;
      maxW = Math.max(maxW, ctx.measureText(l.text).width);
    }
    const ttW = maxW + padX * 2 + 4;
    const ttH = padY * 2 + lines.length * lineH;

    // Pozycja — pod/obok klikniętego ciała, w granicach mapy
    let ttX = sx - ttW / 2;
    let ttY = sy + 12;
    if (ttX < areaX + 4) ttX = areaX + 4;
    if (ttX + ttW > areaX + areaW - 4) ttX = areaX + areaW - ttW - 4;
    if (ttY + ttH > areaY + areaH - 4) ttY = sy - ttH - 12;
    if (ttY < areaY + 4) ttY = areaY + 4;

    // Tło
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ttX, ttY, ttW, ttH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ttX, ttY, ttW, ttH);

    // Linie
    let ty = ttY + padY;
    for (const l of lines) {
      ctx.font = l.bold ? boldFont : normFont;
      ctx.fillStyle = l.color ?? THEME.textSecondary;
      ctx.textAlign = 'left';
      ctx.fillText(l.text, ttX + padX, ty + 10);
      ty += lineH;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT — szczegóły statku + akcje + konfigurator
  // ══════════════════════════════════════════════════════════════════════════

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

  _drawEnemyDetails(ctx, x, y, w, h, vessel) {
    const pad = 8;
    const ENEMY_COLOR = '#ff4466';
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];

    let cy = y + pad;

    // Przycisk powrotu do Stoczni (zachowujemy dla symetrii — kliknięcie czyści selekcję)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const backLabel = t('fleet.backToShipyard');
    ctx.fillText(backLabel, x + pad, cy + 10);
    const backW = ctx.measureText(backLabel).width + 4;
    this._hitZones.push({ x: x + pad - 2, y: cy, w: backW, h: 16, type: 'back_to_shipyard', data: {} });
    cy += 22;

    // Fog-of-war tożsamości: wróg bez pełnego kontaktu (intel < contact) = panel anonimowy.
    // Detekcja obserwatorium daje tylko 'rumor' (pozycja bez tożsamości); pełne dane (nazwa/
    // imperium/kadłub/misja) odsłania dopiero bliskie spotkanie (proximity → contact). Bez tej
    // bramki selekcja ghosta (np. klik na scenie 3D → vessel:focus) zdradzała wszystko.
    if (!_isEnemyTracked(vessel)) {
      ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
      ctx.fillStyle = ENEMY_COLOR;
      ctx.fillText(`❓ ${t('intel.unidentifiedContact')}`, x + pad, cy + 16);
      cy += 26;
      const home = window.KOSMOS?.homePlanet;
      if (home) {
        const d = DistanceUtils.euclideanAU(
          { x: home.x ?? 0, y: home.y ?? 0 },
          { x: vessel.position?.x ?? 0, y: vessel.position?.y ?? 0 }
        );
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        const distLabel = getLocale() === 'en' ? 'From home' : 'Od domu';
        ctx.fillText(`${distLabel}: ${d.toFixed(2)} AU`, x + pad, cy + 14);
        cy += 20;
      }
      ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('intel.unidentifiedHint'), x + pad, cy + 14);
      return;
    }

    // Nagłówek — ⚔ WROGA JEDNOSTKA
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = ENEMY_COLOR;
    ctx.fillText('⚔ WROGA JEDNOSTKA', x + pad, cy + 16);
    cy += 24;

    // Nazwa statku
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    const nm = vessel.name ?? '?';
    const nmTrim = nm.length > 20 ? nm.slice(0, 19) + '…' : nm;
    ctx.fillText(`${ship?.icon ?? '⚔'} ${nmTrim}`, x + pad, cy + 16);
    cy += 22;

    // Imperium (z EmpireRegistry) + Intel level
    const empId = vessel.ownerEmpireId ?? vessel.owner;
    const emp   = empId && window.KOSMOS?.empireRegistry?.get?.(empId);
    const empName = emp?.name ?? 'Nieznane imperium';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`Imperium: ${empName}`, x + pad, cy + 14);
    cy += 18;

    // „Wywiad" = jakość kontaktu z TYM statkiem (getVesselContact), nie z całym imperium
    // (getLevel) — inaczej panel pokazywał tożsamość statku, a obok „Wywiad: niepoznane".
    const intel = window.KOSMOS?.intelSystem?.getVesselContact?.(vessel.id)?.quality
               ?? window.KOSMOS?.intelSystem?.getLevel?.(empId);
    if (intel) {
      const intelLabels = { unknown: 'niepoznane', rumor: 'plotka', contact: 'kontakt', detailed: 'szczegółowe' };
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`Wywiad: ${intelLabels[intel] ?? intel}`, x + pad, cy + 14);
      cy += 18;
    }

    // Typ kadłuba
    const typeName = ship?.namePL ?? ship?.nameEN ?? ship?.name ?? vessel.shipId ?? '?';
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`Typ: ${typeName}`, x + pad, cy + 14);
    cy += 22;

    // Separator
    ctx.strokeStyle = 'rgba(255,68,102,0.3)';
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 10;

    // Stan + pozycja + dystans od Home
    // Finding 266: KANON; Finding 269 (A-MIN, decyzja (i)): słowo z kanonu (`vesselStatusLabelKey`).
    // ⚠ Etykieta `Stan:` i sąsiedztwo (`Imperium:`, `Wywiad:`, `Typ:`) zostają po polsku — klasa 113,
    //   osobny arc (poza podpisem A-MIN).
    const stateTxt = t(vesselStatusLabelKey(resolveVesselStatus(vessel).token));
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`Stan: ${stateTxt}`, x + pad, cy + 14); cy += 18;

    const posX = (vessel.position?.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const posY = (vessel.position?.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    ctx.fillText(`Pozycja: ${posX.toFixed(2)}, ${posY.toFixed(2)} AU`, x + pad, cy + 14); cy += 18;

    const home = window.KOSMOS?.homePlanet;
    if (home) {
      const d = DistanceUtils.euclideanAU(
        { x: home.x ?? 0, y: home.y ?? 0 },
        { x: vessel.position?.x ?? 0, y: vessel.position?.y ?? 0 }
      );
      ctx.fillText(`Od domu: ${d.toFixed(2)} AU`, x + pad, cy + 14); cy += 18;
    }

    cy += 8;

    // Komunikat: brak akcji
    ctx.font = `italic ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('— brak dostępnych akcji —', x + pad, cy + 14);
  }

  _drawRight(ctx, x, y, w, h, vMgr, ms, colMgr, activePid, opts = {}) {
    const pad = 8;
    // ⚠ B1 — TRYB KOMPAKTOWY (Finding 260 / slice B). `compact` ZWĘŻA treść gałęzi statku
    //   do tego, po co gracz otwiera panel nad mapą: nagłówek + AKCJE + status misji.
    //   ZMIERZONE PRZED ZMIANĄ: nad pierwszym przyciskiem akcji leżało 456 px karty
    //   katalogowej (opis kadłuba, OSIĄGI, paski paliwa/wytrzymałości, utrzymanie), przy
    //   contentH = 550 px ⇒ „mały panel z pełnym zestawem akcji" był problemem UKŁADU,
    //   a nie geometrii: samo zmniejszenie okna wpychało akcje pod fold.
    // ⚠ REJESTR I DOWÓDZTWO NIE PODAJĄ `opts` ⇒ `compact` jest falsy ⇒ ich render jest
    //   BIT W BIT jak dotąd. To ten sam mechanizm bezpieczeństwa, który obronił slice 258:
    //   golden (P1/C6) chroniony Z KONSTRUKCJI, nie dyscypliną.
    const compact = opts.compact === true;
    // Domyślnie brak scrolla (gałęzie early-return: flota/picker/brak/wróg). Ścieżka
    // szczegółów statku gracza nadpisuje _rightContentH przez _finishRight (niżej).
    this._rightViewH = h;
    this._rightContentH = h;

    // Player Fleet Groups (P2.5 outliner) — mutex: gdy selectedFleetId set,
    // pokazuj fleet detail. Inaczej spadamy do dotychczasowej logiki vessel detail
    // / shipyard. UI gwarantuje że tylko jedna selekcja na raz (mutex w handlerach).
    const fleetSel = this._selectedFleetId;
    if (fleetSel) {
      const fSys = window.KOSMOS?.fleetSystem;
      const fleet = fSys?.getFleet?.(fleetSel);
      if (fleet) {
        this._drawRightFleet(ctx, x, y, w, h, fleet);
        return;
      }
      // Fleet zniknął (disband/save corruption) — fallback do dotychczasowego flow.
    }

    // 3f — wybrany WRAK → raport bitwy w prawym panelu (reuse getBattleRecord;
    // ta sama treść co expand w lewej liście — nic nie jest ekskluzywne dla listy).
    {
      const selV = this._selectedVesselId ? vMgr?.getVessel?.(this._selectedVesselId) : null;
      if (selV?.isWreck) {
        ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`💀 ${this._truncate(ctx, selV.name ?? selV.id, w - pad * 2 - 20)}`, x + pad, y + 20);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        const rec = window.KOSMOS?.warSystem?.getBattleRecord?.(selV.lastBattleId);
        let yy = y + 40;
        const line = (txt, color = THEME.textSecondary) => {
          ctx.fillStyle = color;
          ctx.fillText(this._truncate(ctx, txt, w - pad * 2), x + pad, yy);
          yy += 15;
        };
        const wy = Number.isFinite(selV.wreckedAt) ? Math.floor(selV.wreckedAt)
          : (Number.isFinite(selV.lastBattleYear) ? Math.floor(selV.lastBattleYear) : null);
        if (wy != null) line(`☠ ${t('registry.wreckYear', wy)}`);
        if (rec) {
          const aCount = rec.participantA?.count ?? rec.participantA?.vesselIds?.length ?? '?';
          const bCount = rec.participantB?.count ?? rec.participantB?.vesselIds?.length ?? '?';
          line(`⚔ ${t('fleet.battleHeader', rec.year != null ? Math.floor(rec.year) : '?')}`);
          line(`A:${aCount} vs B:${bCount}`);
          line(`${t('fleet.battleResult')}: ${rec.winner ?? '?'}`, THEME.warning);
        } else {
          line(t('fleet.battleNoRecord'), THEME.textDim);
        }
        return;
      }
    }

    if (!this._selectedVesselId) {
      // Stocznia ma teraz własną zakładkę — tu pokazujemy podpowiedź wyboru statku.
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.selectFromList'), x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const vessel = vMgr?.getVessel(this._selectedVesselId);
    if (!vessel) {
      // Auto-clear: vessel zniknął (wreck/disband/cleanup) — przekieruj przez UIManager.
      this._setSelectedVesselViaUI(null);
      return;
    }

    // ── Wrogi statek — uproszczony panel, brak akcji ──────────────
    if (isEnemyVessel(vessel)) {
      this._drawEnemyDetails(ctx, x, y, w, h, vessel);
      return;
    }

    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];

    // ── Scroll pionowy panelu szczegółów (treść bywa wyższa niż panel) ──
    // Reset przy zmianie statku; clip do prostokąta panelu; cy przesunięte o
    // -scroll (rysowanie I hit-zony używają tego samego cy → spójne).
    if (this._rightScrollVesselId !== this._selectedVesselId) {
      this._rightScrollY = 0;
      this._rightScrollVesselId = this._selectedVesselId;
    }
    // Reset scrolla przy wejściu w konfigurator misji / zmianie kroku (select↔confirm) lub celu —
    // świeży widok od góry (inaczej krok „confirm" mógłby otworzyć się przewinięty z widoku detali).
    if (this._missionConfig) {
      const _cfgKey = `${this._missionConfig.actionId}|${this._missionConfig.step}|${this._missionConfig.targetId ?? ''}`;
      if (_cfgKey !== this._missionCfgScrollKey) { this._missionCfgScrollKey = _cfgKey; this._rightScrollY = 0; }
    } else {
      this._missionCfgScrollKey = null;
    }
    const _scrollY = this._rightScrollY || 0;
    const _hzStart = this._hitZones.length;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    let cy = y + pad - _scrollY;
    // Finalizator: restore clipu + pomiar treści + clamp scrolla + scrollbar + przycięcie
    // hit-zon. Wołany w `finally` (niżej) → ZAWSZE przywraca ctx, nawet gdy render rzuci
    // wyjątek. Bez tego wyjątek zostawiał aktywny clip = korupcja canvasu („pusta mapa").
    let _finished = false;
    const _finishRight = () => {
      if (_finished) return;
      _finished = true;
      ctx.restore();
      this._rightViewH = h;
      this._rightContentH = (cy - y) + _scrollY + pad;   // całkowita wysokość treści
      const maxS = Math.max(0, this._rightContentH - h);
      if (this._rightScrollY > maxS) this._rightScrollY = maxS;
      if (this._rightScrollY < 0) this._rightScrollY = 0;
      this._clipRightHitZones(_hzStart, y, h);
      this._drawRightScrollbar(ctx, x, y, w, h);
    };

    try {
    // ── Przycisk powrotu do Stoczni ────────────────────────
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const backLabel = t('fleet.backToShipyard');
    ctx.fillText(backLabel, x + pad, cy + 10);
    const backW = ctx.measureText(backLabel).width + 4;
    this._hitZones.push({ x: x + pad - 2, y: cy, w: backW, h: 16, type: 'back_to_shipyard', data: {} });
    cy += 18;

    // ── Nagłówek ──────────────────────────────────────
    // Ikona + nazwa + typ
    ctx.font = `16px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(ship?.icon ?? '🚀', x + pad, cy + 18);

    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    const nameText = vessel.name.length > 12 ? vessel.name.slice(0, 11) + '…' : vessel.name;
    ctx.fillText(nameText, x + pad + 24, cy + 16);

    // Przycisk rename (✎)
    const renX = x + pad + 24 + ctx.measureText(nameText).width + 6;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✎', renX, cy + 16);
    this._hitZones.push({ x: renX - 2, y: cy + 4, w: 14, h: 16, type: 'rename', data: { vesselId: vessel.id } });

    // Rola statku (z modułów) + klasa kadłuba — było: sama nazwa kadłuba („Small Hull")
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const subtitle = `${this._roleLabel(vessel)} · ${ship ? getName(ship, 'ship') : vessel.shipId}`;
    ctx.fillText(this._truncate(ctx, subtitle, w - pad * 2 - 24), x + pad + 24, cy + 32);

    cy += 44;

    // ── Przegląd: status + doświadczenie (rząd 1), baza (rząd 2) ──
    {
      const statusColor = (STATUS_COLORS[resolveVesselStatus(vessel).token] ?? (() => THEME.textSecondary))();
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = statusColor;
      ctx.fillText(this._truncate(ctx, `● ${this._statusText(vessel)}`, w - pad * 2 - 60), x + pad, cy + 12);
      ctx.fillStyle = THEME.yellow;
      ctx.textAlign = 'right';
      ctx.fillText(this._xpStars(vessel), x + w - pad, cy + 12);
      ctx.textAlign = 'left';
      cy += 18;
      // Baza macierzysta
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const baseLbl = `${t('fleet.labelBase')}: `;
      ctx.fillText(baseLbl, x + pad, cy + 10);
      const baseLblW = ctx.measureText(baseLbl).width;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(this._truncate(ctx, this._baseText(vessel), w - pad * 2 - baseLblW), x + pad + baseLblW, cy + 10);
      cy += 16;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── Moduły statku (pełna lista — sedno statku modułowego) ──
    cy = this._drawModulesSection(ctx, x, cy, w, pad, ship, vessel);

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── KARTA KATALOGOWA (opis kadłuba + OSIĄGI + paski + utrzymanie) ─────────
    // ⚠ B1 — POMIJANA w trybie kompaktowym. Ten region jest CIĄGŁY i czysto informacyjny:
    //   ZERO stref klikalnych, ZERO `return`, ZERO zmiennych czytanych niżej (zmierzone),
    //   więc jeden `if` wystarcza i nie trzeba niczego wycinać do osobnej metody.
    //   Przycisk Cargo ZOSTAJE poza guardem — to AKCJA (strefa `cargo_load`), nie karta
    //   katalogowa; jego zdjęcie odebrałoby kompaktowi ładowanie ładunku, czyli dokładnie
    //   to, po co ten panel istnieje („pełny zestaw akcji").
    if (!compact) {
      // ── Osiągi (opis kadłuba + specyfikacja) ─────────────────
      if (ship) {
        cy = this._drawShipSpecs(ctx, x, cy, w, pad, ship, vessel);
      }

      // Separator (osiągi → zasoby)
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // ── Pasek paliwa (h=36) ──────────────────────────────────
      const fuelPct = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.labelFuel'), x + pad, cy + 10);

      ctx.fillStyle = THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(`${vessel.fuel.current.toFixed(1)} / ${vessel.fuel.max} pc`, x + w - pad, cy + 10);
      ctx.textAlign = 'left';

      const fBarX = x + pad;
      const fBarY = cy + 16;
      const fBarW = w - pad * 2;
      const fBarH = 8;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(fBarX, fBarY, fBarW, fBarH);
      const fColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;
      ctx.fillStyle = fColor;
      ctx.fillRect(fBarX, fBarY, Math.round(fBarW * fuelPct), fBarH);
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(fBarX, fBarY, fBarW, fBarH);

      cy += 32;

      // ── Pasek paliwa warp (S3.0b S1b — tylko statki z Komorą Warp) ──
      if (vessel.warpFuel && vessel.warpFuel.max > 0) {
        const wfPct = vessel.warpFuel.current / vessel.warpFuel.max;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`🌀 ${t('fleet.labelWarpFuel')}`, x + pad, cy + 10);
        ctx.fillStyle = THEME.textPrimary;
        ctx.textAlign = 'right';
        ctx.fillText(`${vessel.warpFuel.current.toFixed(1)} / ${vessel.warpFuel.max} wc`, x + w - pad, cy + 10);
        ctx.textAlign = 'left';
        const wBarX = x + pad;
        const wBarY = cy + 16;
        const wBarW = w - pad * 2;
        const wBarH = 8;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(wBarX, wBarY, wBarW, wBarH);
        ctx.fillStyle = THEME.info;
        ctx.fillRect(wBarX, wBarY, Math.round(wBarW * wfPct), wBarH);
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(wBarX, wBarY, wBarW, wBarH);
        cy += 32;
      }

      // ── Pasek endurance (Milestone 1 — stamina operacyjna) ────
      if (vessel.endurance && vessel.endurance.max > 0) {
        const endPct = vessel.endurance.current / vessel.endurance.max;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.labelEndurance'), x + pad, cy + 10);
        ctx.fillStyle = THEME.textPrimary;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(vessel.endurance.current)} / ${Math.round(vessel.endurance.max)}`, x + w - pad, cy + 10);
        ctx.textAlign = 'left';
        const eBarX = x + pad;
        const eBarY = cy + 16;
        const eBarW = w - pad * 2;
        const eBarH = 8;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(eBarX, eBarY, eBarW, eBarH);
        const eColor = endPct > 0.4 ? THEME.success : endPct > 0.2 ? THEME.warning : THEME.danger;
        ctx.fillStyle = eColor;
        ctx.fillRect(eBarX, eBarY, Math.round(eBarW * endPct), eBarH);
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(eBarX, eBarY, eBarW, eBarH);
        cy += 32;
      }

      // ── S3.5a-1 — utrzymanie floty (Kr/rok) + status immobilizacji ──
      {
        const vMgr        = window.KOSMOS?.vesselManager;
        const upkeep      = vMgr?.getVesselUpkeepCredits?.(vessel) ?? 0;
        const immobilized = vMgr?.isImmobilized?.(vessel) ?? false;
        // W2-5 — stawka jest EFEKTYWNA. Dla kadłuba w rezerwie dopisujemy, że to 10 % pełnej,
        // inaczej gracz czytałby dziesięciokrotnie zaniżoną liczbę bez wyjaśnienia.
        const inReserve = (vessel?.serviceState ?? 'active') !== 'active';
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.maintenance'), x + pad, cy + 10);
        ctx.fillStyle = immobilized ? THEME.danger : THEME.textPrimary;
        ctx.textAlign = 'right';
        ctx.fillText(`-${t('fleet.upkeepPerYear', Math.round(upkeep))}`, x + w - pad, cy + 10);
        ctx.textAlign = 'left';
        cy += 18;
        if (inReserve) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(t('fleet.reserveRateNote',
            Math.round((vMgr?.getVesselBaseUpkeepCredits?.(vessel) ?? 0))), x + pad, cy + 10);
          cy += 16;
        }
        // A — licznik zaległości WYJĘTY z gałęzi `if (immobilized)`. Przed tą zmianą pierwszy
        // nieopłacony rok nie miał w UI ŻADNEJ reprezentacji, więc dwuletnia karencja była dla
        // gracza niewidzialna — kara pojawiała się bez ostrzeżenia. Teraz rok 1 świeci
        // ostrzegawczo (warning), a dopiero rok 2 dokłada twardy komunikat o unieruchomieniu.
        const unpaid = vessel.unpaidYears ?? 0;
        if (immobilized) {
          ctx.fillStyle = THEME.danger;
          ctx.fillText(`⚠ ${t('fleet.immobilized')}`, x + pad, cy + 10);
          cy += 16;
        } else if (unpaid > 0) {
          ctx.fillStyle = THEME.warning;
          ctx.fillText(`⚠ ${t('fleet.upkeepUnpaidWarn')}`, x + pad, cy + 10);
          cy += 16;
        }
        if (unpaid > 0) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(t('fleet.unpaidYears', unpaid), x + pad, cy + 10);
          cy += 16;
          // Sam licznik nie mówi ANI ile brakuje, ANI że kara zejdzie sama — a to jedyne dwie
          // rzeczy, na które gracz ma wpływ. Zmierzone na żywo (2026-08-27): przy skarbcu pełnym
          // 38 tys. Kr „Nieopłacone: 9 lat" czyta się jak dożywocie, choć wystarczyło jedno
          // udane rozliczenie. Kwota liczona LIVE z tego samego gettera, z którego płaci
          // `spendFromTreasury` — inaczej panel mógłby obiecać spłatę, której nie ma z czego zrobić.
          const treasury = window.KOSMOS?.civilianTradeSystem?.getTreasuryCredits?.() ?? 0;
          const short    = Math.max(0, Math.ceil(upkeep - treasury));
          ctx.fillStyle  = short > 0 ? THEME.warning : THEME.success;
          ctx.fillText(short > 0 ? t('fleet.upkeepShortfall', short) : t('fleet.arrearsClearsSoon'),
                       x + pad, cy + 10);
          cy += 16;
        }
      }
    }

    // ── Przycisk Cargo (dla statków z ładownią) ──────────────
    // vessel.cargoMax (z modułów) lub ship.cargoCapacity (legacy SHIPS)
    const cargoMaxDisplay = (vessel.cargoMax ?? 0) > 0 ? vessel.cargoMax : (ship?.cargoCapacity ?? 0);
    if (cargoMaxDisplay > 0 && (vessel.position.state === 'docked' || vessel.position.state === 'orbiting')) {
      const cargoUsed = vessel.cargoUsed ?? 0;
      const cargoBtnW = w - pad * 2;
      const cargoBtnH = 24;
      ctx.fillStyle = 'rgba(255,204,68,0.08)';
      ctx.fillRect(x + pad, cy, cargoBtnW, cargoBtnH);
      ctx.strokeStyle = THEME.warning;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, cargoBtnW, cargoBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`📦 Cargo: ${Math.round(cargoUsed)} / ${cargoMaxDisplay} t`, x + pad + 8, cy + 16);
      this._hitZones.push({
        x: x + pad, y: cy, w: cargoBtnW, h: cargoBtnH,
        type: 'cargo_load', data: { vesselId: vessel.id },
      });
      cy += cargoBtnH + 6;
    }

    // ── Przycisk Wyładuj kolonistów (dla statków z kolonistami w hangarze) ──
    // Zwraca POPy z powrotem do kolonii macierzystej. Chroni gracza przed
    // utknięciem gdy statek ma stale colonists po anulowanej misji.
    const onBoard = vessel.colonists ?? 0;
    if (onBoard > 0 && vessel.position.state === 'docked') {
      const unloadBtnW = w - pad * 2;
      const unloadBtnH = 24;
      ctx.fillStyle = 'rgba(120,80,200,0.10)';
      ctx.fillRect(x + pad, cy, unloadBtnW, unloadBtnH);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, unloadBtnW, unloadBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(`🏠 ${t('fleet.unloadColonists', onBoard)}`, x + pad + 8, cy + 16);
      this._hitZones.push({
        x: x + pad, y: cy, w: unloadBtnW, h: unloadBtnH,
        type: 'unload_colonists', data: { vesselId: vessel.id },
      });
      cy += unloadBtnH + 6;
    }

    // ── Przycisk Undock / Wystartuj na orbitę (dla zadokowanego statku) ──────
    // S3.4-F2: reuse ścieżki z drawera (FleetGroupPanel grpUndock → VesselManager.undockToOrbit).
    // Zero nowej logiki dokowania — instant launch to orbit ciała/stacji, na której statek stał.
    if (vessel.position.state === 'docked' && vessel.position.dockedAt) {
      const undBtnW = w - pad * 2;
      const undBtnH = 24;
      ctx.fillStyle = 'rgba(0,255,180,0.08)';
      ctx.fillRect(x + pad, cy, undBtnW, undBtnH);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, undBtnW, undBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(t('fleet.undock'), x + pad + 8, cy + 16);
      this._hitZones.push({
        x: x + pad, y: cy, w: undBtnW, h: undBtnH,
        type: 'undock', data: { vesselId: vessel.id },
      });
      cy += undBtnH + 6;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── M1 Targeting — read-only label movementOrder (§8.4) ────
    cy = this._drawMovementOrderLabel(ctx, x, cy, w, pad, vessel);
    // M3 P1.4 — przycisk anulowania orderu (tylko gdy status='active')
    cy = this._drawCancelOrderButton(ctx, x, cy, w, pad, vessel);

    // ── Aktywna misja (h=~80) ────────────────────────────────
    const activeMissions = ms?.getActive?.() ?? [];
    const mission = activeMissions.find(m => m.vesselId === vessel.id);
    if (mission) {
      cy = this._drawActiveMission(ctx, x, cy, w, pad, mission, vessel);
      // Manifest: plan wysyłki + stan + plan powrotny (dla misji transportowych / pętli)
      const hasPlan = mission.cargo && Object.values(mission.cargo).some(q => q > 0);
      const hasOnBoard = vessel.cargo && Object.values(vessel.cargo).some(q => q > 0);
      const hasReturnSpec = mission.returnCargoSpec && Object.values(mission.returnCargoSpec).some(q => q > 0);
      if (hasPlan || hasOnBoard || hasReturnSpec) {
        cy = this._drawMissionManifest(ctx, x, cy, w, pad, mission, vessel);
      }
    }

    // ── Panel po przylecie międzygwiezdnym ────────────────────
    const isMission = vessel.mission;
    if (isMission?.type === 'interstellar_jump' && isMission.phase === 'in_system') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`🌟 ${t('fleet.interstellarArrival')}`, x + pad, cy + 10);
      cy += 18;

      // Info: dotarł do układu
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.arrivedAt', isMission.targetName ?? isMission.toSystemId), x + pad, cy + 10);
      cy += 16;

      // Przycisk: Przełącz widok
      const ssMgr = window.KOSMOS?.starSystemManager;
      const sysReg = ssMgr?.getSystem(isMission.toSystemId);
      if (sysReg) {
        const switchBtnW = w - pad * 2;
        const switchBtnH = 22;
        ctx.fillStyle = 'rgba(0,255,180,0.08)';
        ctx.fillRect(x + pad, cy, switchBtnW, switchBtnH);
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, switchBtnW, switchBtnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.clusterSwitch'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: switchBtnW, h: switchBtnH, type: 'cluster_switch', data: { systemId: isMission.toSystemId } });
        cy += switchBtnH + 4;
      }

      // (f-A) Finding 253 — ENUMERACJA CIAŁ USUNIĘTA (ekran przylotu międzygwiezdnego).
      // To ona czyniła z panelu STAŁY KATALOG zamiast zestawu akcji. Usunięcie jest DARMOWE,
      // bo zdolność „leć do innego ciała" ma dwie inne drogi: klik ciała NA MAPIE
      // (`FMO:2034`, ten sam `vessel:interstellarRedirect`; jego komentarz mówi wprost „to samo
      // co wiersz listy, tylko wygodniej") oraz — od d2 — rozkaz ruchu cross-system.
      // ⚠ Przyciski RECONU ZOSTAJĄ: `expedition:foreignRecon` ma tylko tych dwóch producentów,
      //   a `foreign_colonize` jest bramkowane `explored`, które na obcym ciele ustawia WYŁĄCZNIE
      //   recon — ukrycie go zostawiłoby Kolonizuj narysowane i MARTWE (pin f-2).
      // (a') Finding 145 — PRZYCISK „Powrót do bazy" USUNIĘTY. Zdolność powrotu ZOSTAJE:
      // skok z mapy galaktyki (G / M: menu PPM gwiazdy albo [ Wyślij ▼ ] → `runGalaxyWarpOrder` →
      // OrderService.issueWarp; odmowy z bramki `canOrder`). Handler `interstellar_return` żyje dalej jako martwy kod do sweepu 127 —
      // usunęliśmy PRZYCISK, nie zdolność.
    }

    // ── Panel orbity obcego ciała — rozkazy kontekstowe (Finding 578: PREDYKAT, nie kształt misji —
    //    trasa Atlas `exploration`/`orbiting_body` jak dziś + bezczynna orbita poza śladem kolonii; jedno źródło z HUD) ──
    const foreignBodyId = foreignActionsBodyId(vessel, foreignActionsContext(window.KOSMOS));
    if (foreignBodyId) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek — na orbicie ciała
      const orbitBody = _findBody(foreignBodyId);
      // Ciała niebieskie mają pole .name (NIE namePL/nameEN) — getName() zwróciłby surowe id (entity_N).
      const orbitName = orbitBody?.name ?? foreignBodyId;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`🌍 ${t('fleet.orbitingBody', orbitName)}`, x + pad, cy + 10);
      cy += 18;

      const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
      // Zdolności z kadłuba + modułów
      const hullCaps = ship?.capabilities ?? [];
      const modCaps = vessel.modules?.length ? getModuleCapabilities(vessel.modules) : new Set();
      // Każdy statek z napędem może recon
      if (vessel.modules?.some(m => SHIP_MODULES[m]?.slotType === 'propulsion')) {
        modCaps.add('recon'); modCaps.add('survey');
      }
      const caps = { has: c => hullCaps.includes(c) || modCaps.has(c) };
      const btnW = w - pad * 2;
      const btnH = 22;

      // ── Recon ciała (recon cap) ──
      if (caps.has('recon')) {
        // Bramka na `analyzed` (nie `explored`): statek naukowy może domknąć ciało
        // zbadane wcześniej zgrubnie (teleskop / obcy skan) → pełna analiza. Parytet
        // z recon macierzystym (guard `!target.analyzed`).
        const isAnalyzed = orbitBody?.analyzed ?? false;
        ctx.fillStyle = isAnalyzed ? 'rgba(100,100,100,0.08)' : 'rgba(0,180,255,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = isAnalyzed ? THEME.textDim : THEME.info;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isAnalyzed ? THEME.textDim : THEME.info;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.foreignReconBody'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        if (!isAnalyzed) {
          this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
            type: 'foreign_recon_body', data: { vesselId: vessel.id, targetId: foreignBodyId } });
        }
        cy += btnH + 4;

        // Recon układu
        ctx.fillStyle = 'rgba(0,180,255,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = THEME.info;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.fillStyle = THEME.info;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.foreignReconSystem'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
          type: 'foreign_recon_system', data: { vesselId: vessel.id } });
        cy += btnH + 4;
      }

      // ── Kolonizacja ──
      // B1 (F4 live-gate): dostępność przez Vessel.canColonize (moduł habitat), NIE caps.has('colony')
      // (= colonistCapacity>0) — passenger-only ma pojemność, ale kolonii nie zakłada.
      if (vesselCanColonize(vessel)) {
        const colMgr4 = window.KOSMOS?.colonyManager;
        const isExploredCol = orbitBody?.explored ?? false;
        const isColonized = colMgr4?.getColony(foreignBodyId) != null;
        const validType = isForeignColonizeType(orbitBody);
        const canColonize = isExploredCol && !isColonized && validType;

        ctx.fillStyle = canColonize ? 'rgba(0,255,120,0.08)' : 'rgba(100,100,100,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = canColonize ? THEME.accent : THEME.textDim;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canColonize ? THEME.accent : THEME.textDim;
        ctx.textAlign = 'center';
        let colLabel = t('fleet.foreignColonize');
        if (!isExploredCol) colLabel += ` (${t('fleet.requiresExplored')})`;
        else if (isColonized) colLabel += ` (${t('fleet.alreadyColonized')})`;
        ctx.fillText(colLabel, x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        if (canColonize) {
          this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
            type: 'foreign_colonize', data: { vesselId: vessel.id, targetId: foreignBodyId } });
        }
        cy += btnH + 4;
      }

      // ── Rozładunek cargo ──
      if (caps.has('cargo') && (vessel.cargoUsed ?? 0) > 0) {
        ctx.fillStyle = 'rgba(255,204,68,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = THEME.warning;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.textAlign = 'center';
        ctx.fillText(`${t('fleet.foreignUnload')} (${Math.round(vessel.cargoUsed ?? 0)}t)`, x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
          type: 'foreign_unload', data: { vesselId: vessel.id, targetId: foreignBodyId } });
        cy += btnH + 4;
      }

      // (f-A) Finding 253 — ENUMERACJA CIAŁ USUNIĘTA (orbita obcego ciała).
      // To ona czyniła z panelu STAŁY KATALOG zamiast zestawu akcji. Usunięcie jest DARMOWE,
      // bo zdolność „leć do innego ciała" ma dwie inne drogi: klik ciała NA MAPIE
      // (`FMO:2034`, ten sam `vessel:interstellarRedirect`; jego komentarz mówi wprost „to samo
      // co wiersz listy, tylko wygodniej") oraz — od d2 — rozkaz ruchu cross-system.
      // ⚠ Przyciski RECONU ZOSTAJĄ: `expedition:foreignRecon` ma tylko tych dwóch producentów,
      //   a `foreign_colonize` jest bramkowane `explored`, które na obcym ciele ustawia WYŁĄCZNIE
      //   recon — ukrycie go zostawiłoby Kolonizuj narysowane i MARTWE (pin f-2).
      // (a') Finding 145 — PRZYCISK „Powrót do bazy" USUNIĘTY. Zdolność powrotu ZOSTAJE:
      // skok z mapy galaktyki (G / M: menu PPM gwiazdy albo [ Wyślij ▼ ] → `runGalaxyWarpOrder` →
      // OrderService.issueWarp; odmowy z bramki `canOrder`). Handler `foreign_return` żyje dalej jako martwy kod do sweepu 127 —
      // usunęliśmy PRZYCISK, nie zdolność.
    }

    // ── Panel foreign_recon w trakcie ──
    if (isMission?.type === 'foreign_recon') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      if (isMission.scope === 'target') {
        const scanBody = _findBody(isMission.targetId);
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.info;
        ctx.fillText(t('fleet.foreignScanning', scanBody ? (scanBody.name ?? scanBody.id) : '...'), x + pad, cy + 10);
        cy += 18;
      } else if (isMission.scope === 'full_system') {
        const curId = isMission.targets?.[isMission.currentIdx];
        const curBody = curId ? _findBody(curId) : null;
        const curName = curBody ? (curBody.name ?? curBody.id) : '...';
        const label = isMission.phase === 'scanning'
          ? t('fleet.foreignScanning', curName)
          : t('fleet.foreignTraveling', curName);
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.info;
        ctx.fillText(label, x + pad, cy + 10);
        cy += 14;
        // Postęp
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(`${(isMission.currentIdx ?? 0) + 1} / ${isMission.targets?.length ?? '?'}`, x + pad, cy + 10);
        cy += 18;
      }

      // ── Przyciski akcji dla foreign_recon ──
      cy += 4;
      const abortBtnW = w - pad * 2;
      const btnH = 22;   // FIX: brak deklaracji → ReferenceError przy rekonie obcego (crash mapy)

      // Przerwij rekon → statek przechodzi do orbiting_body z pełnymi akcjami
      ctx.fillStyle = THEME.warning;
      ctx.fillRect(x + pad, cy, abortBtnW, btnH);
      ctx.fillStyle = '#000';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText('⏹ ' + t('fleet.abortRecon'), x + pad + 8, cy + btnH / 2 + 4);
      this._hitZones.push({ x: x + pad, y: cy, w: abortBtnW, h: btnH, type: 'abort_foreign_recon', data: { vesselId: vessel.id } });
      cy += btnH + 4;
      // (a') Finding 145 — PRZYCISK „Powrót do bazy" USUNIĘTY. Zdolność powrotu ZOSTAJE:
      // skok z mapy galaktyki (G / M: menu PPM gwiazdy albo [ Wyślij ▼ ] → `runGalaxyWarpOrder` →
      // OrderService.issueWarp; odmowy z bramki `canOrder`). Handler `foreign_return_from_recon` żyje dalej jako martwy kod do sweepu 127 —
      // usunęliśmy PRZYCISK, nie zdolność.
    }

    // ── Aktywna pętla transportowa ──────────────────────────
    // Transport cykliczny: statek ma mission.loop === true (dowolny etap pętli).
    const activeLoop = ms?.getActive?.()?.find(m =>
      m.vesselId === vessel.id && m.loop && m.type === 'transport'
    );
    if (activeLoop) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Ikona wg etapu pętli
      const legIcon = activeLoop.status === 'waiting_reload'       ? '⏳'
                   : activeLoop.status === 'waiting_return_cargo' ? '⏳'
                   : activeLoop.leg === 'return'                   ? '⬅'
                   : '➡';
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(`${legIcon} ${t('fleet.activeLoopLabel')}`, x + pad, cy + 10);
      cy += 18;

      // Opis etapu
      const srcName = colMgr?.getColony(activeLoop.loopSourceId)?.name ?? activeLoop.loopSourceId ?? '?';
      const tgtBody = _findBody(activeLoop.loopTargetId);
      const tgtName = tgtBody?.name ?? colMgr?.getColony(activeLoop.loopTargetId)?.name ?? activeLoop.loopTargetId ?? '?';
      const routeStr = `${srcName} ⇄ ${tgtName}`;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(routeStr.slice(0, 36), x + pad, cy + 10);
      cy += 14;

      // Status szczegółowy (czeka na ...)
      if (activeLoop.status === 'waiting_reload') {
        ctx.fillStyle = THEME.warning;
        ctx.fillText(t('fleet.loopWaitReload'), x + pad, cy + 10);
        cy += 14;
      } else if (activeLoop.status === 'waiting_return_cargo') {
        ctx.fillStyle = THEME.warning;
        ctx.fillText(t('fleet.loopWaitReturnCargo'), x + pad, cy + 10);
        cy += 14;
      }

      // Przycisk PRZERWIJ PĘTLĘ
      const stopW = w - pad * 2;
      const stopH = 22;
      ctx.fillStyle = 'rgba(80,20,20,0.5)';
      ctx.fillRect(x + pad, cy, stopW, stopH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, stopW, stopH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.stopLoop'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + pad, y: cy, w: stopW, h: stopH, type: 'cancel_loop', data: { vesselId: vessel.id } });
      cy += stopH + 6;
    }

    // ── Konfigurator misji (jeśli aktywny) ───────────────────
    if (this._missionConfig) {
      // _drawMissionConfig zwraca końcowe cy (współrzędne scrollowane) → advance cy, żeby
      // _finishRight policzył _rightContentH z PEŁNĄ wysokością konfiguratora. Bez tego krok
      // „confirm" (przycisk WYŚLIJ na dole) miał _rightContentH zmierzone SPRZED konfiguratora
      // → maxScroll≈0 → przycisku nie dało się doscrollować (chował się pod paskiem czasu).
      const endCy = this._drawMissionConfig(ctx, x, cy, w, h - (cy + _scrollY - y), pad, vessel, ms, colMgr);
      if (typeof endCy === 'number' && endCy > cy) cy = endCy;
      return; // Konfigurator zastępuje akcje i log (finally → _finishRight)
    }

    // ── Akcje ────────────────────────────────────────────────
    cy = this._drawActions(ctx, x, cy, w, pad, vessel, ms, colMgr, activePid);

    // ── M3 P3.1 — Rally assignment section ───────────────────
    cy = this._drawRallyAssignSection(ctx, x, cy, w, pad, vessel);

    // ── Log misji ────────────────────────────────────────────
    // Naturalna (ograniczona) wysokość → część przewijalnej treści (advance cy).
    if (vessel.missionLog.length > 0) {
      const logH = 16 + Math.min(8, vessel.missionLog.length) * 14 + 4;
      this._drawMissionLog(ctx, x, cy, w, logH, pad, vessel);
      cy += logH;
    }
    } finally {
      _finishRight();   // ZAWSZE: restore ctx (nawet przy wyjątku w renderze powyżej)
    }
  }


  // ═══ K7-B — inspektor konsoli (FEATURES.consoleCommand): FAKTY dla `CommandInspectorView` ═══════════════════════════
  // Każdy predykat poniżej jest przepisany 1:1 z gałęzi statku `_drawRight` / `_drawActions` / `_drawRallyAssignSection`
  // (te same gettery, te same warunki, ta sama kolejność). Keeper `console_inspector_smoke` porównuje strefy ON z OFF.

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

  // Wskaźnik scrolla prawego panelu (cienki pasek przy prawej krawędzi).
  _drawRightScrollbar(ctx, x, y, w, h) {
    const contentH = this._rightContentH || 0;
    if (contentH <= h + 1) return;   // wszystko widoczne → brak paska
    const trackX = x + w - 4, trackY = y + 2, trackH = h - 4;
    const thumbH = Math.max(20, trackH * (h / contentH));
    const maxS = contentH - h;
    const thumbY = trackY + (trackH - thumbH) * (maxS > 0 ? ((this._rightScrollY || 0) / maxS) : 0);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(trackX, trackY, 3, trackH);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = THEME.accent;
    ctx.fillRect(trackX, thumbY, 3, thumbH);
    ctx.restore();
  }

  // M3 P3.1 — sekcja rally assignment (RIGHT detail panel).
  // Stan A (vessel NIE w żadnym rally): button "Przypisz do Rally..."
  // Stan B (vessel w rally): "Przypisany do: 'X'" + button "Zmień rally..." +
  //                          osobny button "Usuń" (bez modala — direct remove)
  _drawRallyAssignSection(ctx, x, cy, w, pad, vessel) {
    const reg = window.KOSMOS?.poiRegistry;
    if (!reg?.listPOIs) return cy;

    const rallies = reg.listPOIs({ type: 'rally' }) ?? [];
    // Hide section gdy zero rally POI istnieje (avoid clutter)
    if (rallies.length === 0) return cy;

    // Lookup current rally assignment
    let currentRally = null;
    for (const r of rallies) {
      if ((r.memberVesselIds ?? []).includes(vessel.id)) { currentRally = r; break; }
    }

    cy += 4;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.rally.sectionHeader'), x + pad, cy + 10);
    cy += 18;

    const btnH = 24;
    const fullBtnW = w - pad * 2;

    if (!currentRally) {
      // Stan A — assign button (full-width)
      _drawSectionButton(ctx, x + pad, cy, fullBtnW, btnH, t('fleet.rally.notAssigned'), THEME.accent, THEME.successDim);
      this._hitZones.push({
        x: x + pad, y: cy, w: fullBtnW, h: btnH,
        type: 'rally_assign_open', data: { vesselId: vessel.id, currentRallyId: null },
      });
      cy += btnH + 6;
    } else {
      // Stan B — label + "change" + "remove" buttons
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      const nameTrim = (currentRally.name ?? '?').length > 18
        ? currentRally.name.slice(0, 17) + '…' : currentRally.name;
      ctx.fillText(t('fleet.rally.assigned', nameTrim), x + pad, cy + 11);
      cy += 18;

      const halfBtnW = (fullBtnW - 6) / 2;
      _drawSectionButton(ctx, x + pad, cy, halfBtnW, btnH, t('fleet.rally.change'), THEME.textSecondary, THEME.border);
      this._hitZones.push({
        x: x + pad, y: cy, w: halfBtnW, h: btnH,
        type: 'rally_assign_open', data: { vesselId: vessel.id, currentRallyId: currentRally.id },
      });
      _drawSectionButton(ctx, x + pad + halfBtnW + 6, cy, halfBtnW, btnH, t('fleet.rally.remove'), THEME.danger ?? '#ff4444', 'rgba(255,51,68,0.5)');
      this._hitZones.push({
        x: x + pad + halfBtnW + 6, y: cy, w: halfBtnW, h: btnH,
        type: 'rally_assign_remove', data: { vesselId: vessel.id, rallyId: currentRally.id },
      });
      cy += btnH + 6;
    }

    return cy;
  }

  // ── Ship picker (prawy panel — wybór statku do wysyłki warp) ───────────────

  // ── Specyfikacja statku (panel prawy) ──────────────────────────────────────

  _drawShipSpecs(ctx, x, cy, w, pad, ship, vessel) {
    const specFont = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const valFont  = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const lineH = 14;
    const labelX = x + pad;
    const valX   = x + pad + 58;
    const maxW   = w - pad * 2;

    // Opis kadłuba (wrapped, dimmed) — locale-aware (było: ship.description = zawsze PL)
    const desc = getDesc(ship, 'ship');
    if (desc) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      for (const line of this._wrapTextWidth(ctx, desc, maxW)) {
        ctx.fillText(line, labelX, cy + 10);
        cy += lineH;
      }
      cy += 4;
    }

    // Nagłówek sekcji OSIĄGI
    ctx.font = valFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.specsHeader'), labelX, cy + 10);
    cy += 16;

    // Helper: wiersz „etykieta  wartość" (obcięty do szerokości panelu)
    const specLine = (label, value, col = THEME.textPrimary) => {
      ctx.font = specFont; ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, labelX, cy + 10);
      ctx.font = valFont;  ctx.fillStyle = col;
      ctx.fillText(this._truncate(ctx, value, x + w - pad - valX), valX, cy + 10);
      cy += lineH;
    };

    // ── Prędkość: baza → efektywna (z tech). Koniec dubla ze siatką 2×2 ──
    const baseSpeed = vessel?.speedAU ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0;
    const techMult  = window.KOSMOS?.techSystem?.getShipSpeedMultiplier?.() ?? 1;
    const effSpeed  = baseSpeed * techMult;
    specLine(t('fleet.designSpeed'), techMult > 1.01
      ? `${baseSpeed.toFixed(1)} → ${effSpeed.toFixed(1)} AU/r`
      : `${baseSpeed.toFixed(1)} AU/r`);

    // Zasięg (+ warp jeśli statek ma bak warp)
    const vesselFuelPerAU = vessel?.fuel?.consumption ?? ship.fuelPerAU ?? 0.5;
    const vesselFuelCap = vessel?.fuel?.max ?? ship.fuelCapacity ?? 10;
    const range = vesselFuelPerAU > 0 ? vesselFuelCap / vesselFuelPerAU : (ship.range ?? 20);
    let rangeText = `${range.toFixed(1)} AU`;
    if (vessel?.warpFuel?.max > 0) rangeText += ` / ${warpRange(vessel).toFixed(1)} LY`;
    specLine(t('fleet.shipRange'), rangeText);

    // Typ paliwa — locale-aware (getShort czyta commodity.<id>.short PL/EN;
    // było COMMODITY_SHORT = def.namePL = zawsze PL, przeciek „Paliwo" w trybie EN)
    specLine(t('fleet.shipFuelType'), getShort(ship.fuelType));

    // Masa
    const totalMass = vessel?.totalMass ?? ship.baseMass ?? 0;
    if (totalMass > 0) specLine(t('fleet.designMass'), `${totalMass} t`);

    // Ładownia (jeśli > 0)
    const cargoCapacity = vessel?.cargoMax ?? ship.cargoCapacity ?? 0;
    if (cargoCapacity > 0) specLine(t('fleet.shipCargo'), `${cargoCapacity} t`);

    // Załoga
    specLine(t('fleet.shipCrew'), `${ship.crewCost} POP`);

    // Zdolności
    if (ship.capabilities?.length > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipCapabilities'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.mint ?? THEME.accent;
      const capIcons = {
        recon: '🔭', survey: '📡', deep_scan: '🛰',
        colony: '🏗', cargo: '📦',
      };
      const capText = ship.capabilities.map(c => capIcons[c] ?? c).join(' ');
      ctx.fillText(capText, valX, cy + 10);
      cy += lineH;
    }

    cy += 6;
    return cy;
  }

  // ── Sekcja MODUŁY — pełna lista modułów zainstalowanych na statku ──────────
  // Sedno statku modułowego: pokazuje z CZEGO statek się składa (napęd + użytkowe),
  // każdy wiersz = ikona slotu + etykieta slotu (dim) + nazwa modułu (bright).
  // Licznik used/max ze slotów kadłuba (baseModuleSlots / slots[].length).
  _drawModulesSection(ctx, x, cy, w, pad, ship, vessel) {
    const mods   = vessel.modules ?? [];
    const labelX = x + pad;
    const valX   = x + pad + 78;
    const used   = mods.length;
    const max    = ship?.baseModuleSlots ?? ship?.slots?.length ?? used;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${t('fleet.modulesHeader')} (${used}/${max})`, labelX, cy + 10);
    cy += 18;

    if (used === 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.noModules'), labelX, cy + 10);
      return cy + 16;
    }

    for (const id of mods) {
      const m    = SHIP_MODULES[id];
      const slot = MODULE_SLOT_INFO[m?.slotType] ?? { icon: '▪', key: null };
      // Ikona slotu
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(slot.icon, labelX, cy + 11);
      // Etykieta slotu (dim)
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(slot.key ? t(slot.key) : (m?.slotType ?? ''), labelX + 18, cy + 11);
      // Nazwa modułu (bright; danger gdy nieznany moduł)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = m ? THEME.textPrimary : THEME.danger;
      ctx.fillText(this._truncate(ctx, m ? getName(m, 'module') : id, x + w - pad - valX), valX, cy + 11);
      cy += 15;
    }
    return cy + 4;
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

  // ── Zakładka JEDNOSTKI: katalog + rekrutacja jednostek naziemnych ───────────
  // Panel to prawa połowa UnitDesignOverlay (wspólny stan z klawiszem U). Hity
  // ('ground:*') trafiają do wspólnej _hitZones i są delegowane w _handleHit.
  _drawGroundTab(ctx, x, y, w, h) {
    const editor = this._getDesignEditor();
    if (!editor?._groundPanel) return;   // headless/brak rejestracji → pusto
    const savedHits = editor._hitZones;
    editor._hitZones = this._hitZones;   // hity panelu do wspólnej tablicy
    editor._groundPanel.draw(ctx, x, y, w, h);
    editor._hitZones = savedHits;
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

  // ── M1 Targeting — read-only label movementOrder (§8.4) ───────────────
  //
  // Format: ikona + label. Brak orderu → zwraca cy bez zmian (nic nie rysuje).
  //   moveToPoint: → MoveTo: (x,y)
  //   pursue:      ⚔ Pursue: <target name>
  //   intercept:   ⊕ Intercept: <target name>
  //   patrol:      ↻ Patrol
  //   escort:      🛡 Escort: <target name>
  //   status blocked: ⚠ Order blocked: <reason>
  _drawMovementOrderLabel(ctx, x, cy, w, pad, vessel) {
    const line = this._movementOrderLine(vessel);
    if (!line) return cy;
    const { label, color } = line;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = color;
    ctx.fillText(label, x + pad, cy + 10);
    return cy + 18;
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

  // ── M3 P1.4 — przycisk anulowania orderu ──────────────────────────────────
  //
  // Rysowany tuż pod _drawMovementOrderLabel. Widoczny TYLKO gdy
  // vessel.movementOrder.status === 'active' — MOS.cancelOrder odrzuca
  // blocked/completed (V1, MovementOrderSystem.js:989). Klik dispatchuje
  // zone 'cancel_movement_order' obsługiwany w _handleHit.
  _drawCancelOrderButton(ctx, x, cy, w, pad, vessel) {
    const order = vessel?.movementOrder;
    if (!order || order.status !== 'active') return cy;

    const btnW = w - pad * 2;
    const btnH = 20;
    ctx.fillStyle = 'rgba(255,80,80,0.10)';
    ctx.fillRect(x + pad, cy, btnW, btnH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, cy, btnW, btnH);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.textAlign = 'center';
    ctx.fillText(`✕ ${t('fleet.cancelOrder')}`, x + w / 2, cy + 14);
    ctx.textAlign = 'left';
    this._hitZones.push({
      x: x + pad, y: cy, w: btnW, h: btnH,
      type: 'cancel_movement_order', data: { vesselId: vessel.id },
    });
    return cy + btnH + 6;
  }

  // ── Aktywna misja ─────────────────────────────────────────────────────────

  _drawActiveMission(ctx, x, cy, w, pad, mission, vessel) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.activeMission'), x + pad, cy + 10);

    const targetName = mission.targetName ?? _resolveName(mission.targetId);
    const typeName = this._missionTypeName(mission.type);
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    let missionLabel = `${typeName} → ${targetName}`;
    const maxMissionW = w - pad * 2;
    while (missionLabel.length > 6 && ctx.measureText(missionLabel).width > maxMissionW) {
      missionLabel = missionLabel.slice(0, -2) + '…';
    }
    ctx.fillText(missionLabel, x + pad, cy + 26);

    // Faza + ETA
    const phase = mission.status ?? 'transit';
    // B2 (F4 live-gate): no_housing = statek stoi w doku (nie „Tranzyt"); ETA nieaktualne → ukryj.
    const isWaitingHousing = phase === 'no_housing';
    const phasePL = phase === 'returning' ? t('fleet.phaseReturn') : phase === 'orbiting' ? t('fleet.phaseOrbiting') : phase === 'working' ? t('fleet.phaseWorking') : isWaitingHousing ? t('fleet.phaseWaitingHousing') : t('fleet.phaseTransit');
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const eta = (mission.arrivalYear && !isWaitingHousing) ? t('fleet.etaYearLabel', Math.ceil(mission.arrivalYear)) : '';
    ctx.fillText(`${phasePL}  ${eta}`, x + pad, cy + 42);

    // Pasek postępu
    const pct = mission.progressPct ?? 0;
    if (pct > 0) {
      const barX = x + pad;
      const barY = cy + 48;
      const barW = w - pad * 2;
      const barH = 5;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(barX, barY, Math.round(barW * Math.min(1, pct)), barH);
    }

    // Separator
    cy += 62;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    return cy;
  }

  // Manifest misji: plan wysyłki (mission.cargo), stan aktualny (vessel.cargo) i plan powrotny (returnCargoSpec)
  _drawMissionManifest(ctx, x, cy, w, pad, mission, vessel) {
    const LH = 14;
    const plan = mission?.cargo ?? {};
    const onBoard = vessel?.cargo ?? {};
    const returnSpec = mission?.returnCargoSpec ?? null;

    const planEntries = Object.entries(plan).filter(([, q]) => q > 0);
    const boardEntries = Object.entries(onBoard).filter(([, q]) => q > 0);
    const returnEntries = returnSpec ? Object.entries(returnSpec).filter(([, q]) => q > 0) : [];

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.manifestHeader'), x + pad, cy + 10);
    cy += LH + 2;

    // Dla pętli: etap cyklu
    if (mission?.loop) {
      const legColor = mission.leg === 'outbound' ? THEME.warning
                     : mission.leg === 'return'   ? THEME.success
                     : THEME.textDim;
      const legLabel = mission.leg === 'outbound' ? t('fleet.legOutbound')
                     : mission.leg === 'return'   ? t('fleet.legReturn')
                     : mission.leg === 'waiting_reload' ? t('fleet.legWaitingReload')
                     : mission.leg === 'waiting_return_cargo' ? t('fleet.legWaitingReturnCargo')
                     : (mission.leg ?? '');
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.loopCycleLabel'), x + pad, cy + 9);
      ctx.fillStyle = legColor;
      ctx.fillText(legLabel, x + pad + 52, cy + 9);
      cy += LH - 2;
    }

    // Pomocnik: rysuje kompaktową listę towarów
    const drawItems = (entries, compareWith, maxRows) => {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      const shown = entries.slice(0, maxRows);
      for (const [id, qty] of shown) {
        const icon = _cargoIcon(id);
        const name = _cargoName(id);
        let color = THEME.textPrimary;
        if (compareWith) {
          const planQty = compareWith[id] ?? 0;
          if (qty >= planQty && planQty > 0) color = THEME.success;
          else if (qty > 0 && qty < planQty) color = THEME.warning;
          else if (qty === 0) color = THEME.textDim;
        }
        ctx.fillStyle = color;
        ctx.fillText(`${icon} ${_truncateStr(name, 14)}`, x + pad + 6, cy + 9);
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(qty)}`, x + w - pad - 4, cy + 9);
        ctx.textAlign = 'left';
        cy += LH - 2;
      }
      if (entries.length > maxRows) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.manifestMore', entries.length - maxRows), x + pad + 6, cy + 9);
        cy += LH - 2;
      }
    };

    // Plan wysyłki (manifest outbound) — tylko dla en_route lub returning z wyraźnym planem
    if (planEntries.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.manifestPlanned'), x + pad, cy + 9);
      cy += LH - 2;
      drawItems(planEntries, null, 4);
      cy += 2;
    }

    // Na pokładzie (rzeczywisty stan)
    if (boardEntries.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.manifestOnBoard'), x + pad, cy + 9);
      cy += LH - 2;
      const compare = planEntries.length > 0 ? plan : null;
      drawItems(boardEntries, compare, 4);
      cy += 2;
    }

    // Plan powrotny (tylko dla pętli)
    if (returnEntries.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.manifestReturn'), x + pad, cy + 9);
      cy += LH - 2;
      drawItems(returnEntries, null, 4);
      cy += 2;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    return cy;
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

  /**
   * W2-6 — jeden przycisk osi służby: Wycofaj (służba → rezerwa) / Rozmieść (rezerwa → służba),
   * albo pasek postępu, gdy przejście już trwa. Rysowany PRZED `getAvailableActions`, patrz
   * komentarz w `_drawActions`.
   * @returns {number} nowe `cy`
   */
  _drawServiceStateAction(ctx, x, cy, w, pad, vessel) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?.deployVessel || !vessel || vessel.isWreck) return cy;

    const state = vessel.serviceState ?? 'active';
    const btnW = Math.min(160, w - pad * 2);
    const btnH = 26;

    if (state === 'mobilizing') {
      const prog = Math.max(0, Math.min(1, (vessel.mobilizeProgress ?? 0) / 1.0));
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const label = vessel.mobilizeTarget === 'stored' ? t('fleet.withdrawing') : t('fleet.mobilizing');
      ctx.fillText(label, x + pad, cy + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(x + pad, cy + 16, btnW, 8);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(x + pad, cy + 16, btnW * prog, 8);
      return cy + 32;
    }

    const toReserve = state === 'active';
    const label = toReserve ? `📦 ${t('fleet.withdrawAction')}` : `⚓ ${t('fleet.deployAction')}`;
    ctx.fillStyle = toReserve ? 'rgba(50,50,70,0.75)' : 'rgba(40,90,60,0.8)';
    ctx.fillRect(x + pad, cy, btnW, btnH);
    ctx.strokeStyle = toReserve ? THEME.border : THEME.success;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad + 0.5, cy + 0.5, btnW - 1, btnH - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + pad + btnW / 2, cy + 17);
    ctx.textAlign = 'left';
    this._hitZones.push({
      x: x + pad, y: cy, w: btnW, h: btnH,
      type: toReserve ? 'withdraw_vessel' : 'deploy_vessel',
      data: { vesselId: vessel.id },
    });
    return cy + btnH + 6;
  }

  _drawActions(ctx, x, cy, w, pad, vessel, ms, colMgr, activePid) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.actionsHeader'), x + pad, cy + 10);
    cy += 18;

    const state = {
      missionSystem: ms,
      vesselManager: window.KOSMOS?.vesselManager,
      colonyManager: colMgr,
      techSystem: window.KOSMOS?.techSystem,
      activePlanetId: activePid,
    };

    // ⚠ W2-6 (audyt §S19) — PRZED early returnem. `getAvailableActions` bywa pusta dokładnie
    //    wtedy, gdy okręt jest bezczynny — czyli ZAWSZE dla kadłuba w rezerwie. Przycisk
    //    dopisany na końcu tej metody byłby niedostępny w jedynym stanie, w którym jest
    //    potrzebny. Ta sama pułapka zjadała już Rozbiórkę, Tankowanie i pulę logistyczną.
    cy = this._drawServiceStateAction(ctx, x, cy, w, pad, vessel);

    const actions = getAvailableActions(vessel, state);
    if (actions.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.noAvailableActions'), x + pad, cy + 12);
      return cy + 20;
    }

    // Grid 2×N
    const btnW = (w - pad * 2 - 6) / 2;
    const btnH = 28;
    const gap = 4;

    // Zbierz powody blokad (do wyświetlenia pod przyciskami)
    const disabledReasons = [];

    for (let i = 0; i < actions.length; i++) {
      const { action, ok, reason } = actions[i];
      const col = i % 2;
      const row = Math.floor(i / 2);
      const bx = x + pad + col * (btnW + gap);
      const by = cy + row * (btnH + gap);

      const style = _actionStyle(action.id, ok);

      // Tło przycisku
      ctx.fillStyle = style.bg;
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = style.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, btnW, btnH);

      // Tekst (obcinaj jeśli nie mieści się w przycisku)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = style.fg;
      let aLabel = `${action.icon} ${action.label}`;
      const maxLabelW = btnW - 12;
      while (aLabel.length > 4 && ctx.measureText(aLabel).width > maxLabelW) {
        aLabel = aLabel.slice(0, -2) + '…';
      }
      ctx.fillText(aLabel, bx + 6, by + 18);

      if (ok) {
        this._hitZones.push({
          x: bx, y: by, w: btnW, h: btnH,
          type: 'action',
          data: { actionId: action.id, vessel },
        });
      } else if (reason) {
        // Zbierz unikalne powody blokad
        if (!disabledReasons.includes(reason)) disabledReasons.push(reason);
      }
    }

    const rows = Math.ceil(actions.length / 2);
    cy += rows * (btnH + gap) + 4;

    // Wyświetl powody blokad pod przyciskami
    if (disabledReasons.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger ?? '#ff4444';
      for (const reason of disabledReasons) {
        ctx.fillText(`⚠ ${reason}`, x + pad, cy + 10);
        cy += 14;
      }
      cy += 4;
    }

    // ── Przycisk DISBAND (tylko zadokowany w kolonii ze stocznią) ──
    cy += 4;
    const isDocked = vessel.position.state === 'docked';
    const colonyId = vessel.colonyId;
    const colony = colonyId ? colMgr?.getColony(colonyId) : null;
    const hasShipyard = colony ? colMgr._getShipyardLevel(colony) > 0 : false;
    const canDisband = isDocked && hasShipyard;

    const disbandW = w - pad * 2;
    const disbandH = 24;
    const dbx = x + pad;

    if (canDisband) {
      ctx.fillStyle = 'rgba(255,60,60,0.10)';
      ctx.fillRect(dbx, cy, disbandW, disbandH);
      ctx.strokeStyle = THEME.danger ?? '#ff4444';
      ctx.lineWidth = 1;
      ctx.strokeRect(dbx, cy, disbandW, disbandH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger ?? '#ff4444';
      ctx.fillText(t('fleet.disbandReturn'), dbx + 8, cy + 16);
      this._hitZones.push({
        x: dbx, y: cy, w: disbandW, h: disbandH,
        type: 'disband', data: { vesselId: vessel.id },
      });
    } else if (isDocked && !hasShipyard) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.disbandRequiresShipyard'), dbx, cy + 14);
    }
    cy += disbandH + 4;

    // ── S3.3b-S3b — ręczny Refuel (zawsze gdy docked) + toggle Auto-refuel (default ON) ──
    if (isDocked) {
      const halfW = (w - pad * 2 - 4) / 2;
      const rfH = 22;
      // Lewa: ⛽ Refuel (jednorazowe dotankowanie z dockedAt — kolonia lub stacja)
      ctx.fillStyle = 'rgba(0,200,255,0.10)';
      ctx.fillRect(dbx, cy, halfW, rfH);
      ctx.strokeStyle = THEME.info ?? THEME.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(dbx, cy, halfW, rfH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info ?? THEME.accent;
      ctx.fillText(t('fleet.refuelNow'), dbx + 6, cy + 15);
      this._hitZones.push({ x: dbx, y: cy, w: halfW, h: rfH, type: 'manual_refuel', data: { vesselId: vessel.id } });
      // Prawa: toggle Auto-refuel
      const autoOn = vessel.refuelAutomatically ?? true;
      const tx2 = dbx + halfW + 4;
      ctx.fillStyle = autoOn ? 'rgba(20,60,40,0.7)' : 'rgba(60,30,30,0.6)';
      ctx.fillRect(tx2, cy, halfW, rfH);
      ctx.strokeStyle = autoOn ? THEME.success : THEME.danger;
      ctx.strokeRect(tx2, cy, halfW, rfH);
      ctx.fillStyle = autoOn ? THEME.success : THEME.danger;
      ctx.fillText(autoOn ? t('fleet.refuelAutoOn') : t('fleet.refuelAutoOff'), tx2 + 6, cy + 15);
      this._hitZones.push({ x: tx2, y: cy, w: halfW, h: rfH, type: 'toggle_refuel_auto', data: { vesselId: vessel.id } });
      cy += rfH + 4;
    }

    // ── Toggle „w puli logistycznej" (MVP Zlecenia Transportowe) ──
    // BEZ warunku isDocked — członkostwo w puli jest trwałe, niezależne od doku.
    const tos = window.KOSMOS?.transportOrderSystem;
    if (GAME_CONFIG.FEATURES?.transportOrders && tos && !isEnemyVessel(vessel)) {
      const inPool = tos.isInPool?.(vessel.id) ?? false;
      const plW = w - pad * 2;
      const plH = 22;
      ctx.fillStyle = inPool ? 'rgba(20,60,80,0.7)' : 'rgba(40,40,40,0.5)';
      ctx.fillRect(dbx, cy, plW, plH);
      ctx.strokeStyle = inPool ? THEME.accent : THEME.border;
      ctx.lineWidth = 1; ctx.strokeRect(dbx + 0.5, cy + 0.5, plW - 1, plH - 1);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = inPool ? THEME.accent : THEME.textSecondary;
      ctx.fillText(inPool ? t('fleet.removeFromPool') : t('fleet.addToPool'), dbx + 8, cy + 15);
      this._hitZones.push({ x: dbx, y: cy, w: plW, h: plH, type: 'toggle_logistics_pool', data: { vesselId: vessel.id } });
      cy += plH + 4;
    }

    return cy;
  }

  // ── Konfigurator misji ────────────────────────────────────────────────────

  _drawMissionConfig(ctx, x, cy, w, maxH, pad, vessel, ms, colMgr) {
    const config = this._missionConfig;
    const action = FLEET_ACTIONS[config.actionId];
    if (!action) return cy;

    if (config.step === 'select') {
      return this._drawTargetPicker(ctx, x, cy, w, maxH, pad, vessel, action, ms);
    } else if (config.step === 'confirm') {
      return this._drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action);
    }
    return cy;
  }

  /** K7-C — definicja akcji floty (konsola nie importuje danych akcji osobno). */
  _fleetActionDef(actionId) { return FLEET_ACTIONS[actionId] ?? null; }

  /** Podpowiedź „kolonizacja innego układu idzie z mapy galaktyki” — statek warp + kolonizacja (OFF i konsola). */
  _cfgColonizeCrossHint(vessel, actionId) {
    const isWarpShip = (vessel.warpFuel?.max ?? 0) > 0
      || (vessel.modules ?? []).some(m => SHIP_MODULES[m]?.warpCapable);
    return actionId === 'colonize' && isWarpShip;
  }

  _drawTargetPicker(ctx, x, cy, w, maxH, pad, vessel, action, ms) {
    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('fleet.selectTargetFor', action.label.toUpperCase()), x + pad, cy + 14);
    cy += 16;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.clickBodyOnMap'), x + pad, cy + 8);
    cy += 14;

    // Statek warp: picker listuje TYLKO aktywny układ. Kolonizacja innego układu idzie
    // osobnym torem (skok z mapy galaktyki → orbituj ciało → „Kolonizuj obcy"). Podpowiedź, bo
    // z tego przycisku cel cross-system jest nieosiągalny.
    if (this._cfgColonizeCrossHint(vessel, this._missionConfig.actionId)) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info;
      ctx.fillText(t('fleet.colonizeCrossSystemHint'), x + pad, cy + 8);
      cy += 14;
    }

    // Lista celów — rysowana jako część PRZEWIJALNEJ treści prawego panelu
    // (advance cy), NIE jako osobny wewnętrzny scroll. Dzięki temu cały panel
    // (szczegóły statku + picker) przewija się jednym `_rightScrollY`; wcześniej
    // picker miał własny `_targetScrollOffset` i mikroskopijny clip przy dole
    // panelu → nie dawało się przewinąć do listy celów ani ANULUJ.
    const targets = this._getValidTargets(vessel, this._missionConfig.actionId);
    const rowH = 24;

    let lastGroupSysName = null;   // Slice D — subheader grupy układu (cross-system)
    for (const tgt of targets) {
      // Slice D — subheader dla celów w INNYM układzie (grupowanie po nazwie układu).
      if (tgt.sameSystem === false && tgt.systemName !== lastGroupSysName) {
        lastGroupSysName = tgt.systemName;
        ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.info;
        ctx.fillText(`🪐 ${t('fleet.otherSystem')}: ${tgt.systemName}`, x + pad, cy + 12);
        cy += 16;
      }

      const ry = cy;

      // Ikona + nazwa + odległość
      const icon = tgt.type === 'planet' ? '🌍' : tgt.type === 'moon' ? '🌙' : tgt.type === 'planetoid' ? '🪨' : tgt.type === 'station' ? '🛰' : '☄';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = tgt.reachable ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(`${icon} ${(tgt.name ?? '?').slice(0, 10)}`, x + pad, ry + 16);

      // Odległość — same-system w AU, cross-system w latach świetlnych (warp).
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textSecondary;
      const distLabel = (tgt.distAU != null) ? `${tgt.distAU.toFixed(1)} AU` : `${(tgt.distLY ?? 0).toFixed(1)} ly`;
      ctx.fillText(distLabel, x + w - pad - 60, ry + 16);

      // Badge
      let badge = '', badgeColor = THEME.textDim;
      if (!tgt.reachable) { badge = t('fleet.badgeTooFar'); badgeColor = THEME.danger; }
      else if (!tgt.explored) { badge = t('fleet.badgeUnexplored'); badgeColor = THEME.accent; }
      else if (this._missionConfig?.actionId === 'found_outpost' && tgt.colonyStatus === 'colony') {
        badge = t('fleet.target.existingColony'); badgeColor = THEME.warning;
      }
      else if (this._missionConfig?.actionId === 'found_outpost' && tgt.colonyStatus === 'outpost') {
        badge = t('fleet.target.existingOutpost'); badgeColor = THEME.warning;
      }
      else if (tgt.sameSystem === false) { badge = t('fleet.badgeWarp'); badgeColor = THEME.info; }
      else { badge = t('fleet.badgeExplored'); badgeColor = THEME.textDim; }

      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      if (tgt.reachable) {
        this._hitZones.push({
          x, y: ry, w, h: rowH,
          type: 'select_target',
          data: { targetId: tgt.id, targetSystemId: tgt.systemId ?? null },
        });
      }

      // Separator
      ctx.strokeStyle = 'rgba(0,255,180,0.07)';
      ctx.beginPath(); ctx.moveTo(x + pad, ry + rowH - 1); ctx.lineTo(x + w - pad, ry + rowH - 1); ctx.stroke();

      cy += rowH;
    }

    // Przycisk ANULUJ
    const cancelY = cy + 6;
    const cancelW = 80;
    const cancelX = x + w / 2 - cancelW / 2;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(cancelX, cancelY, cancelW, 24);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(cancelX, cancelY, cancelW, 24);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText(t('fleet.cancel'), cancelX + cancelW / 2, cancelY + 16);
    ctx.textAlign = 'left';

    this._hitZones.push({ x: cancelX, y: cancelY, w: cancelW, h: 24, type: 'cancel_config', data: {} });

    return cancelY + 24;   // dolna krawędź (ANULUJ) → pomiar _rightContentH
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

  _drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action) {
    const f = this._missionConfirmFacts(vessel);
    if (!f) { this._missionConfig = null; return cy; }
    const target = f.target;
    const targetId = f.targetId;

    // Cel
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${action.icon} ${action.label.toUpperCase()}`, x + pad, cy + 14);
    cy += 22;

    // Cel: ikona+nazwa + [ZMIEŃ]
    const targetIcon = target.type === 'planet' ? '🌍' : target.type === 'moon' ? '🌙' : '🪨';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${targetIcon} ${target.name ?? targetId}`, x + pad, cy + 14);

    // Przycisk [ZMIEŃ]
    const chgX = x + w - pad - 50;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.changeTargetBracket'), chgX, cy + 14);
    this._hitZones.push({ x: chgX - 2, y: cy, w: 54, h: 18, type: 'change_target', data: {} });
    cy += 24;

    // Slice D — cel w INNYM układzie: pokaż notkę o auto-łańcuchu warp→dostawa
    // zamiast mylącej tabeli AU (dystans/paliwo in-system nie dotyczą skoku warp).
    const isCrossSystem = f.isCrossSystem;
    if (isCrossSystem) {
      const sysName = f.sysName;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info;
      ctx.fillText(t('fleet.crossSystemDelivery', sysName), x + pad, cy + 12);
      cy += 18;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.crossSystemDeliveryHint'), x + pad, cy + 12);
      cy += 22;
    }

    // Tabela: odległość, czas lotu, paliwo (tylko same-system)
    const { distAU, travelYears, fuelCost } = f;

    const tableData = isCrossSystem ? [] : [
      [t('fleet.distanceLabel'), `${distAU.toFixed(2)} AU`],
      [t('fleet.travelTime'), travelYears < 1 ? t('fleet.etaDays', Math.ceil(travelYears * 365)) : t('fleet.etaYears', travelYears.toFixed(1))],
      [t('fleet.fuelOneWay'), `${fuelCost.toFixed(1)} pc`],
    ];

    for (const [label, value] of tableData) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, x + pad, cy + 12);
      ctx.fillStyle = THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(value, x + w - pad, cy + 12);
      ctx.textAlign = 'left';
      cy += 18;
    }

    // ETA (duże) — tylko same-system (cross-system ETA = warp, liczony przy dispatchu).
    if (!isCrossSystem) {
      const eta = f.eta;
      ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.etaYearLabel', Math.ceil(eta)), x + w / 2, cy + 22);
      ctx.textAlign = 'left';
      cy += 34;
    }

    // Checkbox "Powtarzaj" — dla transportu ze statkami z ładownią.
    // vessel.cargoMax (z modułów) lub ship.cargoCapacity (legacy SHIPS) — nowoczesne
    // statki projektowane z modułów mają pojemność tylko na vessel.cargoMax.
    const config = this._missionConfig;
    if (f.repeatOption) {
      const cbSize = 14;
      const cbX = x + pad;
      const cbY = cy;
      const checked = config.repeat ?? false;
      ctx.fillStyle = checked ? 'rgba(20,60,40,0.8)' : 'rgba(20,20,30,0.5)';
      ctx.fillRect(cbX, cbY, cbSize, cbSize);
      ctx.strokeStyle = checked ? THEME.success : THEME.border;
      ctx.strokeRect(cbX, cbY, cbSize, cbSize);
      if (checked) {
        ctx.font = `bold ${cbSize - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.success; ctx.textAlign = 'center';
        ctx.fillText('✓', cbX + cbSize / 2, cbY + cbSize - 2); ctx.textAlign = 'left';
      }
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(t('fleet.repeatAuto'), cbX + cbSize + 6, cbY + 11);
      this._hitZones.push({ x: cbX, y: cbY, w: w - pad * 2, h: cbSize, type: 'toggle_repeat', data: {} });
      cy += cbSize + 8;

      // Przycisk "Ustaw ładunek powrotny" — gdy repeat zaznaczony i cel ma kolonię
      if (checked) {
        const colMgr = window.KOSMOS?.colonyManager;
        const targetColony = colMgr?.getColony(config.targetId) ?? null;
        if (targetColony) {
          const rcCount = config.returnCargo ? Object.keys(config.returnCargo).length : 0;
          const rcLabel = rcCount > 0
            ? t('fleet.returnCargoStatus', rcCount)
            : t('fleet.returnCargoNone');
          const btnRetH = 22;
          ctx.fillStyle = 'rgba(20,40,60,0.7)';
          ctx.fillRect(cbX, cy, w - pad * 2, btnRetH);
          ctx.strokeStyle = THEME.borderActive;
          ctx.strokeRect(cbX, cy, w - pad * 2, btnRetH);
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.accent; ctx.textAlign = 'center';
          ctx.fillText(t('fleet.setReturnCargo'), x + w / 2, cy + 15);
          ctx.textAlign = 'left';
          this._hitZones.push({ x: cbX, y: cy, w: w - pad * 2, h: btnRetH, type: 'set_return_cargo', data: {} });
          cy += btnRetH + 4;
          // Status ładunku powrotnego
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(rcLabel, cbX, cy + 8);
          cy += 14;
        }
      }
    }

    // Przycisk ▶ WYŚLIJ MISJĘ
    // (d) Luka B — gdy paliwa nie starcza na dolot (one-way), przycisk wyszarzony
    // "⛽ BRAK PALIWA" i NIEklikalny (jednoznacznie zamiast mylącego "za daleko").
    // fuelCost policzony wyżej (one-way) — spójny z obroną systemową w MissionSystem.
    const insufficientFuel = f.insufficientFuel;
    const sendW = w - pad * 2;
    const sendH = 30;
    ctx.fillStyle = insufficientFuel ? 'rgba(255,68,102,0.10)' : 'rgba(0,255,180,0.12)';
    ctx.fillRect(x + pad, cy, sendW, sendH);
    ctx.strokeStyle = insufficientFuel ? THEME.danger : THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, cy, sendW, sendH);
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = insufficientFuel ? THEME.danger : THEME.accent;
    ctx.textAlign = 'center';
    ctx.fillText(insufficientFuel ? t('fleet.sendMissionNoFuel') : t('fleet.sendMission'), x + w / 2, cy + 20);
    ctx.textAlign = 'left';
    // Hit-zone tylko gdy starczy paliwa; obrona systemowa (MissionSystem) i tak łapie map-pick.
    if (!insufficientFuel) {
      this._hitZones.push({ x: x + pad, y: cy, w: sendW, h: sendH, type: 'confirm_mission', data: {} });
    }
    cy += sendH + 8;

    // Przycisk ANULUJ
    const cancelW = 80;
    const cancelX = x + w / 2 - cancelW / 2;
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(cancelX, cy, cancelW, 24);
    ctx.strokeStyle = THEME.border;
    ctx.strokeRect(cancelX, cy, cancelW, 24);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText(t('fleet.cancel'), cancelX + cancelW / 2, cy + 16);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: cancelX, y: cy, w: cancelW, h: 24, type: 'cancel_config', data: {} });

    return cy + 24;   // dolna krawędź (ANULUJ) → pomiar _rightContentH (scroll dociąga do WYŚLIJ)
  }

  // ── Log misji ─────────────────────────────────────────────────────────────

  _drawMissionLog(ctx, x, cy, w, maxH, pad, vessel) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.missionLog'), x + pad, cy + 10);
    cy += 16;

    const entries = vessel.missionLog.slice(-8).reverse();
    const lineH = 14;
    const colors = {
      info: THEME.textSecondary, success: THEME.success,
      warning: THEME.warning, danger: THEME.danger,
    };

    for (const entry of entries) {
      if (cy + lineH > x + maxH) break; // wyjdź poza przestrzeń
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const yearStr = entry.year ? `[${Math.floor(entry.year)}]` : '';
      ctx.fillText(yearStr, x + pad, cy + 10);

      ctx.fillStyle = colors[entry.type] ?? THEME.textSecondary;
      const text = (entry.text ?? '').slice(0, 18);
      ctx.fillText(text, x + pad + 40, cy + 10);
      cy += lineH;
    }
  }

  // ── Pobieranie celów ──────────────────────────────────────────────────────

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
