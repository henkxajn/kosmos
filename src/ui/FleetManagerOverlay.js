// FleetManagerOverlay — trójdzielny overlay zarządzania flotą
//
// Otwierany klawiszem F lub kliknięciem FLOTA w Outlinerze.
// Layout: LEFT (lista statków) | CENTER (mapa schematyczna) | RIGHT (szczegóły + akcje)
// Rysowany na Canvas 2D (#ui-canvas), NA WIERZCHU istniejącego UI.
// Logika misji delegowana do MissionSystem + FleetActions.

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { COSMIC }          from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W, getSubNavHeight }  from './CivPanelDrawer.js';
import { SHIPS }           from '../data/ShipsData.js';
import { HULLS }           from '../data/HullsData.js';
import { canBuildHullAt }  from '../data/ShipBuildRules.js';
import { SHIP_MODULES, calcShipStats, calcShipCost, countModuleSlots, getModuleCapabilities } from '../data/ShipModulesData.js';
import { RESOURCE_ICONS }  from '../data/BuildingsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { ALL_RESOURCES }   from '../data/ResourcesData.js';
import { TECHS }           from '../data/TechData.js';
import { effectiveRange, loadColonists, unloadColonists, isEnemyVessel, canJump, warpRange, canColonize as vesselCanColonize }  from '../entities/Vessel.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import { ALL_DOCTRINES, doctrineNameKey } from '../data/FleetDoctrines.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import EntityManager       from '../core/EntityManager.js';
import EventBus            from '../core/EventBus.js';
import { GAME_CONFIG }     from '../config/GameConfig.js';
import { DistanceUtils }   from '../utils/DistanceUtils.js';
import { tacticalToWorld, findHitZone, resolveTacticalTarget } from '../utils/TacticalRaycaster.js';
import { getPOILocation } from '../utils/POIPanelLogic.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import { tryCancelVesselOrder } from '../utils/MovementOrderCancellation.js';
import { planWarpRoute, WARP_ROUTE_REASONS } from '../utils/WarpRoutePlanner.js';
import { showCargoLoadModal } from '../ui/CargoLoadModal.js';
import { showDropTroopsModal } from '../ui/DropTroopsModal.js';
import { ColonistLoadModal } from '../ui/ColonistLoadModal.js';
import { showBodyDetailModal } from '../ui/BodyDetailModal.js';
import { showReturnCargoModal } from '../ui/ReturnCargoModal.js';
import { showFleetAssignModal } from './FleetAssignModal.js';
import { getOrderTargetInfo } from './OrderTargetInfo.js';
import { OutpostBuildingPicker } from '../ui/OutpostBuildingPicker.js';
import { showRallyAssignModal } from '../ui/RallyAssignModal.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
// UWAGA: NIE importujemy UnitDesignOverlay statycznie — pociąga three (GroundUnitPanel →
// GlbSnapshotRenderer) i psuje headless import. Edytor projektów do osadzenia w Stoczni
// bierzemy z zarejestrowanej instancji (window.KOSMOS.overlayManager.overlays.unit_design).

// ── Helper M4 P3: czy vessel bierze udział w aktywnym deep-space encounter ──
// Sprawdza DSCS._activeEncounters → vesselStates ma vessel.id. Read-only — wołane
// per-frame z render loop, więc tania lookup (Map.has).
function _isVesselInCombat(vesselId) {
  const dscs = window.KOSMOS?.deepSpaceCombatSystem;
  if (!dscs?._activeEncounters) return false;
  for (const enc of dscs._activeEncounters.values()) {
    if (!enc?.isActive) continue;
    if (enc.vesselStates?.has?.(vesselId)) return true;
  }
  return false;
}

// ── Helper detekcji wrogów: czy wrogi statek jest WYKRYTY z TOŻSAMOŚCIĄ (mapa taktyczna/listy) ──
// Po reformie detekcji obserwatorium (2026-06-25): wykrycie przez obserwatorium = poziom 'rumor'
// (pozycja bez tożsamości — ghost na scenie 3D). Mapa taktyczna pokazuje wroga z PEŁNĄ tożsamością
// (sprite + panel + tooltip), więc gateuje WYŁĄCZNIE intel >= 'contact' (statek gracza namierzył go
// z bliska / w walce — pozycja aktualna + identyfikacja). 'rumor'/'unknown' celowo NIE trafia na
// taktyczną — pokazany z nazwą/imperium byłby przeciekiem; ghost rumoru zostaje featurem sceny 3D.
// (Wcześniej short-circuit `obs.isVesselDetected` wynosił rumor do pełnego trackingu = przeciek.)
const _INTEL_RANK = { unknown: 0, rumor: 1, contact: 2, detailed: 3 };

// Poziom widoczności wroga (fog-of-war, spójny ze sceną 3D + Stratcom):
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

// ── Stałe layoutu ────────────────────────────────────────────────────────────
const LEFT_W    = 170;
const RIGHT_W   = 200;
const TAB_H     = 28;   // wysokość paska zakładek (tytuł + 4 zakładki) pod nagłówkiem overlay

// Typy hitów pochodzące z osadzonego edytora projektów (UnitDesignOverlay._drawShipDesigner) —
// delegowane do instancji edytora w _handleHit. ('ground:*' pomijamy — panel naziemny nie jest osadzany.)
const DESIGN_EDITOR_HIT_TYPES = new Set([
  'select_hull', 'select_slot', 'clear_slot', 'pick_module',
  'save_template', 'clear_design', 'edit_template', 'delete_template', 'tpl_row',
]);

// ── Stratcom (radar strategiczny) ─────────────────────────────────────────────
// Zasięg radaru galaktycznego per poziom obserwatorium (ly). Radar galaktyczny dopiero od Lv4 —
// Lv1-3 nie wykrywają statków warp (gwiazdy nadal zawsze widoczne jako mapa nawigacyjna).
const STRATCOM_LY_BY_LEVEL = [0, 0, 0, 0, 5, 10, 15];  // idx = poziom obserwatorium imperium
const STRATCOM_MAX_BLIPS = 14;   // miękki limit liczby gwiazd na radarze (czytelność)
const STRATCOM_GLOW    = true;  // animowana iluminacja tarczy radaru (ciągły redraw); false = wyłącz
const STRATCOM_GLOW_MS = 7000;  // okres „oddechu" podświetlenia [ms] — wolny, ambientowy
const STRATCOM_BG_BRIGHTNESS = 0.25;  // jasność tła-mgławicy paneli Stratcomu (0..1; 1.0 = bez tłumienia)
// Górny offset overlay. „Dowództwo Taktyczne" jest pojedynczą grupą nav (bez rodzeństwa
// Fleet/Designs) → brak subnav, więc overlay sięga aż pod górną belkę i to jego własny
// pasek zakładek (4 zakładki) zajmuje miejsce dawnego subnav. getSubNavHeight() liczone
// dynamicznie w draw() (== 0 dla fleet-singleton; defensywnie, gdyby kiedyś wrócił subnav).
const TOP_BASE  = COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H;
// Rezerwa dolna = pasek nawigacji (BOTTOM_NAV_H) + listwa dziennika (BOTTOM_LOG_TRIG_H) — jak
// BaseOverlay w civMode — PLUS pasek czasu (BottomControlBar, STRIP_H≈20 px), rysowany NA WIERZCHU
// nad nawigacją (UIManager _bottomNavBar/_bottomControlBar PO overlayManager). Bez rezerwy paska
// czasu dolna treść prawego panelu (akcje statku: Refuel / toggle „Tankuj automatycznie", scroll
// do końca) chowała się pod zawsze-wierzchnim sterowaniem czasu i była nieosiągalna mimo scrolla.
// (Wcześniej BOTTOM_BAR_H=26 → overlay wchodził ~36 px pod nawigację + pasek czasu.)
const TIME_STRIP_H = 20;   // = BottomControlBar.STRIP_H (pasek czasu nad nawigacją)
const BOTTOM_PAD = COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H + TIME_STRIP_H; // 36+6+20 = 62
const OUTLINER_W = COSMIC.OUTLINER_W;  // 180

// Kolory statusów statków
const STATUS_COLORS = {
  docked:     () => THEME.success,
  in_transit: () => THEME.warning,
  orbiting:   () => THEME.mint,
};

const STATUS_ICONS = {
  idle:       '✓',
  on_mission: '→',
  orbiting:   '⊙',
  refueling:  '⚡',
  damaged:    '!',
};

// Filtr — labele dynamiczne (i18n)
function _getFilterBtns() {
  return [
    { id: 'all',             label: t('fleet.filterAll') },
    { id: 'science_vessel',  label: '🛸' },
    { id: 'cargo_ship',      label: '📦' },
    { id: 'here',            label: t('fleet.filterHere') },
  ];
}

// ── Formatowanie roku gry ────────────────────────────────────────────────────
function _fmtYear(y) {
  if (y == null) return '?';
  if (y >= 1e9) return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6) return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1e4) return (y / 1e3).toFixed(0) + 'k';
  return String(Math.round(y));
}

// ── Ikona i label typu misji (do sekcji W LOCIE) ────────────────────────────
function _missionTypeIcon(type) {
  switch (type) {
    case 'recon': case 'survey': case 'deep_scan': return '🔭';
    case 'transport': return '📦';
    case 'passenger': return '🧑‍🚀';
    case 'colony': return '🏗';
    case 'mining': return '⛏';
    case 'trade_route': return '🔄';
    case 'interstellar_jump': return '🌀';
    default: return '🚀';
  }
}

function _missionTypeLabel(type) {
  const key = {
    recon: 'fleet.missionTypeRecon', survey: 'fleet.missionTypeSurvey',
    deep_scan: 'fleet.missionTypeDeepScan',
    mining: 'fleet.missionTypeMining', colony: 'fleet.missionTypeColony',
    transport: 'fleet.missionTypeTransport', trade_route: 'fleet.missionTypeTransport',
    passenger: 'fleet.missionTypePassenger',
    interstellar_jump: 'fleet.missionTypeInterstellar',
  }[type];
  return key ? t(key) : type || '';
}

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
    this._filter  = 'all';
    this._scrollOffset = 0;       // scroll listy statków (LEFT)
    this._selectedVesselId = null;
    this._hoverVesselId = null;
    // Player Fleet Groups (P2.5 outliner) — jedna lista z drzewem.
    //   _activeTab i _fleetScrollOffset usunięte (jeden widok, jeden scroll).
    //   _collapsedFleets — Set<fleetId> dla collapse state per fleet. Lokalne,
    //   nie persist między sesjami (decyzja gracza — startuj zawsze rozwinięte).
    //   _collapsedSections — Set<'ungrouped'|'enemy'|'wreck'> dla non-fleet sekcji.
    this._selectedFleetId = null;
    this._hoverFleetId  = null;
    this._collapsedFleets = new Set();
    this._collapsedSections = new Set();
    // Multi-select w drzewie — Set<vesselId>; przypisywanie do floty.
    this._multiSelectedIds = new Set();
    // P2 polish — Fleet Engage pick mode: po kliku „Atak" w panelu floty,
    // gracz wybiera enemy klikem LPM w tactical map.
    this._fleetEngagePickMode = null;  // null | { fleetId }
    this._hoverShipId = null;       // hover na przycisku budowy statku → tooltip kosztów
    this._missionConfig = null;   // null | { actionId, targetId, step:'select'|'confirm' }
    this._targetScrollOffset = 0; // scroll listy celów
    this._mapToggles = { routes: true, range: false };
    // Zakładki „Dowództwa Taktycznego": 'tactical' | 'atlas' | 'shipyard' | 'stratcom'.
    // Zastąpiły boole _showAtlas/_showCluster — atlas i star-cluster (→ Stratcom) to
    // teraz osobne pełnoekranowe zakładki obok mapy taktycznej i stoczni.
    this._activeTab = 'tactical';
    this._stratcomBig = 'radar';  // który panel Stratcomu duży (70%): 'radar' | 'galaxy'
    this._contentBounds = null;   // { x,y,w,h } — obszar treści pod paskiem zakładek
    this._shipyardScrollY = 0;    // wspólny pionowy scroll zakładki Stocznia (budowa + edytor projektów)
    this._shipyardContentH = 0;   // łączna wysokość treści Stoczni (do clampu scrolla)
    this._shipyardViewH = 0;      // widoczna wysokość zakładki Stocznia
    this._atlasScrollY = 0;       // scroll katalogu ciał
    this._atlasContentH = 0;      // wysokość zawartości katalogu
    this._atlasVisibleH = 0;      // widoczna wysokość katalogu
    // Prawy panel taktyki (szczegóły statku) — pionowy scroll (treść bywa wyższa niż panel)
    this._rightScrollY = 0;
    this._rightContentH = 0;      // łączna wysokość treści panelu (do clampu)
    this._rightViewH = 0;         // widoczna wysokość panelu
    this._rightScrollVesselId = null;  // reset scrolla przy zmianie statku

    // Star Cluster — zoom, pan, selekcja
    this._clusterZoom = 1;
    this._clusterPanX = 0;
    this._clusterPanY = 0;
    this._selectedClusterSystem = null;
    this._clusterHoverSystem = null;

    // Warp multi-hop — lewa tabela statków warp na radarze + rozkaz „skok do układu".
    this._selectedWarpShipId = null;  // wybrany statek warp (marker + cel rozkazu)
    this._warpShipScrollY = 0;        // scroll listy statków warp

    // Stratcom — galaktyka 3D (WebGL offscreen, lazy). Kamera orbitalna własna,
    // niezależna od _clusterZoom/Pan (te zostają dla płaskiego radaru i podglądu).
    this._galaxy3D = null;          // StratcomGalaxyRenderer (dynamic import — three)
    this._galaxy3DLoading = false;
    this._galaxy3DFailed = false;
    this._galaxyYaw = 0.6;
    this._galaxyPitch = 0.92;       // lekko z góry (przechylony „tank")
    this._galaxyDist = null;        // lazy = renderer.fitDist
    this._galaxyDrag = false;
    this._galaxyPanelRect = null;   // rect dużego panelu galaktyki (hit-test myszy 3D)
    this._galaxyLastDragMs = 0;

    this._hitZones = [];          // { x,y,w,h, type, data }
    this._bounds = null;          // { x,y,w,h } — cały overlay

    this._cachedTargets = null;   // cache celów misji
    this._cachedTargetsKey = '';   // klucz walidacji cache
    this._pendingSendSystemId = null; // ID systemu do wysyłki — pokazuje ship picker w prawym panelu

    // Mapa — zoom i pan
    this._mapZoom = 1.0;          // 1.0 = fit all, >1 = zoom in
    this._mapPanX = 0;            // pan offset w px
    this._mapPanY = 0;
    this._mapBounds = null;       // { x,y,w,h } — bounds obszaru mapy (do scroll detect)
    this._mapFocusBodyId = null;  // null = gwiazda, inaczej body.id — zoom utrzymuje focus
    // Race fix: _focusOnHomeAtStart() wymaga _mapBounds, które dostępne dopiero
    // w _drawCenterMap. Flaga deferuje init focusu do pierwszego draw'a po
    // otwarciu overlay'a.
    this._pendingFocusInit = false;

    // Tooltip ciała na mapie
    this._mapHoverBody = null;    // { body, screenX, screenY } — hover info

    // Drag do przesuwania mapy / cluster
    this._mapDragging = false;
    this._mapDragStartX = 0;
    this._mapDragStartY = 0;
    this._mapDragWasDrag = false; // odróżnienie klik od drag
    this._clusterDrag = false;   // czy drag dotyczy cluster (nie tactical map)

    // M3 P1.3.5 — view state cached przy każdym render tactical map.
    // { mapCx, mapCy, auToPx, AU_TO_PX } — używane przez tacticalToWorld
    // (inverse coord transform dla orderów wydawanych z tactical map).
    // null gdy tactical map jeszcze nie renderowana (defensywny guard
    // w handleRightClick przed first draw).
    this._mapViewState = null;

    // Reset stanu mapy przy interstellar jump — pan/zoom/focus z poprzedniego
    // systemu nie ma sensu w nowym (inne maxOrbitAU, inne ciała).
    EventBus.on('system:switched', () => {
      this._mapZoom = 1.0;
      this._mapPanX = 0;
      this._mapPanY = 0;
      this._mapFocusBodyId = null;
      this._mapHoverBody = null;
      this._pendingFocusInit = true;
    });
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  toggle() {
    this._visible = !this._visible;
    // Defer focus init do pierwszego draw'a — _focusOnHomeAtStart wymaga
    // _mapBounds, które dostępne dopiero w _drawCenterMap.
    if (this._visible) this._pendingFocusInit = true;
    else this._close();
  }
  open(opts = {}) {
    this._visible = true;
    this._pendingFocusInit = true;
    // Wybór zakładki przez wywołującego (klawisze G/M → 'stratcom', nav itp.).
    if (opts.tab) this._activeTab = opts.tab;
    // M4 P2 — klawisz K otwiera fleet z focusSection: 'wreck'. Przy najbliższym
    // draw wymuszamy scroll listy do tej sekcji + auto-select pierwszy wrak.
    // Sekcja Wraki żyje w lewym pasie (tylko zakładka taktyczna) → wymuś ją.
    this._pendingFocusSection = opts.focusSection ?? null;
    if (this._pendingFocusSection) this._activeTab = 'tactical';
  }
  close()  { this._visible = false; this._close(); }

  // Przy otwarciu overlay'a — jeśli mapa w stanie domyślnym (pan=0, zoom=1),
  // ustaw domyślne ujęcie: gwiazda w centrum (pan=0) z zoomem fit-all, przy
  // którym ZAWSZE widać orbitę najdalszego ciała. Skala mapy normalizuje się do
  // maxOrbitAU (najdalsza orbita × 1.15 zapasu), więc zoom=1.0 = orbita
  // najdalszego ciała tuż przy krawędzi kadru, niezależnie od rozpiętości
  // układu. Stan jest ustawiany tylko raz (guard) — kolejne otwarcia zachowują
  // pan/zoom dostosowany przez gracza.
  _focusOnHomeAtStart() {
    if (this._mapPanX !== 0 || this._mapPanY !== 0 || this._mapZoom !== 1.0) return;
    this._mapFocusBodyId = null;  // null = gwiazda (środek układu)
    this._mapZoom = 1.0;          // fit-all → najdalsza orbita zawsze widoczna
    // pan zostaje 0 → mapCx/mapCy bez offsetu → gwiazda w środku obszaru mapy
  }
  get isVisible() { return this._visible; }

  _close() {
    this._missionConfig = null;
    this._targetScrollOffset = 0;
    this._cachedTargets = null;
    // Stan mapy taktycznej (_mapZoom/Pan/FocusBodyId) NIE jest resetowany —
    // gracz oczekuje że ujęcie zachowa się między otwarciami. Reset wymuszany
    // tylko przy `system:switched` (interstellar jump) — patrz konstruktor.
    this._mapDragging = false;
    this._mapDragWasDrag = false;
    this._activeTab = 'tactical';
    this._clusterZoom = 1;
    this._clusterPanX = 0;
    this._clusterPanY = 0;
    this._selectedClusterSystem = null;
    this._clusterHoverSystem = null;
    this._pendingSendSystemId = null;
    this._activeTab = 'tactical';
    // Zwolnij kontekst WebGL galaktyki 3D (odtworzy się leniwie przy ponownym wejściu)
    if (this._galaxy3D) { this._galaxy3D.dispose(); this._galaxy3D = null; }
    this._galaxyDist = null;
    this._galaxyDrag = false;
    this._galaxyPanelRect = null;
  }

  // Przełączenie zakładki + reset stanu, który nie powinien wyciekać między
  // zakładkami (hover, tryb wyboru celu misji, scroll/selekcja per-widok).
  _switchTab(tab) {
    if (!tab || tab === this._activeTab) return;
    this._activeTab = tab;
    // Wyczyść hovery wszystkich widoków
    this._mapHoverBody = null;
    this._clusterHoverSystem = null;
    this._hoverShipId = null;
    this._hoverVesselId = null;
    this._rightScrollY = 0;   // reset scrolla prawego panelu przy zmianie zakładki
    // Tryb wyboru celu misji nie może przetrwać zmiany zakładki
    if (this._missionConfig?.step === 'select') {
      this._missionConfig = null;
      this._targetScrollOffset = 0;
      this._cachedTargets = null;
    }
    if (tab === 'atlas') this._atlasScrollY = 0;
    if (tab === 'stratcom') {
      this._selectedClusterSystem = null;
      this._pendingSendSystemId = null;
      this._selectedWarpShipId = null;
      this._warpShipScrollY = 0;
      this._stratcomBig = 'radar';   // wejście w Stratcom → duży radar (domyślny przegląd)
    }
  }

  // Centruj mapę na ciele (AU → px pan offset)
  // Oblicz maxOrbitAU (do skali mapy)
  _getMaxOrbitAU() {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    let maxAU = 1;
    for (const p of (EntityManager.getByTypeInSystem('planet', sysId))) {
      const a = p.orbital?.a ?? 0; if (a > maxAU) maxAU = a;
    }
    for (const pd of (EntityManager.getByTypeInSystem('planetoid', sysId))) {
      const a = pd.orbital?.a ?? 0; if (a > maxAU) maxAU = a;
    }
    return maxAU * 1.15;
  }

  // Pozycja ciała w AU (body.x/y to px, trzeba przeliczyć)
  _bodyAU(body) {
    const bx = (body?.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const by = (body?.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return { x: bx, y: by };
  }

  _centerMapOnBody(body) {
    const mb = this._mapBounds;
    if (!mb) return;
    const maxAU = this._getMaxOrbitAU();
    const baseR = Math.min(mb.w / 2, mb.h / 2) - 20;
    const auPx = baseR * this._mapZoom / maxAU;
    const { x: bx, y: by } = this._bodyAU(body);
    this._mapPanX = -bx * auPx;
    this._mapPanY = -by * auPx;
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
    // Dolna granica overlayu = górna krawędź paska czasu (BottomControlBar), rysowanego NA WIERZCHU
    // (UIManager PO overlayManager). Pasek RIDE'uje w górę, gdy ostatnia karta nawigacji (Science)
    // jest w podglądzie (peek) → wtedy STAŁY BOTTOM_PAD nie wystarcza i pasek wjeżdża na dolną treść
    // prawego panelu (akcje statku / „Powtarzaj automatycznie"), której nie da się doscrollować.
    // Czytamy realny top paska CO KLATKĘ (peek-aware, ten sam _stripTop którego pasek użyje przy
    // rysowaniu); fallback = baza (nav + dziennik + STRIP_H) gdy pasek niedostępny.
    const _stripTop = window.KOSMOS?.bottomControlBar?._stripTop?.(H);
    const _bottomLimit = (_stripTop != null && _stripTop > oy + 40) ? _stripTop : (H - BOTTOM_PAD);
    const oh = _bottomLimit - oy;
    this._bounds = { x: ox, y: oy, w: ow, h: oh };

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

    // Obszar treści pod paskiem zakładek
    const contentY = oy + TAB_H;
    const contentH = oh - TAB_H;
    this._contentBounds = { x: ox, y: contentY, w: ow, h: contentH };

    // ── Pobierz dane ────────────────────────────────────────
    const vMgr = window.KOSMOS?.vesselManager;
    const ms   = window.KOSMOS?.missionSystem ?? window.KOSMOS?.expeditionSystem;
    const colMgr = window.KOSMOS?.colonyManager;
    const allVessels = vMgr?.getAllVessels() ?? [];
    const activePid = colMgr?.activePlanetId;

    // ── Zawartość zależna od aktywnej zakładki ──────────────
    if (this._activeTab === 'tactical') {
      const centerW = ow - LEFT_W - RIGHT_W;

      // Separatory kolumn (tylko w układzie 3-kolumnowym taktyki)
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ox + LEFT_W, contentY); ctx.lineTo(ox + LEFT_W, contentY + contentH);
      ctx.moveTo(ox + ow - RIGHT_W, contentY); ctx.lineTo(ox + ow - RIGHT_W, contentY + contentH);
      ctx.stroke();

      // Podział: statki gracza żywe + wrogie widoczne + wraki (osobna sekcja).
      // Wraki gracza wypadają z sekcji "flota gracza" i lądują w sekcji WRAKI.
      const isLiving = (v) => !v.isWreck;
      const playerAll  = allVessels.filter(v => !isEnemyVessel(v) && isLiving(v));
      const playerList = this._filterVessels(playerAll, activePid);
      const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';   // aktualnie oglądany układ (jak mapa)
      const enemyVisible = allVessels.filter(v =>
        isEnemyVessel(v) && isLiving(v) && _isEnemyTracked(v)
        && (v.systemId ?? 'sys_home') === sysId   // tylko wrogowie z oglądanego układu (spójność z mapą)
      );
      const wrecks = allVessels.filter(v => v.isWreck);

      this._drawLeft(ctx, ox, contentY, LEFT_W, contentH, playerList, ms, enemyVisible, wrecks);
      this._drawCenter(ctx, ox + LEFT_W, contentY, centerW, contentH, allVessels, ms);
      this._drawRight(ctx, ox + ow - RIGHT_W, contentY, RIGHT_W, contentH, vMgr, ms, colMgr, activePid);
    } else if (this._activeTab === 'atlas') {
      this._drawAtlasCatalog(ctx, ox, contentY, ow, contentH, allVessels);
    } else if (this._activeTab === 'shipyard') {
      // Stocznia = wąska kolumna wycentrowana: u góry budowa statków, poniżej
      // (po wspólnym scrollu) osadzony edytor projektów (Designs).
      const syW = Math.min(ow, 560);
      const syX = ox + Math.floor((ow - syW) / 2);
      this._drawShipyardTab(ctx, syX, contentY, syW, contentH, colMgr, activePid);
    } else if (this._activeTab === 'stratcom') {
      // Dwupanelowy Stratcom: radar (przegląd polityczny) + mapa galaktyki 2D
      // (operacyjna). Jeden duży (70%), drugi mały (klik rozwija). Pływający picker
      // statku przy planowaniu skoku warp (cluster_send → _pendingSendSystemId).
      this._drawStratcomTab(ctx, ox, contentY, ow, contentH);
      if (this._pendingSendSystemId) {
        const pw = Math.min(220, ow - 16);
        this._drawShipPicker(ctx, ox + ow - pw - 8, contentY + 8, pw, contentH - 16, vMgr, colMgr, activePid);
      }
    }
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
      { id: 'stratcom', label: t('fleet.tabStratcom') },
      { id: 'tactical', label: t('fleet.tabTactical') },
      { id: 'shipyard', label: t('fleet.tabShipyard') },
      { id: 'atlas',    label: t('fleet.tabAtlas') },
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

  handleClick(mx, my) {
    if (!this._visible) return false;
    if (!this._bounds) return false;
    // Blokuj kliknięcia gdy DOM modal jest na wierzchu (MissionEventModal, BodyDetailModal itp.)
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;

    // Jeśli to był drag mapy — nie dispatch kliknięcia
    if (this._mapDragWasDrag) {
      this._mapDragWasDrag = false;
      return true;
    }

    // S3.3b-S3b — podczas wyboru celu misji (step==='select') PRIORYTET ciała/stacji nad statkiem.
    // handleClick kończy po PIERWSZEJ trafionej, a statek zone wygrywa reverse-iter — więc tu, ZANIM
    // wejdziemy w normalną pętlę, sprawdzamy czy pod kliknięciem jest map_body/map_station i wybieramy CEL.
    if (this._missionConfig?.step === 'select') {
      const tgtZone = this._hitZones.find(z =>
        (z.type === 'map_body' || z.type === 'map_station') &&
        mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h);
      if (tgtZone) { this._handleHit(tgtZone, mx, my); return true; }
    }

    // Szukaj hit zone (reverse — top-most first).
    // M3 P1.3.5: map_vessel obsługiwane (selection z tactical mapy);
    // wcześniej skipped — wybór tylko z listy po lewej.
    for (let i = this._hitZones.length - 1; i >= 0; i--) {
      const z = this._hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._handleHit(z, mx, my);
        return true;
      }
    }

    // M3 P1.3.5 — pusty obszar tactical map (nie atlas/cluster):
    //   picker mode patrolWaypoints → addPickerWaypoint w world coords
    //   M3 P2.3 — picker mode targetPoint → finalize via GameScene helper
    //   inaczej → clearSelection (deselect)
    if (this._activeTab === 'tactical' && this._mapBounds) {
      const mb = this._mapBounds;
      if (mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
        const um = window.KOSMOS?.uiManager;
        if (um?.isPickerActive?.()) {
          const ps = um.getPickerState?.();
          const wp = tacticalToWorld(mx, my, this._mapViewState);
          if (wp) {
            if (ps?.mode === 'patrolWaypoints') {
              um.addPickerWaypoint?.({ x: wp.x, y: wp.y });
            } else if (ps?.mode === 'targetPoint') {
              // M3 P2.3 — single-click finalize. tactical wp już w gameplay px.
              EventBus.emit('ui:targetPointPickerFinalize', { point: { x: wp.x, y: wp.y } });
            }
          }
        } else {
          um?.clearSelection?.();
        }
        return true;
      }
    }
    return true; // pochłoń klik w overlayu
  }

  // M3 P1.5 — hover info dla universal Tooltip system. Read-only sibling
  // do handleRightClick (NIE emituje eventu). Zwraca:
  //   { kind: 'entity', target } — dla vessel/planet/poi sprite na tactical
  //   { kind: 'uiHint', textKey } — dla hit zone z UI hint (np. cancel button)
  //   null                          — empty / poza overlayem / przed renderem
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

    // Atlas / Cluster — własny hit-test (bez tactical worldPoint).
    // Wiersze ciał w katalogu mają hit-zony 'map_body' (L2484-2487). Dla
    // hovera nad wierszem zwracamy entity → GameScene pokaże Universal
    // Tooltip z TooltipContent._planetContent. Pusty hit zwraca 'none'
    // (NIE null) żeby GameScene NIE wpadł w coord-tooltip fallback —
    // _mapBounds w tle pokrywa region Atlas, ale Atlas to nie mapa świata.
    if (this._activeTab === 'atlas' || this._activeTab === 'stratcom') {
      if (hit?.type === 'map_body') {
        const lookups = { getEntity: (id) => EntityManager.get(id) };
        const target = resolveTacticalTarget(hit, null, lookups);
        if (target && target.type !== 'empty') return { kind: 'entity', target };
      }
      return { kind: 'none' };
    }

    // Tactical map entity hover — w obrębie _mapBounds
    if (!this._mapBounds) return null;
    const mb = this._mapBounds;
    if (mx < mb.x || mx > mb.x + mb.w || my < mb.y || my > mb.y + mb.h) return null;
    if (!this._mapViewState) return null;

    const worldPoint = tacticalToWorld(mx, my, this._mapViewState);
    const lookups = {
      getVessel: (id) => window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null,
      getEntity: (id) => EntityManager.get(id),
      getPOI:    (id) => window.KOSMOS?.poiRegistry?.getPOI?.(id) ?? null,
    };
    const target = resolveTacticalTarget(hit, worldPoint, lookups);
    if (!target || target.type === 'empty') return null;
    return { kind: 'entity', target };
  }

  // M3 P1.3.5 — handleRightClick (PPM) — emit ui:rightClickMenuOpened
  // z target shape kompatybilnym z RightClickMenu (P1.1).
  // Tylko w trybie tactical map (nie atlas/cluster) i tylko w `_mapBounds`.
  // Mapa 3D układu PPM jest zablokowana przez overlayManager.isAnyOpen()
  // w GameScene._handleTacticalRightClick (commit f2b7e75) — ten path
  // przejmuje PPM gdy FleetOverlay otwarty.
  handleRightClick(mx, my) {
    if (!this._visible) return false;
    if (!this._mapBounds) return false;
    if (this._activeTab !== 'tactical') return false;
    if (document.querySelector('.mission-modal-overlay, .kosmos-modal-overlay')) return false;
    const mb = this._mapBounds;
    if (mx < mb.x || mx > mb.x + mb.w || my < mb.y || my > mb.y + mb.h) return false;
    // Defensywnie: handleRightClick przed first render → _mapViewState=null
    // → tacticalToWorld zwróci null → resolveTacticalTarget z worldPoint=null
    // (target type 'empty' bez wp). Lepiej bail niż emit zły event.
    if (!this._mapViewState) return false;

    const hit = findHitZone(mx, my, this._hitZones);
    const worldPoint = tacticalToWorld(mx, my, this._mapViewState);
    const lookups = {
      getVessel: (id) => window.KOSMOS?.vesselManager?.getVessel?.(id) ?? null,
      getEntity: (id) => EntityManager.get(id),
      getPOI:    (id) => window.KOSMOS?.poiRegistry?.getPOI?.(id) ?? null,
    };
    const target = resolveTacticalTarget(hit, worldPoint, lookups);

    EventBus.emit('ui:rightClickMenuOpened', {
      target,
      screenPoint: { x: mx, y: my },
    });
    return true;
  }

  handleScroll(delta, mx, my) {
    if (!this._visible || !this._bounds) return false;
    const b = this._bounds;
    if (mx < b.x || mx > b.x + b.w || my < b.y || my > b.y + b.h) return false;
    const inRect = (r) => r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    // ── ATLAS (pełna szerokość) — scroll katalogu ────────────
    if (this._activeTab === 'atlas') {
      if (inRect(this._contentBounds)) {
        const maxScroll = Math.max(0, this._atlasContentH - this._atlasVisibleH);
        this._atlasScrollY = Math.max(0, Math.min(maxScroll, this._atlasScrollY + delta * 0.5));
      }
      return true;
    }

    // ── STRATCOM — zoom radaru 2D LUB dystans kamery galaktyki 3D ─
    if (this._activeTab === 'stratcom') {
      if (inRect(this._contentBounds)) {
        const gr = this._galaxyPanelRect;
        const overGalaxy3D = gr && this._stratcomBig === 'galaxy' && this._galaxyDist != null &&
          mx >= gr.x && mx <= gr.x + gr.w && my >= gr.y && my <= gr.y + gr.h;
        if (overGalaxy3D) {
          this._galaxyDist = Math.max(4, Math.min(600, this._galaxyDist * (delta > 0 ? 1.12 : 0.89)));
        } else {
          const zf = delta > 0 ? 0.85 : 1.18;
          this._clusterZoom = Math.max(0.3, Math.min(8, this._clusterZoom * zf));
        }
      }
      return true;
    }

    // ── SHIPYARD — wspólny pionowy scroll (budowa + edytor projektów) ─
    if (this._activeTab === 'shipyard') {
      if (inRect(this._contentBounds)) {
        const maxScroll = Math.max(0, this._shipyardContentH - this._shipyardViewH);
        this._shipyardScrollY = Math.max(0, Math.min(maxScroll, this._shipyardScrollY + delta * 0.5));
      }
      return true;
    }

    // ── TACTICAL — 3 kolumny ─────────────────────────────────
    // Scroll w LEFT (jedna lista drzewa — outliner P2.5).
    if (mx < b.x + LEFT_W) {
      this._scrollOffset = Math.max(0, this._scrollOffset + delta * 0.5);
      return true;
    }
    // Scroll w RIGHT (konfigurator celów)
    if (mx > b.x + b.w - RIGHT_W && this._missionConfig?.step === 'select') {
      this._targetScrollOffset = Math.max(0, this._targetScrollOffset + delta * 0.5);
      return true;
    }
    // Scroll w RIGHT (panel szczegółów statku/floty) — gdy NIE konfigurator celów
    if (mx > b.x + b.w - RIGHT_W && (this._selectedVesselId || this._selectedFleetId) && this._missionConfig?.step !== 'select') {
      const maxScroll = Math.max(0, (this._rightContentH || 0) - (this._rightViewH || 0));
      this._rightScrollY = Math.max(0, Math.min(maxScroll, (this._rightScrollY || 0) + delta * 0.5));
      return true;
    }
    // Zoom-at-cursor mapy taktycznej
    const mb = this._mapBounds;
    if (mb && mx >= mb.x && mx <= mb.x + mb.w && my >= mb.y && my <= mb.y + mb.h) {
      // world point pod kursorem (mx, my) ma pozostać pod kursorem po zmianie
      // zoomu. Math zsynchronizowana z _drawCenterMap:
      //   mapCx = mb.x + mb.w/2 + panX  (analogicznie mapCy)
      //   bodyScreen = bodyAU * auToPx + mapCx
      const oldZoom = this._mapZoom;
      const newZoom = Math.max(0.3, Math.min(300, oldZoom * (delta > 0 ? 0.85 : 1.18)));
      if (newZoom === oldZoom) return true;  // clamp hit — pan bez zmian

      const baseR = Math.min(mb.w / 2, mb.h / 2) - 20;
      const maxAU = this._getMaxOrbitAU();
      const oldAuToPx = baseR * oldZoom / maxAU;
      const newAuToPx = baseR * newZoom / maxAU;

      const oldMapCx = mb.x + mb.w / 2 + this._mapPanX;
      const oldMapCy = mb.y + mb.h / 2 + this._mapPanY;
      const worldAU_x = (mx - oldMapCx) / oldAuToPx;
      const worldAU_y = (my - oldMapCy) / oldAuToPx;

      this._mapZoom = newZoom;
      this._mapPanX = mx - (mb.x + mb.w / 2) - worldAU_x * newAuToPx;
      this._mapPanY = my - (mb.y + mb.h / 2) - worldAU_y * newAuToPx;
    }
    return true;
  }

  handleMouseDown(mx, my) {
    if (!this._visible) return false;
    const inRect = (r) => r && mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;

    // Tactical — pan mapy taktycznej (w _mapBounds).
    if (this._activeTab === 'tactical' && inRect(this._mapBounds)) {
      this._clusterDrag = false;
      this._mapDragging = true;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      this._mapDragWasDrag = false;
      return true;
    }
    // Stratcom — duża galaktyka 3D: drag = obrót kamery (zamiast pan 2D).
    const gr = this._galaxyPanelRect;
    if (this._activeTab === 'stratcom' && this._stratcomBig === 'galaxy' && gr &&
        mx >= gr.x && mx <= gr.x + gr.w && my >= gr.y && my <= gr.y + gr.h) {
      this._galaxyDrag = true;
      this._clusterDrag = false;
      this._mapDragging = true;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      this._mapDragWasDrag = false;
      return true;
    }
    // Stratcom — pan star-cluster/radaru 2D (pełna szerokość → _contentBounds).
    if (this._activeTab === 'stratcom' && inRect(this._contentBounds)) {
      this._clusterDrag = true;
      this._galaxyDrag = false;
      this._mapDragging = true;
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      this._mapDragWasDrag = false;
      return true;
    }
    return false;
  }

  handleMouseUp(mx, my) {
    if (this._mapDragging) {
      this._mapDragging = false;
      this._galaxyDrag = false;
      // Jeśli to był drag (nie klik) — pochłoń event
      if (this._mapDragWasDrag) return true;
    }
    return false;
  }

  handleMouseMove(mx, my) {
    if (!this._visible) return;

    // Drag mapy / cluster
    if (this._mapDragging) {
      const dx = mx - this._mapDragStartX;
      const dy = my - this._mapDragStartY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._mapDragWasDrag = true;
      if (this._galaxyDrag) {
        // Obrót kamery galaktyki 3D (orbit sferyczny)
        this._galaxyYaw   -= dx * 0.006;
        this._galaxyPitch += dy * 0.006;
        this._galaxyPitch = Math.max(0.12, Math.min(Math.PI - 0.12, this._galaxyPitch));
        this._galaxyLastDragMs = (typeof performance !== 'undefined') ? performance.now() : 0;
      } else if (this._clusterDrag) {
        this._clusterPanX += dx;
        this._clusterPanY += dy;
      } else {
        this._mapPanX += dx;
        this._mapPanY += dy;
      }
      this._mapDragStartX = mx;
      this._mapDragStartY = my;
      return;
    }

    // Hover na statku w LEFT
    this._hoverVesselId = null;
    this._hoverShipId = null;
    this._hoverPendingOrder = null;
    for (const z of this._hitZones) {
      if (mx < z.x || mx > z.x + z.w || my < z.y || my > z.y + z.h) continue;
      if (z.type === 'vessel') { this._hoverVesselId = z.data.vesselId; break; }
      if (z.type === 'build_ship') { this._hoverShipId = z.data.shipId; break; }
      if (z.type === 'pending_ship_hover') { this._hoverPendingOrder = z.data.order; break; }
    }
    // Hover na ciele na mapie
    this._mapHoverBody = null;
    this._clusterHoverSystem = null;
    for (const z of this._hitZones) {
      if (z.type === 'map_body' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._mapHoverBody = { bodyId: z.data.bodyId, screenX: z.x + z.w / 2, screenY: z.y + z.h };
        break;
      }
      if (z.type === 'cluster_star' && mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) {
        this._clusterHoverSystem = z.data.systemId;
        break;
      }
    }
    // Hover osadzonego edytora projektów (zakładka Stocznia) — podświetlenia
    // wierszy modułów/szablonów czytają editor._hoverZone.
    if (this._activeTab === 'shipyard') {
      const ed = this._getDesignEditor();
      if (ed) ed._hoverZone = findHitZone(mx, my, this._hitZones) ?? null;
    }
  }

  // ── Hit dispatch ──────────────────────────────────────────────────────────

  _handleHit(zone, mx = null, my = null) {
    // Edytor projektów osadzony w zakładce Stocznia — jego hity (select_hull,
    // select_slot, pick_module, save_template, edit/delete_template itd.) trafiają
    // do wspólnej tablicy _hitZones i są tu delegowane do instancji edytora.
    if (DESIGN_EDITOR_HIT_TYPES.has(zone.type)) {
      this._getDesignEditor()?._onHit(zone);
      return;
    }

    switch (zone.type) {
      case 'close':
        this.close();
        break;
      // ── Player Fleet Groups (P2.5 outliner) ────────────────────────────
      case 'fleetSectionToggle': {
        // Toggle collapse fleet section
        const fid = zone.data.fleetId;
        if (this._collapsedFleets.has(fid)) this._collapsedFleets.delete(fid);
        else this._collapsedFleets.add(fid);
        break;
      }
      case 'sectionToggle': {
        // Toggle collapse non-fleet section (ungrouped/enemy/wreck)
        const key = zone.data.sectionKey;
        if (this._collapsedSections.has(key)) this._collapsedSections.delete(key);
        else this._collapsedSections.add(key);
        break;
      }
      case 'fleetSectionSelect': {
        // Klik wiersza floty → select fleet (mutex: clear vessel selection).
        const um = window.KOSMOS?.uiManager;
        const next = (this._selectedFleetId === zone.data.fleetId) ? null : zone.data.fleetId;
        if (um?.setSelectedFleetId) um.setSelectedFleetId(next);
        else this._selectedFleetId = next;
        // Mutex — clear vessel selection (fleet wygrywa context).
        if (next && um?.setSelectedVesselId) um.setSelectedVesselId(null);
        break;
      }
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
      case 'build_ship':
        if (zone.data.enabled) {
          const shipDef = SHIPS[zone.data.shipId] ?? HULLS[zone.data.shipId];
          const modules = zone.data.modules ?? shipDef?.defaultModules ?? [];
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.shipId, modules });
        }
        break;
      case 'build_template':
        if (zone.data.enabled) {
          EventBus.emit('fleet:buildRequest', { shipId: zone.data.hullId, modules: zone.data.modules });
        }
        break;
      case 'cancel_pending_ship': {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr) colMgr.cancelPendingShip(zone.data.planetId, zone.data.orderId);
        break;
      }
      case 'surge_ship': {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr) colMgr.surgeShipBuild(zone.data.planetId, zone.data.queueIndex);
        break;
      }
      case 'filter':
        this._filter = zone.data.filterId;
        this._scrollOffset = 0;
        break;
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
          EventBus.emit('vessel:focus', { vesselId: zone.data.vesselId });
        }
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        break;
      }
      case 'back_to_shipyard':
        // Stocznia ma teraz własną zakładkę — odznacz statek i przełącz na nią.
        this._setSelectedVesselViaUI(null);
        this._missionConfig = null;
        this._targetScrollOffset = 0;
        this._cachedTargets = null;
        this._activeTab = 'shipyard';
        break;
      case 'map_station': {
        // S3.4-F2 — klik stacji na mapie taktycznej: wybór celu (gdy konfigurator) lub selekcja
        // stacji (dual-emit station:selected/focus, wzór ThreeRenderer.handleClick — bez body:selected).
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.stationId;
          this._missionConfig.step = 'confirm';
          this._mapHoverBody = null;
          break;
        }
        EventBus.emit('station:selected', { stationId: zone.data.stationId });
        EventBus.emit('station:focus', { stationId: zone.data.stationId });
        break;
      }
      case 'map_body': {
        // Gdy konfigurator aktywny i czeka na cel → wybierz cel z mapy
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.bodyId;
          this._missionConfig.step = 'confirm';
          this._mapHoverBody = null;
          break;
        }
        // Ustaw focus na klikniętym ciele (zoom + centruj mapę)
        this._mapFocusBodyId = zone.data.bodyId;
        const bodyEntity = _findBody(zone.data.bodyId);
        if (bodyEntity) {
          EventBus.emit('body:selected', { entity: bodyEntity });
          this._centerMapOnBody(bodyEntity);
          // Auto-zoom — planeta/księżyc klik → wskocz do zoomu który pokazuje
          // ciało + jego księżyce/satelity. Dla planety ~zoom 40 (widok ~2 AU).
          // Dla księżyca/planetoida ~zoom 120 (widok ~0.2 AU).
          if (bodyEntity.type === 'planet') {
            this._mapZoom = Math.max(this._mapZoom, 40);
          } else if (bodyEntity.type === 'moon' || bodyEntity.type === 'planetoid') {
            this._mapZoom = Math.max(this._mapZoom, 120);
          }
        }
        break;
      }
      case 'map_station': {
        // S3.3b-S3b — wybór STACJI jako cel misji (transport→HUB). Podczas wyboru celu → targetId+confirm.
        if (this._missionConfig?.step === 'select') {
          this._missionConfig.targetId = zone.data.stationId;
          this._missionConfig.step = 'confirm';
          this._mapHoverBody = null;
          break;
        }
        // Poza trybem wyboru — focus na ciele macierzystym stacji.
        this._mapFocusBodyId = zone.data.bodyId;
        const stBody = _findBody(zone.data.bodyId);
        if (stBody) { EventBus.emit('body:selected', { entity: stBody }); this._centerMapOnBody(stBody); }
        break;
      }
      case 'atlas_report': {
        // Ikona raportu 📋 w Star Atlas — otwórz modal ze szczegółami
        const reportBody = _findBody(zone.data.bodyId);
        if (reportBody) {
          showBodyDetailModal(reportBody);
        }
        break;
      }
      case 'map_vessel': {
        // S3.3b-S3b — klik w statek W PUSTCE podczas wyboru celu (brak ciała/stacji pod spodem — Fix A
        // już obsłużył nakładanie) → ignoruj, NIE selekcjonuj (nie podmieniaj wybranego statku w trakcie misji).
        if (this._missionConfig?.step === 'select') break;
        // P2 polish — Fleet Engage pick mode (tactical map LPM na enemy).
        // Bug fix (jak case 'vessel'): klik na własny → cancel pick mode + select.
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
          // Klik na własny → cancel pick mode, fall-through do select.
          this._fleetEngagePickMode = null;
          EventBus.emit('ui:toast', { text: t('fleet.engageCancelled'), color: '#808080', durationMs: 1500 });
        }
        this._setSelectedVesselViaUI(zone.data.vesselId);
        // P2.5 mutex — klik vessela na tactical map też czyści fleet selection.
        const umMV = window.KOSMOS?.uiManager;
        if (umMV?.setSelectedFleetId) umMV.setSelectedFleetId(null);
        this._missionConfig = null;
        break;
      }
      case 'home_focus': {
        // Powrót do widoku "nasza planeta + księżyce" — reset pan + zoom 40 + center
        const home = window.KOSMOS?.homePlanet;
        if (home) {
          this._mapFocusBodyId = home.id;
          this._mapPanX = 0;
          this._mapPanY = 0;
          this._mapZoom = 40;
          this._centerMapOnBody(home);
        }
        break;
      }
      case 'map_toggle':
        this._mapToggles[zone.data.key] = !this._mapToggles[zone.data.key];
        break;
      case 'tab':
        this._switchTab(zone.data.tab);
        break;
      case 'stratcom_expand':
        // Klik małego panelu Stratcomu → rozwiń go do 70% (drugi maleje).
        this._stratcomBig = zone.data.panel;
        this._pendingSendSystemId = null;
        break;
      case 'stratcom_scan': {
        // Rozpocznij czasowy skan obcego układu (obserwatorium Lv2+). Ujawnia liczby ciał.
        const obsSys = window.KOSMOS?.observatorySystem;
        const ok = obsSys?.startSystemScan?.(zone.data.systemId);
        if (!ok) {
          const maxTier = obsSys?.getMaxSystemScanTier?.() ?? 0;
          const atLimit = obsSys && obsSys.getActiveSystemScans().length >= obsSys.getMaxConcurrentSystemScans();
          const txt = maxTier <= 0 ? t('fleet.scanLockedToast')
                    : atLimit      ? t('fleet.scanLimitToast')
                    :                t('fleet.scanBusyToast');
          EventBus.emit('ui:toast', { text: txt, color: THEME.warning ?? '#ffcc44', durationMs: 3000 });
        }
        break;
      }
      case 'stratcom_scan_cancel':
        window.KOSMOS?.observatorySystem?.cancelSystemScan?.(zone.data.systemId, 'manual');
        break;
      case 'cluster_star':
        this._selectedClusterSystem = zone.data.systemId;
        break;
      case 'cluster_switch': {
        const ssMgr = window.KOSMOS?.starSystemManager;
        if (ssMgr && zone.data.systemId) {
          ssMgr.switchActiveSystem(zone.data.systemId);
          // Reset tactical map po przełączeniu układu
          this._mapZoom = 1.0;
          this._mapPanX = 0;
          this._mapPanY = 0;
          this._mapFocusBodyId = null;
          this._mapHoverBody = null;
          // Przełącz na zakładkę taktyki żeby gracz widział nowy układ
          this._activeTab = 'tactical';
        }
        break;
      }
      case 'cluster_send': {
        // Wysyłka statku międzygwiezdnego — jeśli wybrany statek jest warp-capable, wyślij go
        const vMgr2 = window.KOSMOS?.vesselManager;
        if (!vMgr2 || !zone.data.systemId) break;

        if (this._selectedVesselId) {
          const selV = vMgr2.getVessel(this._selectedVesselId);
          // S3.0b S1b: gate na realnym baku warp (warpFuel.max>0), nie na martwym selDef.fuelPerLY
          // (po reformie modułów fuelPerLY nie istnieje na statycznych SHIPS/HULLS → zawsze blokowało).
          // Nieudany dispatch (np. za mało paliwa warp) → fall-through do pickera, nie cichy niewypał.
          if (selV && selV.warpFuel?.max > 0 &&
              selV.position.state === 'docked' &&
              (selV.status === 'idle' || selV.status === 'refueling')) {
            // Multi-hop: planer trasy (limit skoku) zamiast bezpośredniego dispatchu.
            const wrs = window.KOSMOS?.warpRouteSystem;
            const ok = wrs ? wrs.beginJourney(selV.id, zone.data.systemId).ok
                           : vMgr2.dispatchInterstellar(selV.id, zone.data.systemId);
            if (ok) break;
          }
        }
        // Brak wybranego statku lub nie spełnia wymagań → pokaż ship picker
        this._pendingSendSystemId = zone.data.systemId;
        break;
      }
      case 'cluster_send_pick': {
        // Wybór konkretnego statku z pickera — przez planer trasy (multi-hop + limit skoku).
        const vMgr2b = window.KOSMOS?.vesselManager;
        if (vMgr2b && zone.data.vesselId && zone.data.systemId) {
          const wrs = window.KOSMOS?.warpRouteSystem;
          if (wrs) wrs.beginJourney(zone.data.vesselId, zone.data.systemId);
          else vMgr2b.dispatchInterstellar(zone.data.vesselId, zone.data.systemId);
          this._pendingSendSystemId = null;
        }
        break;
      }
      case 'cluster_send_cancel': {
        this._pendingSendSystemId = null;
        break;
      }
      case 'warp_ship_select':
        // Toggle wyboru statku warp (lewa tabela radaru) → marker + cel rozkazu.
        this._selectedWarpShipId = (this._selectedWarpShipId === zone.data.vesselId) ? null : zone.data.vesselId;
        break;
      case 'warp_order_send': {
        const wrs = window.KOSMOS?.warpRouteSystem;
        if (wrs && zone.data.vesselId && zone.data.systemId) {
          const res = wrs.beginJourney(zone.data.vesselId, zone.data.systemId);
          if (res?.ok) {
            this._selectedClusterSystem = null;  // wyczyść uzbrojony cel; statek zostaje wybrany (marker)
            EventBus.emit('ui:toast', { text: t('fleet.warpOrderSent'), color: THEME.accent, durationMs: 2500 });
          } else {
            EventBus.emit('ui:toast', { text: t('fleet.warpOrderFailed'), color: THEME.danger ?? '#ff4466', durationMs: 3000 });
          }
        }
        break;
      }
      case 'warp_order_cancel':
        this._selectedClusterSystem = null;
        break;
      case 'warp_order_bg':
        break;   // absorber kliknięć tła panelu rozkazu (nie przepuszcza do gwiazd pod spodem)
      case 'cluster_beacon': {
        EventBus.emit('orbital:buildBeacon', { systemId: zone.data.systemId });
        break;
      }
      case 'cluster_gate': {
        EventBus.emit('orbital:buildJumpGate', { systemId: zone.data.systemId });
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
          // Reset statusu — dispatchInterstellar wymaga idle+docked
          v.status = 'idle';
          v.position.state = 'docked';
          v.mission = null;
          vMgr3.dispatchInterstellar(zone.data.vesselId, zone.data.fromSystemId);
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
          // Przerwij rekon jeśli aktywny
          if (v2.mission?.type === 'foreign_recon') {
            vMgr4.abortForeignRecon(zone.data.vesselId);
          }
          v2.status = 'idle';
          v2.position.state = 'docked';
          v2.mission = null;
          vMgr4.dispatchInterstellar(zone.data.vesselId, zone.data.fromSystemId);
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
        this._mapFocusBodyId = zone.data.planetId;
        const planetEntity = _findBody(zone.data.planetId);
        if (planetEntity) this._centerMapOnBody(planetEntity);
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
        EventBus.emit('fleet:disbandRequest', { vesselId: zone.data.vesselId });
        this._setSelectedVesselViaUI(null);
        this._missionConfig = null;
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

    // Załadunek wojsk — CargoLoadModal w trybie troopsOnly (ukrywa cargo/surowce/orbital).
    if (actionId === 'load_troops') {
      const colony = this._getVesselColony?.(vessel) ?? window.KOSMOS?.colonyManager?.getColony(vessel.colonyId);
      if (colony) {
        try { showCargoLoadModal(vessel, colony, { troopsOnly: true }); } catch { /* anulowano */ }
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
      await showCargoLoadModal(vessel, colony);
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
    try { await showCargoLoadModal(vessel, colony); } catch { /* anulowano */ }
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
    action.execute(vessel, state);
    this._missionConfig = null;
    this._targetScrollOffset = 0;
  }

  async _renameVessel(vesselId) {
    try {
      const { showRenameModal } = await import('../ui/ModalInput.js');
      const newName = await showRenameModal(t('fleetPanel.rename'));
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

  // ── Filtrowanie statków ───────────────────────────────────────────────────

  _filterVessels(allVessels, activePid) {
    if (this._filter === 'all') return allVessels;
    if (this._filter === 'here') {
      return allVessels.filter(v => v.colonyId === activePid);
    }
    return allVessels.filter(v => v.shipId === this._filter);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEFT — lista statków
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h, vessels, ms, enemyVessels = [], wrecks = []) {
    const pad = 8;
    // P2.5 outliner — jedna lista, sekcje per flota + Bez floty + Wrogie + Wraki.
    // tabH usunięty (brak zakładek). _activeTab obsolete.
    const flagOn = !!GAME_CONFIG.FEATURES?.playerFleets;
    const tabH = 0;
    const ROW_HANGAR = 34;  // kompaktowy wiersz: nazwa + paliwo + lokalizacja
    const ROW_ORBIT  = 34;
    const ROW_FLIGHT = 52;  // wyższy: nazwa + paliwo + cel + typ misji + ETA
    const ROW_ENEMY  = 34;  // nazwa + typ + odległość — bez paliwa/ETA (nie znamy)
    const ROW_WRECK  = 30;  // nazwa + "wrak" + rok zniszczenia
    const WARP_ROW_EXTRA = 8;  // S3.0b S1b: +wysokość wiersza na drugi pasek (warp) — patrz _rowHForVessel
    const SECTION_H  = 22;  // header sekcji (lekko większy dla buttonów floty)
    const ENEMY_COLOR = '#ff4466';
    const WRECK_COLOR = '#808080';

    // Helper: dobierz wysokość wiersza per vessel state (per-vessel zamiast per-section
    // — w sekcji floty mogą być statki w różnych stanach).
    const _rowHForVessel = (v) => {
      if (v.isWreck) return ROW_WRECK;
      if (isEnemyVessel(v)) return ROW_ENEMY;
      const base = v.position?.state === 'in_transit' ? ROW_FLIGHT : ROW_HANGAR;
      // S3.0b S1b: statki z Komorą Warp (warpFuel.max>0) dostają drugi pasek paliwa →
      // rezerwuj WARP_ROW_EXTRA (JEDNO źródło: scroll-total 1734 + draw-loop spójne).
      return base + (v.warpFuel?.max > 0 ? WARP_ROW_EXTRA : 0);
    };

    // M3 P3.1 — cache vesselId→rallyName mapping (per draw) dla LEFT panel indicator.
    // Avoid N×M lookup w pętli wierszy (jeden skan rally POI raz, lookup O(1)).
    const _rallyByVesselId = new Map();
    const _reg = window.KOSMOS?.poiRegistry;
    if (_reg?.listPOIs) {
      for (const r of _reg.listPOIs({ type: 'rally' }) ?? []) {
        for (const vid of (r.memberVesselIds ?? [])) {
          _rallyByVesselId.set(vid, r.name ?? '?');
        }
      }
    }

    // ── Nagłówek (h=36) ──────────────────────────────────────
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('fleet.header') + ` [${vessels.length}]`, x + pad, y + 22);

    // ── ＋ Nowa flota button (P2.5 — zawsze widoczny gdy flagOn) ──────────
    let preListY = y + 36;
    if (flagOn) {
      const newBtnH = 20;
      ctx.fillStyle = 'rgba(0,255,180,0.10)';
      ctx.fillRect(x + pad, preListY, w - pad * 2, newBtnH);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, preListY, w - pad * 2, newBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.fillText('＋ ' + t('fleet.newFleet'), x + w / 2, preListY + 14);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + pad, y: preListY, w: w - pad * 2, h: newBtnH, type: 'fleetCreate', data: {} });
      preListY += newBtnH + 4;
    }

    // ── Filtry (h=28) ────────────────────────────────────────
    const filterY = preListY;
    let fx = x + pad;
    for (const btn of _getFilterBtns()) {
      const active = this._filter === btn.id;
      const tw = ctx.measureText(btn.label).width + 8;
      const bw = Math.max(tw, 22);
      if (fx + bw > x + w - pad) break;

      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : THEME.bgTertiary;
      ctx.fillRect(fx, filterY, bw, 18);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(fx, filterY, bw, 18);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.fillText(btn.label, fx + 4, filterY + 13);

      this._hitZones.push({ x: fx, y: filterY, w: bw, h: 18, type: 'filter', data: { filterId: btn.id } });
      fx += bw + 2;
    }

    // ── P2.5 outliner — grupowanie player vessels po fleetId ─────────────
    const fSys = window.KOSMOS?.fleetSystem;
    const fleets = (flagOn && fSys?.listFleets) ? fSys.listFleets() : [];
    const byFleet = new Map();         // fleetId → vessel[]
    const ungrouped = [];
    for (const v of vessels) {
      if (flagOn && v.fleetId && fSys?.getFleet?.(v.fleetId)) {
        if (!byFleet.has(v.fleetId)) byFleet.set(v.fleetId, []);
        byFleet.get(v.fleetId).push(v);
      } else {
        ungrouped.push(v);
      }
    }

    // Sekcje — kolejność: per fleet (createdYear asc) → Bez floty → Wrogie → Wraki.
    const sections = [];
    for (const fleet of fleets) {
      sections.push({
        key:         `fleet_${fleet.id}`,
        sectionType: 'fleet',
        fleet,
        label:       fleet.name,
        color:       THEME.accent,
        vessels:     byFleet.get(fleet.id) ?? [],
      });
    }
    if (flagOn) {
      // Bez floty zawsze widoczna gdy flagOn (nawet pusta — info dla gracza)
      sections.push({
        key:         'ungrouped',
        sectionType: 'special',
        label:       t('fleet.sectionUngrouped'),
        color:       THEME.textSecondary,
        vessels:     ungrouped,
      });
    } else {
      // Legacy fallback bez flagi — wszystkie player vessels jako "Bez floty"
      if (ungrouped.length > 0) {
        sections.push({
          key: 'ungrouped', sectionType: 'special',
          label: t('fleet.sectionUngrouped'),
          color: THEME.textSecondary,
          vessels: ungrouped,
        });
      }
    }
    sections.push({
      key: 'enemy', sectionType: 'special',
      label: 'WROGIE JEDNOSTKI', color: ENEMY_COLOR, vessels: enemyVessels,
    });
    sections.push({
      key: 'wreck', sectionType: 'special',
      label: 'WRAKI', color: WRECK_COLOR, vessels: wrecks,
    });

    // Helper: czy sekcja zwinięta
    const _isCollapsed = (sec) => {
      if (sec.sectionType === 'fleet') return this._collapsedFleets.has(sec.fleet.id);
      return this._collapsedSections.has(sec.key);
    };

    // Oblicz łączną wysokość contentu (uwzględnia collapse)
    let totalContentH = 0;
    for (const sec of sections) {
      if (sec.vessels.length === 0 && sec.sectionType !== 'fleet') continue;
      // Fleet sections renderują się nawet puste (gracz musi widzieć flotę bez statków)
      if (sec.sectionType === 'fleet' && sec.vessels.length === 0 && !_isCollapsed(sec)) {
        totalContentH += SECTION_H + 18;  // header + "brak statków" hint row
        continue;
      }
      totalContentH += SECTION_H;
      if (!_isCollapsed(sec)) {
        for (const v of sec.vessels) totalContentH += _rowHForVessel(v);
      }
    }

    // ── Lista scrollowalna ───────────────────────────────────
    // Player Fleet Groups (P1) — pasek multi-select gdy są zaznaczone vessele.
    const multiCount = this._multiSelectedIds.size;
    const showAssignBar = flagOn && multiCount > 0;
    const assignBarH = showAssignBar ? 24 : 0;
    const multiBarY = filterY + 22;
    if (showAssignBar) {
      const barY = multiBarY;
      ctx.fillStyle = 'rgba(0,255,180,0.10)';
      ctx.fillRect(x + pad, barY, w - pad * 2, 22);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, barY, w - pad * 2, 22);
      // "Przypisz (N) ▼" — lewa część (klik otwiera DOM popup)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      const assignLabel = t('fleet.assignSelectedTo') + ` (${multiCount}) ▼`;
      ctx.fillText(assignLabel, x + pad + 6, barY + 15);
      const labelW = ctx.measureText(assignLabel).width + 8;
      this._hitZones.push({ x: x + pad, y: barY, w: labelW, h: 22, type: 'fleetAssignMenuOpen', data: {} });
      // ✕ Wyczyść — prawy róg
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'right';
      ctx.fillText('✕', x + w - pad - 6, barY + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: x + w - pad - 18, y: barY, w: 14, h: 22, type: 'fleetClearMultiSelect', data: {} });
    }
    const listY = filterY + 22 + assignBarH + 4;
    const listH = h - (listY - y);

    // M4 P2 — focusSection: scroll do sekcji + auto-select pierwszy element.
    // open({ focusSection: 'wreck' }) ustawia _pendingFocusSection; tu w pierwszym
    // draw obliczamy offset (suma poprzednich sekcji) i wybieramy pierwszy wrak.
    if (this._pendingFocusSection) {
      const target = this._pendingFocusSection;
      let offset = 0;
      let foundSec = null;
      for (const sec of sections) {
        if (sec.key === target) { foundSec = sec; break; }
        if (sec.vessels.length === 0 && sec.sectionType !== 'fleet') continue;
        offset += SECTION_H;
        if (!_isCollapsed(sec)) {
          for (const v of sec.vessels) offset += _rowHForVessel(v);
        }
      }
      if (foundSec && foundSec.vessels.length > 0) {
        this._scrollOffset = Math.min(offset, Math.max(0, totalContentH - listH));
        const first = foundSec.vessels[0];
        this._setSelectedVesselViaUI(first.id);
        EventBus.emit('vessel:focus', { vesselId: first.id });
      }
      this._pendingFocusSection = null;
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollOffset;

    for (const sec of sections) {
      const isCollapsed = _isCollapsed(sec);
      // Pomiń puste special sections (enemy/wreck/ungrouped legacy bez flagOn).
      // Fleet sections renderują się nawet puste — gracz widzi że ma flotę bez statków.
      if (sec.vessels.length === 0 && sec.sectionType !== 'fleet') continue;
      if (sec.sectionType === 'fleet' && sec.vessels.length === 0
          && !flagOn) continue;  // legacy safety

      // ── Nagłówek sekcji (z toggle + actions per typ) ──
      if (ry + SECTION_H > listY - 2 && ry < listY + listH + 2) {
        const isSelFleet = sec.sectionType === 'fleet'
          && this._selectedFleetId === sec.fleet.id;
        ctx.fillStyle = isSelFleet ? 'rgba(0,255,180,0.10)' : 'rgba(20,30,45,0.8)';
        ctx.fillRect(x, ry, w, SECTION_H);
        if (isSelFleet) {
          ctx.fillStyle = THEME.accent;
          ctx.fillRect(x, ry, 2, SECTION_H);
        }
        ctx.strokeStyle = sec.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
        ctx.beginPath(); ctx.moveTo(x + pad, ry + SECTION_H - 1); ctx.lineTo(x + w - pad, ry + SECTION_H - 1); ctx.stroke();
        ctx.globalAlpha = 1.0;
        // Toggle arrow ▾/▸
        const arrow = isCollapsed ? '▸' : '▾';
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = sec.color;
        ctx.fillText(arrow, x + pad, ry + 15);
        this._hitZones.push({
          x: x + pad - 2, y: ry, w: 14, h: SECTION_H,
          type: sec.sectionType === 'fleet' ? 'fleetSectionToggle' : 'sectionToggle',
          data: sec.sectionType === 'fleet' ? { fleetId: sec.fleet.id } : { sectionKey: sec.key },
        });
        // Label (truncated do dostępnej szerokości)
        ctx.font = `bold ${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = sec.color;
        const rightBtnW = sec.sectionType === 'fleet' ? 22 : 0;  // miejsce na ✕
        const labelMaxW = w - pad * 2 - 14 - 28 - rightBtnW;
        let label = sec.label;
        while (label.length > 4 && ctx.measureText(label).width > labelMaxW) {
          label = label.slice(0, -2) + '…';
        }
        ctx.fillText(label, x + pad + 14, ry + 14);
        // [count] po prawej + (dla floty) doktryna + ✕
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        if (sec.sectionType === 'fleet') {
          // ✕ disband
          ctx.fillStyle = THEME.danger;
          const xBtnX = x + w - pad - 8;
          ctx.fillText('✕', xBtnX, ry + 14);
          this._hitZones.push({
            x: xBtnX - 4, y: ry, w: 16, h: SECTION_H,
            type: 'fleetDisband', data: { fleetId: sec.fleet.id },
          });
          // [count] przed ✕
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(`[${sec.vessels.length}]`, xBtnX - 14, ry + 14);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(`${sec.vessels.length}`, x + w - pad, ry + 14);
          ctx.textAlign = 'left';
        }
        // Klik wiersza floty (poza toggle/disband) → select fleet
        if (sec.sectionType === 'fleet') {
          this._hitZones.push({
            x: x + pad + 14, y: ry, w: w - pad * 2 - 14 - 22, h: SECTION_H,
            type: 'fleetSectionSelect', data: { fleetId: sec.fleet.id },
          });
        }
      }
      ry += SECTION_H;

      // Fleet bez statków + nie zwinięta → hint row
      if (sec.sectionType === 'fleet' && sec.vessels.length === 0 && !isCollapsed) {
        if (ry + 18 > listY && ry < listY + listH) {
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'center';
          ctx.fillText(t('fleet.fleetMembersEmpty'), x + w / 2, ry + 13);
          ctx.textAlign = 'left';
        }
        ry += 18;
        continue;
      }
      // Sekcja zwinięta → pomiń wiersze (header był renderowany wyżej).
      if (isCollapsed) continue;

      // ── Wiersze statków ──
      for (const vessel of sec.vessels) {
        const rH = _rowHForVessel(vessel);
        if (ry + rH < listY) { ry += rH; continue; }
        if (ry > listY + listH) { ry += rH; continue; }

        const selected = vessel.id === this._selectedVesselId;
        const hovered  = vessel.id === this._hoverVesselId;

        if (selected) {
          ctx.fillStyle = sec.key === 'enemy' ? 'rgba(255,68,102,0.12)' : 'rgba(0,255,180,0.06)';
          ctx.fillRect(x, ry, w, rH);
          ctx.fillStyle = sec.key === 'enemy' ? ENEMY_COLOR : THEME.accent;
          ctx.fillRect(x, ry, 2, rH);
        } else if (hovered) {
          ctx.fillStyle = sec.key === 'enemy' ? 'rgba(255,68,102,0.06)' : 'rgba(0,255,180,0.03)';
          ctx.fillRect(x, ry, w, rH);
        }

        // ── Wrak: minimalny wiersz (ikona + nazwa + rok zniszczenia) ──
        if (sec.key === 'wreck') {
          const shipW = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
          const iconW = '💀';
          ctx.font = `13px ${THEME.fontFamily}`;
          ctx.fillStyle = selected ? '#c8c8c8' : WRECK_COLOR;
          const vNameW = (vessel.name ?? '?').length > 12 ? vessel.name.slice(0, 11) + '…' : vessel.name;
          ctx.fillText(`${iconW} ${vNameW}`, x + pad, ry + 14);

          const ownerIsEnemy = isEnemyVessel(vessel);
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(ownerIsEnemy ? 'wrogi' : 'nasz', x + w - pad, ry + 13);
          ctx.textAlign = 'left';

          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          const wyear = vessel.wreckedAt != null ? `rok ${Math.floor(vessel.wreckedAt)}` : '?';
          ctx.fillText(`zniszczony: ${wyear}`, x + pad + 2, ry + 26);

          ctx.strokeStyle = 'rgba(128,128,128,0.18)';
          ctx.beginPath(); ctx.moveTo(x + pad, ry + rH - 1); ctx.lineTo(x + w - pad, ry + rH - 1); ctx.stroke();
          this._hitZones.push({ x, y: Math.max(ry, listY), w, h: rH, type: 'vessel', data: { vesselId: vessel.id } });
          ry += rH;
          // ── M4 P2 — Battle report w expanded selected wrak row ──
          // Zniszczony w bitwie b_XX (rok YYYY) • strona A:N vs B:N
          if (selected && vessel.lastBattleId) {
            const expandH = 36;
            ctx.fillStyle = 'rgba(0,0,0,0.30)';
            ctx.fillRect(x + pad, ry, w - 2 * pad, expandH);
            ctx.strokeStyle = 'rgba(128,128,128,0.14)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + pad + 0.5, ry + 0.5, w - 2 * pad - 1, expandH - 1);
            const ws  = window.KOSMOS?.warSystem;
            const rec = ws?.getBattleRecord?.(vessel.lastBattleId);
            ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
            if (rec) {
              const aCount = rec.participantA?.count ?? rec.participantA?.vesselIds?.length ?? '?';
              const bCount = rec.participantB?.count ?? rec.participantB?.vesselIds?.length ?? '?';
              const yrLabel = rec.year != null ? Math.floor(rec.year) : '?';
              ctx.fillStyle = THEME.textSecondary;
              ctx.fillText(`⚔ ${t('fleet.battleHeader', yrLabel)}`, x + pad + 6, ry + 13);
              ctx.fillStyle = THEME.textDim;
              ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
              ctx.fillText(`A:${aCount} vs B:${bCount} • ${t('fleet.battleResult')}: ${rec.winner ?? '?'}`,
                           x + pad + 6, ry + 27);
            } else {
              ctx.fillStyle = THEME.textDim;
              ctx.fillText(t('fleet.battleNoRecord'), x + pad + 6, ry + 18);
            }
            ry += expandH;
          }
          continue;
        }

        // ── Wrogi statek: uproszczony wiersz (nazwa + typ + odległość) ──
        if (sec.key === 'enemy') {
          const ship2 = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
          const icon2 = ship2?.icon ?? '⚔';
          ctx.font = `13px ${THEME.fontFamily}`;
          ctx.fillStyle = selected ? '#ffd0d8' : ENEMY_COLOR;
          const vName2 = vessel.name.length > 11 ? vessel.name.slice(0, 10) + '…' : vessel.name;
          const inCombatE = _isVesselInCombat(vessel.id);
          const combatBadgeE = inCombatE ? ' ⚔' : '';
          ctx.fillText(`${icon2} ${vName2}${combatBadgeE}`, x + pad, ry + 14);

          // Dystans do najbliższej planety gracza (euclidean AU)
          const home = window.KOSMOS?.homePlanet;
          let distLabel = '—';
          if (home) {
            const d = DistanceUtils.euclideanAU(
              { x: home.x ?? 0, y: home.y ?? 0 },
              { x: vessel.position?.x ?? 0, y: vessel.position?.y ?? 0 }
            );
            distLabel = `${d.toFixed(1)} AU`;
          }
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          ctx.textAlign = 'right';
          ctx.fillText(distLabel, x + w - pad, ry + 13);
          ctx.textAlign = 'left';

          // Wiersz 2: stan (orbituje / w locie / cumuje) + typ kadłuba
          const stateLabel = vessel.position?.state === 'docked'   ? '◈ w hangarze'
                           : vessel.position?.state === 'orbiting' ? '⊙ na orbicie'
                           : '→ w locie';
          const roleLabel = ship2?.namePL ?? ship2?.nameEN ?? ship2?.name ?? vessel.shipId ?? '?';
          ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = ENEMY_COLOR;
          ctx.fillText(`${stateLabel}`, x + pad + 2, ry + 28);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textDim;
          const roleTrim = roleLabel.length > 16 ? roleLabel.slice(0, 15) + '…' : roleLabel;
          ctx.fillText(roleTrim, x + pad + 95, ry + 28);

          // Separator + hitzone
          ctx.strokeStyle = 'rgba(255,68,102,0.12)';
          ctx.beginPath(); ctx.moveTo(x + pad, ry + rH - 1); ctx.lineTo(x + w - pad, ry + rH - 1); ctx.stroke();
          this._hitZones.push({ x, y: Math.max(ry, listY), w, h: rH, type: 'vessel', data: { vesselId: vessel.id } });
          ry += rH;
          continue;  // pomiń wspólny pipeline (paliwo/misja — brak sensu dla wroga)
        }

        const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
        const icon = ship?.icon ?? '🚀';

        // Player Fleet Groups (P1 polish): gdy flagOn i sekcja = własne statki,
        // checkbox zajmuje 14px gutter po lewej — przesuwamy nazwę+ikonę o ten offset.
        const fleetGutter = (flagOn && sec.key !== 'enemy' && sec.key !== 'wreck') ? 14 : 0;

        // ── Wiersz 1: ikona + nazwa + paliwo ──
        ctx.font = `13px ${THEME.fontFamily}`;
        ctx.fillStyle = selected ? THEME.textPrimary : THEME.textSecondary;
        const vName = vessel.name.length > 11 ? vessel.name.slice(0, 10) + '…' : vessel.name;
        const inCombat = _isVesselInCombat(vessel.id);
        const combatBadge = inCombat ? ' ⚔' : '';
        // S3.5a-1 — ⚠ gdy statek immobilized (zaległe utrzymanie floty)
        const immobilized = window.KOSMOS?.vesselManager?.isImmobilized?.(vessel) ?? false;
        const immobBadge = immobilized ? ' ⚠' : '';
        if (immobilized) ctx.fillStyle = THEME.danger;
        ctx.fillText(`${icon} ${vName}${combatBadge}${immobBadge}`, x + pad + fleetGutter, ry + 14);

        // M3 P3.1 — rally indicator (🎯) gdy vessel assigned do rally
        const _rallyName = _rallyByVesselId.get(vessel.id);
        if (_rallyName) {
          const _nameW = ctx.measureText(`${icon} ${vName}`).width;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillStyle = '#ffaa22';  // rally color
          ctx.fillText('🎯', x + pad + fleetGutter + _nameW + 4, ry + 14);
        }

        // Pasek paliwa
        const fuelPct = vessel.fuel.max > 0 ? vessel.fuel.current / vessel.fuel.max : 0;
        const fuelColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;
        const barW = 26; const barH = 3;
        const barX = x + w - pad - barW - 24; const barBY = ry + 9;
        ctx.fillStyle = THEME.bgTertiary; ctx.fillRect(barX, barBY, barW, barH);
        ctx.fillStyle = fuelColor; ctx.fillRect(barX, barBY, Math.round(barW * fuelPct), barH);
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = fuelColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(fuelPct * 100)}%`, x + w - pad, ry + 13);
        ctx.textAlign = 'left';

        // S3.0b S1b: drugi pasek — paliwo warp (cyan THEME.info) pod paskiem in-system; tylko statki
        // z Komorą Warp. Wysokość zarezerwowana w _rowHForVessel (WARP_ROW_EXTRA). Px → kalibracja wizualna.
        if (vessel.warpFuel?.max > 0) {
          const warpPct = vessel.warpFuel.current / vessel.warpFuel.max;
          const wBarBY = ry + 18;
          ctx.fillStyle = THEME.bgTertiary; ctx.fillRect(barX, wBarBY, barW, barH);
          ctx.fillStyle = THEME.info; ctx.fillRect(barX, wBarBY, Math.round(barW * warpPct), barH);
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.info;
          ctx.textAlign = 'right';
          ctx.fillText(`${Math.round(warpPct * 100)}%`, x + w - pad, ry + 22);
          ctx.textAlign = 'left';
        }

        // ── Wiersz 2: lokalizacja / cel ──
        // P2.5 outliner fix: branch po STANIE statku (nie po sec.key — w drzewie
        // sec.key='ungrouped' lub 'fleet_<id>', nie 'hangar/orbit/flight'). Bez tego
        // docked vessel w sekcji floty/ungrouped wpadał w fallback "W locie → ???".
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        const vState = vessel.position?.state;
        if (vState === 'docked') {
          ctx.fillStyle = THEME.success;
          const locName = _resolveName(vessel.position.dockedAt);
          ctx.fillText(`◈ ${locName.length > 18 ? locName.slice(0, 17) + '…' : locName}`, x + pad + 2 + fleetGutter, ry + 28);
        } else if (vState === 'orbiting') {
          ctx.fillStyle = THEME.mint;
          const locName = _resolveName(vessel.position.dockedAt);
          ctx.fillText(`⊙ ${locName.length > 18 ? locName.slice(0, 17) + '…' : locName}`, x + pad + 2 + fleetGutter, ry + 28);
        } else {
          // W locie: → cel + typ misji
          const targetName = vessel.mission?.targetName ?? _resolveName(vessel.mission?.targetId);
          const mType = vessel.mission?.type ?? '';
          const mIcon = _missionTypeIcon(mType);
          const mLabel = _missionTypeLabel(mType);
          ctx.fillStyle = THEME.warning;
          ctx.fillText(`→ ${(targetName ?? '?').slice(0, 12)}`, x + pad + 2 + fleetGutter, ry + 28);
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${mIcon} ${mLabel}`, x + pad + 95 + fleetGutter, ry + 28);

          // ── Wiersz 3 (tylko flight): ETA ──
          const m = vessel.mission;
          const isReturning = m?.phase === 'returning';
          const etaYear = isReturning
            ? (m?.returnYear ?? m?.arrivalYear)
            : (m?.arrivalYear ?? m?.returnYear);
          ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          const etaLabel = isReturning ? '↩ ETA' : '⏱ ETA';
          if (etaYear != null && etaYear > 0) {
            ctx.fillStyle = THEME.warning;
            ctx.fillText(`${etaLabel}: rok ${_fmtYear(etaYear)}`, x + pad + 2 + fleetGutter, ry + 43);
          } else {
            ctx.fillStyle = THEME.textSecondary;
            ctx.fillText(`${etaLabel}: —`, x + pad + 2 + fleetGutter, ry + 43);
          }
        }

        // Separator
        ctx.strokeStyle = 'rgba(0,255,180,0.05)';
        ctx.beginPath(); ctx.moveTo(x + pad, ry + rH - 1); ctx.lineTo(x + w - pad, ry + rH - 1); ctx.stroke();

        this._hitZones.push({ x, y: Math.max(ry, listY), w, h: rH, type: 'vessel', data: { vesselId: vessel.id } });

        // Player Fleet Groups (P1) — multi-select checkbox dla statków gracza.
        // Bug P2 polish #3: checkbox + badge mieszczą się w 14px gutter po lewej
        // (icon+name shifted o fleetGutter). Checkbox na środku wiersza, badge
        // FLOTY pokazujemy jako mały trójkątny indicator obok checkboxa (czytelnie
        // bez nakładki na ikonę statku).
        if (flagOn && sec.key !== 'enemy' && sec.key !== 'wreck') {
          const isMulti = this._multiSelectedIds.has(vessel.id);
          const fleet = vessel.fleetId ? window.KOSMOS?.fleetSystem?.getFleet?.(vessel.fleetId) : null;
          const cbx = x + 1;
          const cby = Math.max(ry + (rH / 2) - 7, listY);  // pionowo wycentrowane
          // Checkbox (12×12 char)
          ctx.font = `12px ${THEME.fontFamily}`;
          ctx.fillStyle = isMulti ? THEME.accent : THEME.textDim;
          ctx.fillText(isMulti ? '☑' : '☐', cbx, cby + 10);
          this._hitZones.push({ x: cbx, y: cby, w: 14, h: 14, type: 'vesselMultiToggle', data: { vesselId: vessel.id } });
          // Badge floty — wąski kolorowy pasek (3px szerokości) lewa krawędź wiersza,
          // mints gdy w jakiejś flocie. Brak tekstu = brak nakładki na ikonę.
          if (fleet) {
            ctx.fillStyle = THEME.mint;
            ctx.fillRect(x, ry + 2, 3, rH - 4);
            // Tooltip-like nazwa floty w skrajnie prawym dolnym rogu wiersza (małym fontem)
            ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
            ctx.fillStyle = THEME.mint;
            const fName = fleet.name.length > 8 ? fleet.name.slice(0, 7) + '…' : fleet.name;
            ctx.textAlign = 'right';
            ctx.fillText('⚑' + fName, x + w - pad, ry + rH - 4);
            ctx.textAlign = 'left';
          }
        }
        ry += rH;
      }
    }

    // Ograniczenie scrollu
    const maxScroll = Math.max(0, totalContentH - listH);
    if (this._scrollOffset > maxScroll) this._scrollOffset = maxScroll;

    ctx.restore();

    // Scroll indicator
    if (totalContentH > listH) {
      const thumbH = Math.max(20, (listH / totalContentH) * listH);
      const thumbY = listY + (this._scrollOffset / totalContentH) * listH;
      ctx.fillStyle = 'rgba(0,255,180,0.15)';
      ctx.fillRect(x + w - 4, thumbY, 3, thumbH);
    }
  }

  _getLocationText(vessel) {
    if (vessel.position.state === 'docked') {
      return t('fleet.locationHangar', _resolveName(vessel.position.dockedAt));
    }
    if (vessel.position.state === 'orbiting') {
      return t('fleet.locationOrbit', _resolveName(vessel.position.dockedAt));
    }
    if (vessel.mission?.targetId) {
      return `→ ${vessel.mission.targetName ?? _resolveName(vessel.mission.targetId)}`;
    }
    return t('fleet.locationInFlight');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Player Fleet Groups (P1) — Tab bar + Fleets tab UI
  // ══════════════════════════════════════════════════════════════════════════

  // Mały tab bar: [Statki | Floty] na górze LEFT panelu.
  _drawLeftTabs(ctx, x, y, w, tabH) {
    const pad = 4;
    const btnH = tabH - 4;
    const btnW = (w - pad * 3) / 2;
    const btns = [
      { id: 'vessels', label: t('fleet.tabVessels') },
      { id: 'fleets',  label: t('fleet.tabFleets') },
    ];
    let bx = x + pad;
    for (const btn of btns) {
      const active = this._activeTab === btn.id;
      ctx.fillStyle = active ? 'rgba(0,255,180,0.18)' : 'rgba(20,30,45,0.6)';
      ctx.fillRect(bx, y + 2, btnW, btnH);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, y + 2, btnW, btnH);
      ctx.font = `${active ? 'bold ' : ''}${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(btn.label, bx + btnW / 2, y + 2 + btnH * 0.5 + 4);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: bx, y: y + 2, w: btnW, h: btnH, type: 'fleetTab', data: { tab: btn.id } });
      bx += btnW + pad;
    }
  }

  // LEFT panel — zakładka Floty: header + przycisk Nowa Flota + lista flot.
  _drawLeftFleets(ctx, x, y, w, h) {
    const pad = 8;
    const fSys = window.KOSMOS?.fleetSystem;
    const fleets = fSys?.listFleets?.() ?? [];

    // Nagłówek
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(t('fleet.fleetsHeader') + ` [${fleets.length}]`, x + pad, y + 22);

    // Przycisk: Nowa flota (h=22)
    const newBtnY = y + 36;
    const newBtnH = 22;
    ctx.fillStyle = 'rgba(0,255,180,0.10)';
    ctx.fillRect(x + pad, newBtnY, w - pad * 2, newBtnH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + pad, newBtnY, w - pad * 2, newBtnH);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'center';
    ctx.fillText('＋ ' + t('fleet.newFleet'), x + w / 2, newBtnY + 15);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + pad, y: newBtnY, w: w - pad * 2, h: newBtnH, type: 'fleetCreate', data: {} });

    // Lista flot — scrollowalna
    const listY = newBtnY + newBtnH + 8;
    const listH = y + h - listY - 2;
    const ROW_H = 36;
    const totalH = fleets.length * ROW_H;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._fleetScrollOffset;
    for (const fleet of fleets) {
      if (ry + ROW_H < listY || ry > listY + listH) { ry += ROW_H; continue; }
      this._drawFleetRow(ctx, x, ry, w, ROW_H, fleet);
      ry += ROW_H;
    }
    ctx.restore();

    // Pusty stan — komunikat
    if (fleets.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.fleetsEmpty'), x + w / 2, listY + 30);
      ctx.textAlign = 'left';
    }
    // Clamp scroll offset
    const maxScroll = Math.max(0, totalH - listH);
    if (this._fleetScrollOffset > maxScroll) this._fleetScrollOffset = maxScroll;
  }

  _drawFleetRow(ctx, x, y, w, h, fleet) {
    const pad = 8;
    const selected = this._selectedFleetId === fleet.id;
    const hovered  = this._hoverFleetId === fleet.id;
    // Tło
    if (selected) {
      ctx.fillStyle = 'rgba(0,255,180,0.10)';
      ctx.fillRect(x, y, w, h);
    } else if (hovered) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(x, y, w, h);
    }
    // Lewa krawędź — accent strip dla selected
    if (selected) {
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(x, y, 2, h);
    }
    // Nazwa
    ctx.font = `${selected ? 'bold ' : ''}${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = selected ? THEME.accent : THEME.textPrimary;
    const nameTxt = fleet.name.length > 16 ? fleet.name.slice(0, 15) + '…' : fleet.name;
    ctx.fillText(nameTxt, x + pad, y + 14);
    // Pod-linia: doctrine + member count
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const doctrineLabel = t(doctrineNameKey(fleet.doctrine));
    const memberCnt = fleet.memberIds.length;
    ctx.fillText(`${doctrineLabel} · ${memberCnt}`, x + pad, y + 28);
    // ✕ disband button na prawym górnym rogu
    const xBtnX = x + w - 18;
    const xBtnY = y + 4;
    ctx.font = `${THEME.fontSizeSmall + 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.fillText('✕', xBtnX, xBtnY + 12);
    this._hitZones.push({ x: xBtnX - 4, y: xBtnY, w: 18, h: 18, type: 'fleetDisband', data: { fleetId: fleet.id } });
    // Reszta wiersza — hit zone select
    this._hitZones.push({ x, y, w: w - 22, h, type: 'fleetRow', data: { fleetId: fleet.id } });
    // Dolna linia separator
    ctx.strokeStyle = THEME.border;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + h - 1);
    ctx.lineTo(x + w - pad, y + h - 1);
    ctx.stroke();
    ctx.globalAlpha = 1.0;
  }

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
      const statusCol = v ? (STATUS_COLORS[v.position?.state]?.() ?? THEME.textSecondary) : THEME.textDim;
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

  // ── P2 — Helper: derived fleet status (idle/moving/engaging/mixed) ──────
  _computeFleetStatus(fleet) {
    const ao = fleet.activeOrder;
    if (!ao) return { label: t('fleet.statusIdle2'), color: THEME.textDim };
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
      const name = await showRenameModal(t('fleet.newFleetDefaultName'));
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
      const newName = await showRenameModal(fleet.name);
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
      const choice = await showFleetAssignModal(fleets);
      if (!choice) return;
      let targetFleetId = choice.fleetId;
      if (choice.action === 'new') {
        const { showRenameModal } = await import('../ui/ModalInput.js');
        const name = await showRenameModal(t('fleet.newFleetDefaultName'));
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
      const fs = window.KOSMOS?.fleetSystem;
      const res = fs?.issueFleetOrder?.(fleetId, {
        type: 'moveToPoint',
        targetPoint: { x: point.x, y: point.y },
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
    // Lista wykrytych enemy vesseli (active, nie wraki) — engage tylko w obrębie oglądanego
    // układu (walka jest wewnątrzukładowa; wróg z innego układu nie jest legalnym celem).
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const enemies = vm.getAllVessels().filter(v =>
      isEnemyVessel(v) && !v.isWreck && _isEnemyTracked(v)
      && (v.systemId ?? 'sys_home') === sysId
    );
    // Sortuj po dystansie od pierwszego membera floty
    const fs = window.KOSMOS?.fleetSystem;
    const fleet = fs?.getFleet?.(fleetId);
    const firstMember = fleet?.memberIds?.map(vid => vm.getVessel(vid)).find(v => v && !v.isWreck);
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

  // Return to base: auto-target nearest friendly planet, fire moveToPoint.
  // Centroid floty (najbliższa kolonia od centroidu, NIE od per-vessel).
  _handleFleetReturnBase(fleetId) {
    const fs = window.KOSMOS?.fleetSystem;
    const fleet = fs?.getFleet?.(fleetId);
    if (!fleet || fleet.memberIds.length === 0) return;
    const ar = window.KOSMOS?.autoRetreatSystem;
    if (!ar?._findNearestFriendlyPlanet) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    const vm = window.KOSMOS?.vesselManager;
    const firstMember = fleet.memberIds
      .map(vid => vm?.getVessel?.(vid))
      .find(v => v && !v.isWreck);
    if (!firstMember) return;
    const nearest = ar._findNearestFriendlyPlanet(firstMember);
    if (!nearest) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    // Bug P2 fix #2: _findNearestFriendlyPlanet zwraca { colony, planet, distanceAU }
    // — unwrap przez nearest.planet (nie nearest.x).
    const planet = nearest.planet;
    const tx = planet?.x ?? planet?.position?.x ?? 0;
    const ty = planet?.y ?? planet?.position?.y ?? 0;
    if (!tx && !ty) {
      EventBus.emit('ui:toast', { text: t('fleet.noFriendlyPlanet'), color: '#ff4466', durationMs: 3000 });
      return;
    }
    // Bug F (polish): auto-dock flag na każdym memberze. FleetSystem listener na
    // vessel:orderCompleted snap'uje pozycję + dock'uje gdy vessel dotrze w dystansie
    // RETURN_DOCK_THRESHOLD_AU od planety. Bez tego vessel stoi w statycznym punkcie
    // gdzie planeta BYŁA w momencie issue (planeta tymczasem orbituje dalej).
    for (const memberId of fleet.memberIds) {
      const member = vm.getVessel(memberId);
      if (member) member._pendingReturnDock = planet.id;
    }
    const res = fs.issueFleetOrder(fleetId, {
      type: 'moveToPoint',
      targetPoint: { x: tx, y: ty },
    });
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
      });
      if (ok) {
        fSys.disbandFleet(fleetId, 'manual');
        if (this._selectedFleetId === fleetId) this._selectedFleetId = null;
      }
    } catch { /* anulowano */ }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CENTER — mapa schematyczna
  // ══════════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h, allVessels, ms) {
    const pad = 8;

    // ── Nagłówek (h=32) ──────────────────────────────────────
    // Atlas i star-cluster mają teraz własne zakładki — tu zawsze mapa taktyczna.
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('fleet.tacticalMap'), x + pad, y + 20);

    // Zoom label
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`×${this._mapZoom.toFixed(1)}`, x + pad + 110, y + 20);

    // Toggle: HOME / TRASY / ZASIĘG (prawy róg nagłówka mapy)
    const toggleY = y + 6;
    let tbx = x + w - pad;

    // 🏠 HOME — szybki powrót na planetę gracza
    {
      const homeTw = 60;
      tbx -= homeTw + 4;
      ctx.fillStyle = 'transparent';
      ctx.fillRect(tbx, toggleY, homeTw, 18);
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 1;
      ctx.strokeRect(tbx, toggleY, homeTw, 18);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.fillText('🏠 HOME', tbx + homeTw / 2, toggleY + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: tbx, y: toggleY, w: homeTw, h: 18, type: 'home_focus', data: {} });
    }

    // TRASY / ZASIĘG
    for (const key of ['range', 'routes']) {
      const label = key === 'routes' ? t('fleet.toggleRoutes') : t('fleet.toggleRange');
      const active = this._mapToggles[key];
      const tw = 50;
      tbx -= tw + 4;
      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : 'transparent';
      ctx.fillRect(tbx, toggleY, tw, 18);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tbx, toggleY, tw, 18);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(label, tbx + tw / 2, toggleY + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: tbx, y: toggleY, w: tw, h: 18, type: 'map_toggle', data: { key } });
    }

    // ── Obszar mapy (clip) ──────────────────────────────────
    const mapY = y + 32;
    const mapH = h - 32;
    this._mapBounds = { x, y: mapY, w, h: mapH };

    // Deferred focus init — _focusOnHomeAtStart wymaga _mapBounds, którego
    // nie ma na momencie wywołania open()/toggle(). Pierwszy draw po otwarciu
    // teraz centruje home planet poprawnie.
    if (this._pendingFocusInit) {
      this._pendingFocusInit = false;
      this._focusOnHomeAtStart();
    }

    // Orphan focus guard — body mogło zostać usunięte (wreck collected,
    // asteroid impact) w długiej sesji z persist state.
    if (this._mapFocusBodyId && !_findBody(this._mapFocusBodyId)) {
      this._mapFocusBodyId = null;
    }

    const mapCx = x + w / 2 + this._mapPanX;
    const mapCy = mapY + mapH / 2 + this._mapPanY;
    const baseRadius = Math.min(w / 2, mapH / 2) - 20;
    const mapRadius = baseRadius * this._mapZoom;

    // Tło mapy — solidne czarne, żeby 3D mapa układu pod spodem nie prześwitywała.
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, mapY, w - 2, mapH - 1);

    // Clip do obszaru mapy
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, mapY, w - 2, mapH - 1);
    ctx.clip();

    // ── Zbierz ciała AKTYWNEGO układu ──────────────────────────
    const sysId      = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const planets    = EntityManager.getByTypeInSystem('planet', sysId);
    const moons      = EntityManager.getByTypeInSystem('moon', sysId);
    const planetoids = EntityManager.getByTypeInSystem('planetoid', sysId);
    const asteroids  = EntityManager.getByTypeInSystem('asteroid', sysId);
    const comets     = EntityManager.getByTypeInSystem('comet', sysId);
    const stars      = EntityManager.getByType('star')?.filter(s => s.systemId === sysId) ?? [];

    // Skala: max orbit AU → mapRadius (base, bez zoom)
    let maxOrbitAU = 1;
    for (const p of planets) {
      const a = p.orbital?.a ?? 0;
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    for (const pd of planetoids) {
      const a = pd.orbital?.a ?? 0;
      if (a > maxOrbitAU) maxOrbitAU = a;
    }
    maxOrbitAU *= 1.15;
    const auToPx = mapRadius / maxOrbitAU;

    // M3 P1.3.5 — cache view state dla inverse transform (handleRightClick).
    // KEEP IN SYNC z toSx/toSy poniżej.
    this._mapViewState = { mapCx, mapCy, auToPx, AU_TO_PX: GAME_CONFIG.AU_TO_PX };

    // Helper: AU coords → screen px
    const toSx = (bodyX) => (bodyX ?? 0) / GAME_CONFIG.AU_TO_PX * auToPx + mapCx;
    const toSy = (bodyY) => (bodyY ?? 0) / GAME_CONFIG.AU_TO_PX * auToPx + mapCy;

    const homePid = window.KOSMOS?.homePlanet?.id;
    const colMgr  = window.KOSMOS?.colonyManager;

    // ── Gwiazda ─────────────────────────────────────────────
    // Rozmiar clamped — wcześniej `5 * _mapZoom` przy wysokim zoomie robiło
    // gwiazdę większą od orbit wewnętrznych planet, chowając je pod spodem.
    // Nowy wzór: logarytmiczny wzrost z zoom, cap 10 px, glow 2× zamiast 3×.
    const starR = Math.max(3, Math.min(10, 3 + 2 * Math.log2(Math.max(1, this._mapZoom))));
    ctx.beginPath();
    ctx.arc(mapCx, mapCy, starR, 0, Math.PI * 2);
    ctx.fillStyle = THEME.yellow;
    ctx.fill();
    // Glow — 2× zamiast 3×, mniejsza alpha żeby nie zasłaniać bliskich orbit
    const grad = ctx.createRadialGradient(mapCx, mapCy, starR, mapCx, mapCy, starR * 2);
    grad.addColorStop(0, 'rgba(255,200,60,0.15)');
    grad.addColorStop(1, 'rgba(255,200,60,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(mapCx, mapCy, starR * 2, 0, Math.PI * 2); ctx.fill();

    if (stars[0]) {
      this._hitZones.push({
        x: mapCx - 10, y: mapCy - 10, w: 20, h: 20,
        type: 'map_body', data: { bodyId: stars[0].id },
      });
    }

    // ── Orbity planet ───────────────────────────────────────
    ctx.strokeStyle = 'rgba(0,255,180,0.055)';
    ctx.lineWidth = 1;
    for (const p of planets) {
      const orbitR = (p.orbital?.a ?? 0) * auToPx;
      if (orbitR > 2) {
        ctx.beginPath();
        ctx.arc(mapCx, mapCy, orbitR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // ── Wszystkie ciała — rysuj i rejestruj hit zones ───────

    // Helper — skala rozmiaru ciał z zoom. `base` = baseline przy zoom=1.
    // `absMaxPx` = bezwzględny pułap w pixelach (zapobiega kolosom na wysokim zoom).
    const bodyScale = (base, absMaxPx) => {
      return Math.min(absMaxPx, Math.max(base, base * Math.sqrt(this._mapZoom)));
    };

    // Planetoidy
    for (const pd of planetoids) {
      const px = toSx(pd.x), py = toSy(pd.y);
      const r = bodyScale(2.5, 12);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = pd.explored ? 'rgba(255,230,100,0.8)' : 'rgba(100,136,170,0.3)';
      ctx.fill();
      this._hitZones.push({ x: px - 8, y: py - 8, w: 16, h: 16, type: 'map_body', data: { bodyId: pd.id } });
    }

    // Asteroidy
    for (const a of asteroids) {
      const px = toSx(a.x), py = toSy(a.y);
      const r = bodyScale(1.5, 6);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(140,120,100,0.4)';
      ctx.fill();
      this._hitZones.push({ x: px - 6, y: py - 6, w: 12, h: 12, type: 'map_body', data: { bodyId: a.id } });
    }

    // Komety
    for (const c of comets) {
      const px = toSx(c.x), py = toSy(c.y);
      const r = bodyScale(2, 8);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,200,255,0.5)';
      ctx.fill();
      this._hitZones.push({ x: px - 6, y: py - 6, w: 12, h: 12, type: 'map_body', data: { bodyId: c.id } });
    }

    // Księżyce
    for (const m of moons) {
      const px = toSx(m.x), py = toSy(m.y);
      const r = bodyScale(2.5, 15);
      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = m.explored ? 'rgba(255,230,100,0.8)' : 'rgba(120,150,180,0.4)';
      ctx.fill();
      if (this._mapZoom >= 2) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText((m.name ?? '').slice(0, 5), px + r + 2, py + 3);
      }
      this._hitZones.push({ x: px - 8, y: py - 8, w: 16, h: 16, type: 'map_body', data: { bodyId: m.id } });
    }

    // Planety (na wierzchu) — cap 25px absolute żeby nie zalewały mapy
    for (const p of planets) {
      const px = toSx(p.x), py = toSy(p.y);
      const isHome = p.id === homePid;
      const hasColony = colMgr?.hasColony(p.id);
      const base = isHome ? 5 : hasColony ? 4 : 3;
      const r = bodyScale(base, 25);

      ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = isHome ? THEME.accent : hasColony ? THEME.mint : p.explored ? 'rgba(255,230,100,0.8)' : THEME.textSecondary;
      ctx.fill();

      // Label — widoczny zawsze
      const label = (p.name ?? p.id).slice(0, this._mapZoom >= 1.5 ? 8 : 3);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, px + r + 2, py + 3);

      this._hitZones.push({ x: px - 10, y: py - 10, w: 20, h: 20, type: 'map_body', data: { bodyId: p.id } });
    }

    // ── S3.3b-S3b — stacje orbitalne (HUB) — marker przy ciele macierzystym (pozycja LIVE z bodyId) ──
    for (const st of EntityManager.getByTypeInSystem('station', sysId)) {
      const body = EntityManager.get(st.bodyId);
      const bx0 = toSx(body?.x ?? st.x), by0 = toSy(body?.y ?? st.y);
      const off = bodyScale(9, 30);         // offset skalowany z zoomem (jak rozmiar ciał) — marker poza planetą na każdym zoomie
      const sxm = bx0 + off, sym = by0 - off;
      const isOwn = (st.ownerEmpireId ?? 'player') === 'player';
      ctx.strokeStyle = 'rgba(120,200,255,0.30)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx0, by0); ctx.lineTo(sxm, sym); ctx.stroke();   // linia łącząca z ciałem
      ctx.fillStyle = isOwn ? (THEME.info ?? '#44ccff') : THEME.danger;
      ctx.fillRect(sxm - 3, sym - 3, 6, 6);
      ctx.strokeStyle = isOwn ? '#aaddff' : THEME.danger;
      ctx.strokeRect(sxm - 3, sym - 3, 6, 6);
      if (this._mapZoom >= 2) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText((st.name ?? '').slice(0, 6), sxm + 5, sym + 3);
      }
      this._hitZones.push({ x: sxm - 7, y: sym - 7, w: 14, h: 14, type: 'map_station', data: { stationId: st.id, bodyId: st.bodyId } });
    }

    // ── Misje aktywne (linie + ikona misji) ─────────────────
    const missions = ms?.getActive?.() ?? [];
    for (const m of missions) {
      if (!m.vesselId) continue;
      const vMgr = window.KOSMOS?.vesselManager;
      const vessel = vMgr?.getVessel(m.vesselId);
      if (!vessel) continue;
      // Pokaż tylko misje statków w aktywnym układzie
      if ((vessel.systemId ?? 'sys_home') !== sysId) continue;

      const vx = toSx(vessel.position.x), vy = toSy(vessel.position.y);
      const target = _findBody(m.targetId);

      // Linia misji: statek → cel
      if (target) {
        const tpx = toSx(target.x), tpy = toSy(target.y);
        const isSel = vessel.id === this._selectedVesselId;

        // Kolor wg typu misji
        let routeColor = 'rgba(255,204,68,0.4)';
        if (m.type === 'recon' || m.type === 'survey' || m.type === 'deep_scan')
          routeColor = 'rgba(0,204,255,0.5)';
        else if (m.type === 'colony') routeColor = 'rgba(170,136,255,0.5)';
        else if (m.type === 'transport') routeColor = 'rgba(255,204,68,0.5)';
        if (isSel) routeColor = THEME.accent;

        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = routeColor;
        ctx.lineWidth = isSel ? 2 : 1;
        ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(tpx, tpy); ctx.stroke();
        ctx.setLineDash([]);

        // Ikona misji (połowa drogi)
        if (vessel.position.state === 'in_transit') {
          const midX = (vx + tpx) / 2, midY = (vy + tpy) / 2;
          const mIcon = m.type === 'recon' || m.type === 'survey' ? '🔭'
            : m.type === 'colony' ? '🚢'
            : m.type === 'transport' ? '📦'
            : m.type === 'mining' ? '⛏' : '→';
          ctx.font = `10px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(mIcon, midX - 5, midY + 4);
        }
      }

      // Status badge na orbicie
      if (vessel.position.state === 'orbiting' && target) {
        const tpx = toSx(target.x), tpy = toSy(target.y);
        ctx.strokeStyle = THEME.mint;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath(); ctx.arc(tpx, tpy, 10 * Math.min(this._mapZoom, 2), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Zasięg wybranego statku ─────────────────────────────
    if (this._mapToggles.range && this._selectedVesselId) {
      const vMgr = window.KOSMOS?.vesselManager;
      const selV = vMgr?.getVessel(this._selectedVesselId);
      if (selV) {
        const range = effectiveRange(selV);
        const rangeR = range * auToPx;
        const svx = toSx(selV.position.x), svy = toSy(selV.position.y);
        ctx.setLineDash([6, 3]);
        ctx.strokeStyle = 'rgba(0,255,180,0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(svx, svy, rangeR, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // ── Stacje gracza (lokacja doku/orbity) — S3.4-F2 ────────────
    // Command „nie znał" stacji jako lokacji: mapa taktyczna rysowała tylko ciała, więc statki
    // zadokowane/orbitujące stację były wizualnie osierocone (bez kotwicy). Rysuj 🛰 markery na
    // POZYCJI CIAŁA KOTWICZĄCEGO (stacja ma statyczne x/y, ale anchor body orbituje) — spójnie z
    // resolveBodyPos. Docked statki i tak ukryte, ale stacja daje im widoczną lokację na mapie.
    for (const st of (EntityManager.getByType('station') ?? [])) {
      if (st.ownerEmpireId && st.ownerEmpireId !== 'player') continue;   // mgła wojny — tylko stacje gracza
      if ((st.systemId ?? 'sys_home') !== sysId) continue;
      const anchor = st.bodyId ? EntityManager.get(st.bodyId) : null;
      const sx = toSx(anchor?.x ?? st.x), sy = toSy(anchor?.y ?? st.y);
      const sr = bodyScale(3, 9);
      // Romb (diament) — odróżnia stację od kropek statków/ciał; obrys akcentowy.
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.5;
      ctx.strokeRect(-sr, -sr, sr * 2, sr * 2);
      ctx.restore();
      if (this._mapZoom >= 1.5) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.accent;
        ctx.fillText(`🛰 ${(st.name ?? '').slice(0, 8)}`, sx + sr + 3, sy + 3);
      }
      this._hitZones.push({ x: sx - 9, y: sy - 9, w: 18, h: 18, type: 'map_station', data: { stationId: st.id } });
    }

    // ── Statki (kropki — na wierzchu) — tylko z aktywnego układu ──
    for (const v of allVessels) {
      if ((v.systemId ?? 'sys_home') !== sysId) continue;
      const isEnemy = isEnemyVessel(v);
      const isWreck = !!v.isWreck;
      // Fog-of-war 3-poziomowy (wraki zawsze widoczne — zniszczony statek nie ma mgły):
      //   hidden → pomiń; echo → anonimowy ghost „?" (pozycja bez tożsamości); identified → pełny render.
      if (isEnemy && !isWreck) {
        const vis = _enemyVisLevel(v);
        if (vis === 'hidden') continue;
        if (vis === 'echo') {
          // Echo obserwatorium: pusta przyćmiona kropka „?" — bez nazwy, bez hit-zony (brak inspekcji
          // tożsamości; gracz wysyła statek → proximity → contact → pełne dane). Pozycja = ZAMROŻONA
          // positionLastKnown (jak ghost na 3D): w zasięgu sensorów odświeżana ~na żywo, po wyjściu
          // zamrożona i gaśnie po RUMOR_FADE_YEARS (inaczej rumor — który nie wygasa — śledziłby wroga
          // na żywo poza zasięgiem = przeciek pozycji).
          const rec = window.KOSMOS?.intelSystem?.getVesselContact?.(v.id);
          const pos = rec?.positionLastKnown ?? v.position;
          if (!pos) continue;
          const detectedNow = window.KOSMOS?.observatorySystem?.isVesselDetected?.(v.id);
          if (!detectedNow) {
            const gy = window.KOSMOS?.timeSystem?.gameTime ?? 0;
            const ageY = gy - (rec?.lastSeenYear ?? gy);
            if (ageY > (GAME_CONFIG.RUMOR_FADE_YEARS ?? 10)) continue;   // przestarzałe echo → zgaś
          }
          this._drawStratcomGhostBlip(ctx, toSx(pos.x), toSy(pos.y));
          continue;
        }
      }
      const vx = toSx(v.position.x), vy = toSy(v.position.y);
      const isSel = v.id === this._selectedVesselId;
      // Statki skalują się z zoom; absolutny cap 10px żeby nie konkurowały z planetami
      const baseR = isSel ? 4 : 3;
      const r = bodyScale(baseR, 10);
      const color = isSel ? THEME.accent
        : isWreck ? '#808080'
        : isEnemy ? '#ff4466'
        : v.position.state === 'docked' ? THEME.success
        : v.position.state === 'orbiting' ? THEME.mint
        : THEME.warning;

      ctx.beginPath(); ctx.arc(vx, vy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isSel) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(vx, vy, r + 2, 0, Math.PI * 2); ctx.stroke();
      }

      // Label statku przy zoom
      if (this._mapZoom >= 2) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        ctx.fillText((v.name ?? '').slice(0, 8), vx + r + 3, vy + 3);
      }

      this._hitZones.push({
        x: vx - 10, y: vy - 10, w: 20, h: 20,
        type: 'map_vessel', data: { vesselId: v.id },
      });
    }

    // ── M3 P2.3 — POI sprites (resolves issue #6) ─────────────
    this._drawPOISprites(ctx, toSx, toSy, bodyScale, auToPx);

    ctx.restore(); // koniec clip

    // ── Legenda (poza clip) ─────────────────────────────────
    const legX = x + w - 140;
    const legY2 = mapY + 8;
    ctx.fillStyle = bgAlpha(0.65);
    ctx.fillRect(legX, legY2, 132, 116);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(legX, legY2, 132, 116);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const legendItems = [
      { color: THEME.accent,        label: t('fleet.legendHomePlanet') },
      { color: THEME.mint,          label: t('fleet.legendColony') },
      { color: THEME.textSecondary, label: t('fleet.legendPlanet') },
      { color: THEME.success,       label: t('fleet.legendShipHangar') },
      { color: THEME.warning,       label: t('fleet.legendShipFlight') },
      { color: THEME.mint,          label: t('fleet.legendShipOrbit') },
      { color: '#ff4466',           label: '⚔ Wróg (wykryty)' },
      { color: '#808080',           label: '💀 Wrak' },
    ];
    let ly = legY2 + 12;
    for (const item of legendItems) {
      ctx.fillStyle = item.color;
      ctx.fillText(item.label, legX + 6, ly);
      ly += 13;
    }

    // ── Tooltip ciała (na hover/klik) ───────────────────────
    if (this._mapHoverBody) {
      this._drawBodyTooltip(ctx, x, mapY, w, mapH);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // M3 P2.3 — POI sprites w tactical map (resolves issue #6)
  // ══════════════════════════════════════════════════════════════════════════
  // Per-type geometric shapes (D-tactical-poi-display = β):
  //   waypoint  → outlined circle
  //   patrol    → triangle z linami do waypointów (route visualization)
  //   picket    → filled circle + range circle (semi-transparent fill)
  //   rally     → diamond (rotated square)
  //   ambush    → dashed circle (dimmed alpha gdy hidden=true)
  //
  // POI_TYPE_COLORS hex (z ThreeRenderer M2b POI sprites) → CSS rgba.
  _drawPOISprites(ctx, toSx, toSy, bodyScale, auToPx) {
    const reg = window.KOSMOS?.poiRegistry;
    if (!reg?.listPOIs) return;
    const pois = reg.listPOIs() ?? [];
    if (pois.length === 0) return;

    const POI_COLOR_CSS = {
      waypoint: '#5588ff',
      patrol:   '#33ff66',
      picket:   '#ff3333',
      rally:    '#ffaa22',
      ambush:   '#aa44ff',
    };
    // M3 P3.1 — runtime state colors (simple color change, no animation per Filip flag #2)
    const POI_TRIGGERED_COLOR = '#ff8800';  // picket triggered (orange)
    const POI_COMPLETE_COLOR  = '#44ff88';  // rally complete (green)
    const r = bodyScale(3, 8);

    ctx.save();
    for (const poi of pois) {
      const loc = getPOILocation(poi);
      if (!loc) continue;
      const px = toSx(loc.x), py = toSy(loc.y);
      // Runtime state override koloru (P3.1):
      //   picket triggered (orange) — persistent przez cooldown 30 dni gry
      //   rally complete (green) — persistent po complete=true
      let color = POI_COLOR_CSS[poi.type] ?? '#888';
      if (poi.type === 'picket' && poi.triggered) color = POI_TRIGGERED_COLOR;
      else if (poi.type === 'rally' && poi.complete) color = POI_COMPLETE_COLOR;

      ctx.globalAlpha = (poi.type === 'ambush' && poi.hidden) ? 0.4 : 0.9;

      if (poi.type === 'waypoint') {
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
      } else if (poi.type === 'patrol') {
        // Triangle marker + lines do waypoints[1..n] (loop closure: ostatni → pierwszy)
        const wps = Array.isArray(poi.waypoints) ? poi.waypoints : [];
        if (wps.length >= 2) {
          ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
          ctx.beginPath();
          for (let i = 0; i < wps.length; i++) {
            const wx = toSx(wps[i].x), wy = toSy(wps[i].y);
            if (i === 0) ctx.moveTo(wx, wy);
            else         ctx.lineTo(wx, wy);
          }
          if (poi.loopMode === 'loop') {
            const w0x = toSx(wps[0].x), w0y = toSy(wps[0].y);
            ctx.lineTo(w0x, w0y);
          }
          ctx.stroke(); ctx.setLineDash([]);

          // Małe kropki na każdym waypoincie
          ctx.fillStyle = color;
          for (const wp of wps) {
            ctx.beginPath();
            ctx.arc(toSx(wp.x), toSy(wp.y), Math.max(2, r - 1), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        // Triangle marker w pierwszym waypoincie
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py + r * 0.7);
        ctx.lineTo(px - r, py + r * 0.7);
        ctx.closePath();
        ctx.fill();
      } else if (poi.type === 'picket') {
        // Range circle (semi-transparent fill) + filled center
        const rangeR = (poi.rangePxLocal ?? 0) / GAME_CONFIG.AU_TO_PX * (auToPx ?? 1);
        if (rangeR > 1) {
          ctx.fillStyle = color + '22';  // alpha ~0x22 = 13%
          ctx.beginPath(); ctx.arc(px, py, rangeR, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = color + '55'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(px, py, rangeR, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
      } else if (poi.type === 'rally') {
        // Diamond (rotated square)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(px, py - r);
        ctx.lineTo(px + r, py);
        ctx.lineTo(px, py + r);
        ctx.lineTo(px - r, py);
        ctx.closePath(); ctx.fill();
      } else if (poi.type === 'ambush') {
        // Dashed circle (zawsze dashed; alpha 0.4 gdy hidden=true ustawiona wyżej)
        const rangeR = (poi.rangePxLocal ?? 0) / GAME_CONFIG.AU_TO_PX * (auToPx ?? 1);
        if (rangeR > 1) {
          ctx.strokeStyle = color + '44'; ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath(); ctx.arc(px, py, rangeR, 0, Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        ctx.setLineDash([3, 2]);
        ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }

      // Hitzone — większy niż sprite dla łatwiejszego hover/PPM
      this._hitZones.push({
        x: px - 10, y: py - 10, w: 20, h: 20,
        type: 'map_poi', data: { poiId: poi.id },
      });
    }
    ctx.restore();
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

  // ══════════════════════════════════════════════════════════════════════════
  // STAR CLUSTER — minimapa pobliskich gwiazd (2D Canvas)
  // ══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATCOM — radar strategiczny (zakładka Stratcom). Ewolucja star-cluster:
  // okrągły radar (pierścienie zasięgu + sweep) zasilany obserwatorium, mgła wojny
  // (tylko systemy znane lub w żywym zasięgu), color-code imperiów, planowanie warpu
  // (reużywa hity cluster_star/cluster_send/cluster_switch). Granice terytoriów i
  // migające wrogie kontakty — ODŁOŻONE (przyszły slice).
  // ═══════════════════════════════════════════════════════════════════════════

  // Zasięg radaru w latach świetlnych — JEDYNE źródło. Baza = „działanie w ciemno";
  // obserwatorium rozszerza (przyszłe sieci radioteleskopów OR-ują tu swój zasięg).
  _getStratcomRangeLY() {
    const obs = window.KOSMOS?.observatorySystem;
    const raw = obs?.getMaxObservatoryLevel?.() ?? 0;
    const lvl = Math.min(raw, STRATCOM_LY_BY_LEVEL.length - 1);
    return STRATCOM_LY_BY_LEVEL[lvl];
  }

  // Tryb renderu blipu statku warp na Stratcom (fog-of-war). Wołane gdy statek jest JUŻ w zasięgu
  // rangeLY (bramka dystansu = detekcja galaktyczna). Zwraca:
  //   'self'    — własny/sojuszniczy → żywy blip (akcent),
  //   'contact' — wróg z intel ≥ contact (bliskie spotkanie) → solid czerwony + linia trasy,
  //   'rumor'   — wróg wykryty radarem, bez identyfikacji → ghost „?" (pośredni kontakt).
  _stratcomWarpBlipMode(v) {
    if (!isEnemyVessel(v)) return 'self';
    const q = window.KOSMOS?.intelSystem?.getVesselContact?.(v.id)?.quality ?? 'unknown';
    return (q === 'contact' || q === 'detailed') ? 'contact' : 'rumor';
  }

  // Ghost-blip pośredniego kontaktu: przyćmiona pusta kropka „?" (brak tożsamości i trasy).
  _drawStratcomGhostBlip(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,90,90,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,90,90,0.75)';
    ctx.font = `bold ${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x, y + 0.5);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  // Zbiór systemów Stratcomu — wspólny dla radaru i mapy galaktyki. Pokazujemy
  // WSZYSTKIE gwiazdy (mapa nawigacyjna — można planować skoki do odległych).
  // `known` = zbadane/home/intel-empire; `inSensor` = w zasięgu sensorów obserwatorium
  // (wykrywanie OBECNOŚCI statków own/enemy ograniczone do tego promienia).
  // Zwraca { home, list:[{s,d2,known,inSensor}] (sort wg odległości), rangeLY, isEmpKnown }.
  _stratcomVisibleSystems() {
    const systems = window.KOSMOS?.galaxyData?.systems ?? [];
    const home = systems.find(s => s.isHome) ?? null;
    const intel = window.KOSMOS?.intelSystem;
    const obsSys = window.KOSMOS?.observatorySystem;
    const rangeLY = this._getStratcomRangeLY();
    const isEmpKnown = (s) => !!(s.empireId && (intel ? intel.isAtLeast(s.empireId, 'rumor') : false));
    const list = [];
    if (home) {
      for (const s of systems) {
        const dx = (s.x ?? 0) - (home.x ?? 0);
        const dy = (s.y ?? 0) - (home.y ?? 0);
        const d2 = Math.sqrt(dx * dx + dy * dy);
        const known = !!s.isHome || !!s.explored || isEmpKnown(s);
        // Nazwa znana = zbadany LUB przeskanowany w STRATCOM (skan ujawnia nazwę).
        const nameKnown = known || !!obsSys?.getSystemScanResult?.(s.id);
        list.push({ s, d2, known, nameKnown, inSensor: d2 <= rangeLY });
      }
      list.sort((a, b) => a.d2 - b.d2);
    }
    return { home, list, rangeLY, isEmpKnown };
  }

  // ── Realne kolory gwiazdy wg typu spektralnego (rdzeń + halo) ──────────────
  // galaxyData niesie colorHex/glowColorHex (liczby 0xRRGGBB ze STAR_TYPES).
  // Fallback: brak danych → akcent motywu (degradacja do dawnego „cyan").
  _starRgb(sys) {
    const toRgb = (hex) => `${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255}`;
    const core = sys?.colorHex;
    if (core == null) {
      const a = hexToRgb(THEME.accent);
      const s = `${a.r},${a.g},${a.b}`;
      return { core: s, glow: s };
    }
    return { core: toRgb(core), glow: toRgb(sys.glowColorHex ?? core) };
  }

  // Stała faza migotania per-gwiazda (z id) — gwiazdy nie pulsują zgodnie.
  _starPhase(sys) {
    const s = String(sys?.id ?? '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    return (h / 0xffff) * Math.PI * 2;
  }

  // ── „Małe słońce": rdzeń biało-gorący → kolor spektralny → halo glow ───────
  // r = promień rdzenia (px); dim → przygaszona „widmowa" gwiazda (niezbadana).
  // Rysuje TYLKO ciało gwiazdy — pierścienie stanu/etykiety dorysowuje wywołujący.
  _drawStarGlyph(ctx, sx, sy, r, sys, dim = false) {
    const { core, glow } = this._starRgb(sys);
    const bright = dim ? 0.5 : 1.0;
    const tw = 0.88 + 0.12 * Math.sin(performance.now() / 850 + this._starPhase(sys));
    const a = (v) => Math.max(0, Math.min(1, v)).toFixed(3);

    // Halo — additive, rozświetla sąsiedztwo (efekt korony słonecznej)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3.6);
    hg.addColorStop(0,    `rgba(${glow},${a(0.55 * bright * tw)})`);
    hg.addColorStop(0.35, `rgba(${glow},${a(0.18 * bright * tw)})`);
    hg.addColorStop(1,    `rgba(${glow},0)`);
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.arc(sx, sy, r * 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // Rdzeń — biało-gorące centrum przechodzące w kolor typu gwiazdy
    const cg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    cg.addColorStop(0,    `rgba(255,255,255,${a(0.95 * bright)})`);
    cg.addColorStop(0.45, `rgba(${core},${a(0.98 * bright)})`);
    cg.addColorStop(1,    `rgba(${core},${a(0.65 * bright)})`);
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
  }

  // ── Tło panelu Stratcomu (Canvas 2D): PNG mgławicy ściemniony do subtelności ──
  // key: 'radar' → deep_space_radar.png | 'galaxy' → deep_space.png. Obraz ładowany
  // leniwie (cache na instancji); do czasu załadowania panel jest czarny. Widoczne
  // niezależnie od tego, czy panel jest duży czy mały (podgląd).
  _getPanelBgImage(key) {
    if (typeof Image === 'undefined') return null;   // headless (smoke) — brak globalu Image
    if (!this._bgImages) this._bgImages = {};
    if (!this._bgImages[key]) {
      const url = key === 'radar'
        ? 'assets/backgrounds/deep_space_radar.png'
        : 'assets/backgrounds/deep_space.png';
      const img = new Image();
      img.src = url;
      this._bgImages[key] = img;
    }
    return this._bgImages[key];
  }

  _drawPanelBg(ctx, x, y, w, h, key) {
    // Czarna baza (gdy obraz jeszcze się ładuje lub brak pliku)
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, y, w - 2, h - 1);
    const img = this._getPanelBgImage(key);
    if (!img || !img.complete || !img.naturalWidth) return;
    const rw = w - 2, rh = h - 1;
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y, rw, rh); ctx.clip();
    ctx.imageSmoothingQuality = 'high';
    // cover-fit: skala tak, by wypełnić prostokąt (wyśrodkowane)
    const k = Math.max(rw / img.naturalWidth, rh / img.naturalHeight);
    const dw = img.naturalWidth * k, dh = img.naturalHeight * k;
    ctx.drawImage(img, x + 1 + (rw - dw) / 2, y + (rh - dh) / 2, dw, dh);
    // ściemnienie do subtelności (czarny overlay = mnożenie jasności)
    ctx.fillStyle = `rgba(0,0,0,${(1 - STRATCOM_BG_BRIGHTNESS).toFixed(3)})`;
    ctx.fillRect(x + 1, y, rw, rh);
    ctx.restore();
  }

  // Radar Stratcom. isBig=true → pełny (hity gwiazd + panel polityczny + legenda);
  // isBig=false → kompaktowy podgląd (całość = hit „rozwiń", bez selekcji gwiazd).
  _drawStratcom(ctx, x, y, w, h, isBig = true) {
    const PAD = 10;

    // Tło — subtelna mgławica radaru (deep_space_radar) ściemniona; czarna baza pod spodem
    this._drawPanelBg(ctx, x, y, w, h, 'radar');

    const gd = window.KOSMOS?.galaxyData;
    const home = gd?.systems?.find(s => s.isHome) ?? null;
    if (!gd?.systems?.length || !home) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.stratcomNoData'), x + PAD, y + 20);
      if (!isBig) this._hitZones.push({ x, y, w, h, type: 'stratcom_expand', data: { panel: 'radar' } });
      return;
    }

    const systems = gd.systems;
    const ssMgr  = window.KOSMOS?.starSystemManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    const empReg = window.KOSMOS?.empireRegistry;
    const intel  = window.KOSMOS?.intelSystem;
    const dipl   = window.KOSMOS?.diplomacySystem;

    // ── Geometria radaru ──────────────────────────────────────
    // Lewa kolumna (tylko duży radar) = tabela statków warp; tarcza kurczy się do prawej.
    const LIST_W = isBig ? Math.min(220, Math.round(w * 0.30)) : 0;
    const dialX = x + LIST_W;
    const dialW = w - LIST_W;
    const cx = dialX + dialW / 2 + this._clusterPanX;
    const cy = y + h / 2 + this._clusterPanY;
    const R  = Math.min(dialW, h) / 2 - 40;
    const rangeLY = this._getStratcomRangeLY();   // zasięg SENSORÓW (obserwatorium)
    // Skala dopasowana do NAJDALSZEJ gwiazdy — radar pokazuje CAŁE pole gwiazd
    // (nawigacja). Sensory (wykrywanie statków) ograniczone do rangeLY = osobny pierścień.
    let maxD = rangeLY;
    for (const s of systems) {
      const d = Math.hypot((s.x ?? 0) - home.x, (s.y ?? 0) - home.y);
      if (d > maxD) maxD = d;
    }
    maxD *= 1.08;
    const scale = (R * this._clusterZoom) / maxD;   // px na ly
    const toSx = (lx) => cx + (lx - home.x) * scale;
    const toSy = (ly) => cy + (ly - home.y) * scale;

    // Clip do prostokąta zakładki
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y, w - 2, h - 1);
    ctx.clip();

    // ── Pierścienie zasięgu + krzyż celownika ─────────────────
    const outerLY = maxD / this._clusterZoom;   // ly na zewnętrznym pierścieniu (pełne pole)
    ctx.lineWidth = 1;
    for (let i = 1; i <= 4; i++) {
      const rr = R * (i / 4);
      ctx.strokeStyle = i === 4 ? 'rgba(0,255,180,0.22)' : 'rgba(0,255,180,0.08)';
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      // Etykieta ly przy górze pierścienia
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(`${(outerLY * i / 4).toFixed(1)} ly`, cx, cy - rr - 2);
      ctx.textAlign = 'left';
    }
    // Pierścień ZASIĘGU SENSORÓW (obserwatorium) — w jego obrębie wykrywamy statki.
    const sensorRR = Math.min(R, rangeLY * scale);
    if (sensorRR > 4 && sensorRR < R - 1) {
      ctx.strokeStyle = 'rgba(0,224,255,0.5)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, sensorRR, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillStyle = 'rgba(0,224,255,0.85)';
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.stratcomSensors', rangeLY.toFixed(0)), cx, cy + sensorRR + 9);
      ctx.textAlign = 'left';
    }
    // Krzyż
    ctx.strokeStyle = 'rgba(0,255,180,0.08)';
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // ── Zawartość plotowana — clip do koła radaru ─────────────
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // ── Iluminacja tarczy radaru — miękkie podświetlenie OD ŚRODKA na CAŁĄ tarczę,
    //    powolne „oddychanie" (styl sci-fi: backlit hologram). Warstwa pod blipami.
    if (STRATCOM_GLOW) {
      const breath = 0.5 + 0.5 * Math.sin(performance.now() / STRATCOM_GLOW_MS * Math.PI * 2);
      const intensity = 0.10 + 0.12 * breath;            // 0.10..0.22 alpha
      const { r, g, b } = hexToRgb(THEME.accent);         // kolor z motywu (podąża za THEME)
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);  // środek → cała powierzchnia
      grad.addColorStop(0,    `rgba(${r},${g},${b},${intensity.toFixed(3)})`);
      grad.addColorStop(0.65, `rgba(${r},${g},${b},${(intensity * 0.55).toFixed(3)})`);
      grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    }

    // Linie jump-gate (fioletowe)
    for (const g of systems.filter(s => s.jumpGate)) {
      const connTo = ssMgr?.getSystem(g.id)?.jumpGate?.connectedTo;
      const other = connTo ? systems.find(s => s.id === connTo) : null;
      if (!other) continue;
      ctx.strokeStyle = 'rgba(170,136,255,0.4)';
      ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(toSx(g.x), toSy(g.y)); ctx.lineTo(toSx(other.x), toSy(other.y));
      ctx.stroke(); ctx.setLineDash([]);
    }

    // Linie tranzytu międzygwiezdnego + pozycja statku. SENSORY: wykrywanie tylko w zasięgu
    // obserwatorium (rangeLY = bramka detekcji galaktycznej). Fog-of-war: wróg bez intel-kontaktu =
    // ghost „?" (pośredni), wróg z contact = solid czerwony, własny/sojuszniczy = żywy blip.
    // Wybrany statek gracza pomijamy tu — ma własną trasę + marker (rysowane zawsze).
    for (const v of (vMgr?.getInterstellarVessels() ?? [])) {
      if (v.id === this._selectedWarpShipId) continue;
      const m = v.mission;
      if (!m || m.phase !== 'warp_transit') continue;
      const sx0 = m.currentGalX ?? 0, sy0 = m.currentGalY ?? 0;
      if (Math.hypot(sx0 - home.x, sy0 - home.y) > rangeLY) continue;   // poza sensorami → niewykryty
      const mode = this._stratcomWarpBlipMode(v);   // 'self' | 'contact' | 'rumor'
      const fromS = systems.find(s => s.id === m.fromSystemId);
      const toS   = systems.find(s => s.id === m.toSystemId);
      const vsx = toSx(m.currentGalX ?? (fromS?.x ?? sx0));
      const vsy = toSy(m.currentGalY ?? (fromS?.y ?? sy0));
      if (mode === 'rumor') {
        // Pośredni kontakt — ghost bez linii trasy (nie znamy celu).
        this._drawStratcomGhostBlip(ctx, vsx, vsy);
        continue;
      }
      if (fromS && toS) {
        ctx.strokeStyle = mode === 'contact' ? 'rgba(255,68,102,0.4)' : 'rgba(255,170,50,0.35)';
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(toSx(fromS.x), toSy(fromS.y)); ctx.lineTo(toSx(toS.x), toSy(toS.y));
        ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.fillStyle = mode === 'contact' ? '#ff4466' : THEME.warning;
      ctx.beginPath(); ctx.arc(vsx, vsy, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Trasa wybranego statku warp (CAŁA, do celu): bieżący skok + pozostałe (2 kolory).
    {
      const selMv = this._selectedWarpShipId ? vMgr?.getVessel?.(this._selectedWarpShipId) : null;
      if (selMv?.warpRoute) this._drawWarpRouteLine(ctx, selMv.warpRoute, (s) => ({ sx: toSx(s.x ?? 0), sy: toSy(s.y ?? 0) }));
    }

    // ── Wszystkie gwiazdy (radar = pełna mapa nawigacyjna) ──
    const vis = this._stratcomVisibleSystems();
    const isEmpKnown = vis.isEmpKnown;
    const shown = vis.list;

    const selSys = this._selectedClusterSystem;
    let anyBeyondHome = false;

    for (const { s, known, nameKnown } of shown) {
      const sx = toSx(s.x ?? 0);
      const sy = toSy(s.y ?? 0);
      // poza okręgiem radaru → pomiń (i blip, i hit)
      if (Math.hypot(sx - cx, sy - cy) > R - 2) continue;
      if (!s.isHome) anyBeyondHome = true;

      const isHome     = !!s.isHome;
      const isSelected = selSys === s.id;
      const isHover    = this._clusterHoverSystem === s.id;
      const empKnown   = isEmpKnown(s);

      // Promień (rozmiar wg ważności; zaznaczone/hover odrobinę większe)
      let r = isHome ? 6 : (known ? 4 : 3);
      if (isSelected || isHover) r += 1;
      const dim = !known && !isHome;   // w zasięgu, ale niezbadana → „widmowa"

      // Miękka poświata akcentu pod gwiazdą (czytelność home/selekcji)
      if (isHome || isSelected) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
        grad.addColorStop(0, isHome ? 'rgba(255,204,68,0.18)' : 'rgba(0,255,180,0.18)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(sx, sy, r * 4, 0, Math.PI * 2); ctx.fill();
      }

      // „Małe słońce" — rdzeń + halo w realnym kolorze typu gwiazdy.
      // Stan gry = nakładka: nieznane przygaszone, pierścienie/etykiety niżej.
      this._drawStarGlyph(ctx, sx, sy, r, s, dim);

      // Pierścień hostility dla znanego imperium
      if (empKnown) {
        const host = dipl?.getHostility?.(s.empireId) ?? 0;
        ctx.strokeStyle = host <= 30 ? (THEME.success ?? '#44cc66')
                        : host <= 70 ? (THEME.warning ?? '#ffcc44')
                        : (THEME.danger ?? '#ff4466');
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2); ctx.stroke();
      }

      // Obwódka selekcji
      if (isSelected) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke();
      }

      // Ikony infrastruktury (tylko dla znanych)
      if (known) {
        const sysData = ssMgr?.getSystem(s.id);
        const hasCol = colMgr?.getAllColonies?.().some(c => EntityManager.get(c.planetId)?.systemId === s.id) ?? false;
        if (hasCol)                              { ctx.font = `8px ${THEME.fontFamily}`; ctx.fillText('🏗', sx + r + 2, sy - r); }
        if (sysData?.warpBeacon || s.warpBeacon) { ctx.font = `7px ${THEME.fontFamily}`; ctx.fillText('📡', sx + r + 2, sy + 2); }
        if (sysData?.jumpGate   || s.jumpGate)   { ctx.font = `7px ${THEME.fontFamily}`; ctx.fillText('🌀', sx + r + 2, sy + 10); }
      }

      // Nazwa (znane) lub „???" (kontakt w zasięgu, nieznany)
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      if (nameKnown) {
        ctx.fillStyle = isHome ? THEME.yellow : THEME.textPrimary;
        ctx.fillText(s.name, sx, sy + r + 12);
      } else if (isHover || isSelected) {
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('???', sx, sy + r + 12);
      }
      ctx.textAlign = 'left';

      // Hit zone selekcji gwiazdy — tylko gdy radar duży (mały = klik rozwija).
      if (isBig) {
        const hitR = Math.max(r + 5, 11);
        this._hitZones.push({
          x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2,
          type: 'cluster_star', data: { systemId: s.id },
        });
      }
    }

    // Marker „mój statek" — wybrany statek warp (bieżący układ lub pozycja tranzytu).
    if (this._selectedWarpShipId) {
      const mv = vMgr?.getVessel?.(this._selectedWarpShipId);
      if (mv) {
        let mx = null, my = null;
        if (mv.position?.state === 'in_transit' && mv.mission?.type === 'interstellar_jump') {
          mx = toSx(mv.mission.currentGalX ?? mv.mission.fromGalX ?? 0);
          my = toSy(mv.mission.currentGalY ?? mv.mission.fromGalY ?? 0);
        } else {
          const msys = systems.find(s => s.id === (mv.systemId ?? 'sys_home'));
          if (msys) { mx = toSx(msys.x ?? 0); my = toSy(msys.y ?? 0); }
        }
        if (mx != null && Math.hypot(mx - cx, my - cy) <= R) this._drawMyShipMarker(ctx, mx, my);
      }
    }

    ctx.restore(); // koniec clipu koła

    // ── Panel wybranego systemu (tylko gdy radar duży) ──
    // Wybrany statek warp → panel rozkazu skoku; inaczej panel polityczny.
    if (isBig && selSys) {
      const selData = systems.find(s => s.id === selSys);
      if (selData) {
        if (this._selectedWarpShipId) this._drawWarpOrderPanel(ctx, dialX, y, dialW, h, selData, vMgr);
        else this._drawStratcomPolitical(ctx, dialX, y, dialW, h, selData, empReg, intel, dipl, colMgr);
      }
    }

    ctx.restore(); // koniec clipu prostokąta

    // ── Odczyt zasięgu + stan „ślepy" (lewy-górny) ────────────
    const obsLvl = window.KOSMOS?.observatorySystem?.getMaxObservatoryLevel?.() ?? 0;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.textAlign = 'left';
    ctx.fillText(t('fleet.stratcomRange', rangeLY.toFixed(0)), dialX + PAD, y + 16);
    if (isBig) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.stratcomObsLevel', obsLvl), dialX + PAD, y + 30);
    }
    if (isBig && !anyBeyondHome) {
      ctx.fillStyle = THEME.warning;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.stratcomBlind'), cx, y + h - 14);
      ctx.textAlign = 'left';
    }

    // ── Legenda (lewy-dolny dla tarczy) — tylko gdy duży ──
    if (isBig) {
      const lx = dialX + PAD;
      let ly = y + h - 56;
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      const items = [
        { color: THEME.yellow,  label: t('fleet.clusterHome') },
        { color: THEME.accent,  label: t('fleet.clusterExplored') },
        { color: THEME.textDim, label: t('fleet.clusterUnexplored') },
      ];
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.beginPath(); ctx.arc(lx + 4, ly + 4, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(it.label, lx + 12, ly + 7);
        ly += 13;
      }
    }

    // ── Tabela statków warp (lewa kolumna, tylko duży radar) ──
    if (isBig && LIST_W > 0) this._drawWarpShipList(ctx, x, y, LIST_W, h, vMgr);

    // Mały radar — całość klikalna jako „rozwiń" (priorytet niski, dodany na końcu).
    if (!isBig) this._hitZones.push({ x, y, w, h, type: 'stratcom_expand', data: { panel: 'radar' } });

    // Ciągły redraw dla animacji iluminacji (także na pauzie gry).
    if (STRATCOM_GLOW && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
  }

  // DEPRECATED (Slice 4): zastąpione przez _drawStratcom (radar). Nie wołane —
  // zakładka Stratcom renderuje radar. Zostawione tymczasowo jako referencja
  // (kandydat do usunięcia po live-gate). _drawClusterInfoPanel nadal używany przez radar.
  _drawStarCluster(ctx, x, y, w, h) {
    const PAD = 10;

    // Tło — solidne czarne (overlay zakrywa 3D mapę układu)
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 1, y, w - 2, h - 1);

    const gd = window.KOSMOS?.galaxyData;
    if (!gd?.systems?.length) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('No galaxy data', x + PAD, y + 20);
      return;
    }

    const systems = gd.systems;
    const ssMgr = window.KOSMOS?.starSystemManager;
    const vMgr  = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;

    // Clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y, w - 2, h - 1);
    ctx.clip();

    // Oblicz skalę — zmieść wszystkie gwiazdy w widoku
    let maxLY = 1;
    for (const s of systems) {
      const d = Math.sqrt(s.x * s.x + s.y * s.y);
      if (d > maxLY) maxLY = d;
    }
    maxLY *= 1.15;

    const cx = x + w / 2 + this._clusterPanX;
    const cy = y + h / 2 + this._clusterPanY;
    const baseR = Math.min(w / 2, h / 2) - 20;
    const scale = (baseR * this._clusterZoom) / maxLY; // px per LY

    // Pomocnicza: LY → px
    const toSx = (lx) => cx + lx * scale;
    const toSy = (ly) => cy + ly * scale;

    // ── Jump gate lines (fioletowe) ──
    const gates = systems.filter(s => s.jumpGate);
    for (const g of gates) {
      // Szukaj sparowanego gate w innym systemie
      const sys = ssMgr?.getSystem(g.id);
      const connTo = sys?.jumpGate?.connectedTo;
      if (connTo) {
        const other = systems.find(s => s.id === connTo);
        if (other) {
          ctx.strokeStyle = 'rgba(170,136,255,0.4)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(toSx(g.x), toSy(g.y));
          ctx.lineTo(toSx(other.x), toSy(other.y));
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    // ── Interstellar transit lines (pomarańczowe) ──
    const interVessels = vMgr?.getInterstellarVessels() ?? [];
    for (const v of interVessels) {
      const m = v.mission;
      if (!m || m.phase !== 'warp_transit') continue;
      const fromS = systems.find(s => s.id === m.fromSystemId);
      const toS   = systems.find(s => s.id === m.toSystemId);
      if (!fromS || !toS) continue;

      // Linia trasy
      ctx.strokeStyle = 'rgba(255,170,50,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(toSx(fromS.x), toSy(fromS.y));
      ctx.lineTo(toSx(toS.x), toSy(toS.y));
      ctx.stroke();
      ctx.setLineDash([]);

      // Punkt pozycji statku
      const vsx = toSx(m.currentGalX ?? fromS.x);
      const vsy = toSy(m.currentGalY ?? fromS.y);
      ctx.fillStyle = THEME.warning;
      ctx.beginPath();
      ctx.arc(vsx, vsy, 3, 0, Math.PI * 2);
      ctx.fill();

      // Etykieta statku
      if (this._clusterZoom > 1.5) {
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(v.name, vsx + 5, vsy - 3);
      }
    }

    // ── Gwiazdy ──
    const selSys = this._selectedClusterSystem;
    for (const s of systems) {
      const sx = toSx(s.x);
      const sy = toSy(s.y);

      // Cull poza widocznością
      if (sx < x - 20 || sx > x + w + 20 || sy < y - 20 || sy > y + h + 20) continue;

      const isHome = !!s.isHome;
      const isExplored = !!s.explored;
      const isSelected = selSys === s.id;
      const isHover = this._clusterHoverSystem === s.id;
      const hasCol = colMgr?.getAllColonies().some(c => {
        const body = EntityManager.get(c.planetId);
        return body?.systemId === s.id;
      }) ?? false;

      // Promień gwiazdy
      let r = isHome ? 6 : isExplored ? 4 : 3;
      if (isSelected || isHover) r += 1;

      // Glow
      if (isHome || isSelected) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
        grad.addColorStop(0, isHome ? 'rgba(255,204,68,0.3)' : 'rgba(170,136,255,0.3)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(sx, sy, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Kolor gwiazdy
      ctx.fillStyle = s.colorHex ?? (isExplored ? THEME.accent : THEME.textDim);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Obwódka selekcji
      if (isSelected) {
        ctx.strokeStyle = THEME.accent;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Ikony infrastruktury
      const sysData = ssMgr?.getSystem(s.id);
      if (hasCol) {
        ctx.font = `8px ${THEME.fontFamily}`;
        ctx.fillText('🏗', sx + r + 2, sy - r);
      }
      if (sysData?.warpBeacon || s.warpBeacon) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('📡', sx + r + 2, sy + 2);
      }
      if (sysData?.jumpGate || s.jumpGate) {
        ctx.font = `7px ${THEME.fontFamily}`;
        ctx.fillText('🌀', sx + r + 2, sy + 10);
      }

      // Nazwa (widoczna przy bliskim zoom lub dla wybranych/home)
      if (this._clusterZoom > 0.8 || isHome || isSelected || isHover) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = isHome ? THEME.yellow : isExplored ? THEME.textPrimary : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(s.name, sx, sy + r + 12);
        ctx.textAlign = 'left';
      }

      // Hit zone
      const hitR = Math.max(r + 4, 10);
      this._hitZones.push({
        x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2,
        type: 'cluster_star', data: { systemId: s.id },
      });
    }

    // ── Panel inline: info o zaznaczonym systemie ──
    if (selSys) {
      const selData = systems.find(s => s.id === selSys);
      if (selData) {
        this._drawClusterInfoPanel(ctx, x, y, w, h, selData, ssMgr, vMgr, colMgr);
      }
    }

    // ── Legenda (lewy-dolny) ──
    {
      const lx = x + PAD;
      let ly = y + h - 60;
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      const items = [
        { color: THEME.yellow, label: t('fleet.clusterHome') },
        { color: THEME.accent, label: t('fleet.clusterExplored') },
        { color: THEME.textDim, label: t('fleet.clusterUnexplored') },
      ];
      for (const it of items) {
        ctx.fillStyle = it.color;
        ctx.beginPath();
        ctx.arc(lx + 4, ly + 4, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(it.label, lx + 12, ly + 7);
        ly += 14;
      }
    }

    ctx.restore();
  }

  // Panel informacyjny o zaznaczonym systemie w star cluster
  _drawClusterInfoPanel(ctx, areaX, areaY, areaW, areaH, sys, ssMgr, vMgr, colMgr) {
    const PAD = 8;
    const panelW = 200;
    const sysReg = ssMgr?.getSystem(sys.id);
    const isExplored = !!sysReg?.explored || !!sys.explored;
    const obsSys = window.KOSMOS?.observatorySystem;
    const layout = this._buildSystemScanLayout(sys, obsSys, isExplored);

    // Wysokość dynamiczna: nagłówek + dane + sekcja skanu + przyciski
    const panelH = 98 + layout.height + (!sys.isHome ? 22 : 0) + (isExplored && sysReg ? 22 : 0);
    const px = areaX + areaW - panelW - 8;
    const py = areaY + 8;

    // Tło panelu
    ctx.fillStyle = 'rgba(8,12,18,0.92)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);

    let iy = py + PAD;

    // Nazwa gwiazdy
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    ctx.fillText(`⭐ ${this._systemDisplayName(sys)}`, px + PAD, iy + 12);
    iy += 20;

    // Typ, masa, odległość
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(t('fleet.clusterSpectral', sys.spectralType ?? '?'), px + PAD, iy + 10);
    iy += 14;
    ctx.fillText(t('fleet.clusterMass', (sys.mass ?? 1).toFixed(2)), px + PAD, iy + 10);
    iy += 14;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.clusterDistance', (sys.distanceLY ?? 0).toFixed(1)), px + PAD, iy + 10);
    iy += 18;

    // Status
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = isExplored ? THEME.success : THEME.textDim;
    ctx.fillText(isExplored ? t('fleet.clusterExplored') : t('fleet.clusterUnexplored'), px + PAD, iy + 10);
    iy += 16;

    // Sekcja skanu układu (wyniki + kontrolka)
    iy = this._drawSystemScanSection(ctx, px, iy, panelW, PAD, sys, layout);

    // Przyciski akcji
    const btnW = panelW - PAD * 2;
    const btnH = 18;

    // Przycisk: Wyślij statek (jeśli tech + statek)
    if (!sys.isHome) {
      const canSend = vMgr && colMgr;
      const activePid = colMgr?.activePlanetId;
      const avail = activePid ? (vMgr?.getAvailable(activePid) ?? []) : [];
      const hasWarpShip = avail.some(v => v.warpFuel?.max > 0);  // S3.0b S1b: realny bak warp

      ctx.fillStyle = hasWarpShip ? 'rgba(0,255,180,0.08)' : 'rgba(60,60,60,0.3)';
      ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = hasWarpShip ? THEME.accent : THEME.border;
      ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = hasWarpShip ? THEME.accent : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSend'), px + PAD + btnW / 2, iy + 13);
      ctx.textAlign = 'left';
      if (hasWarpShip) {
        this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_send', data: { systemId: sys.id } });
      }
      iy += btnH + 4;
    }

    // Przycisk: Przełącz widok (jeśli odwiedzony)
    if (isExplored && sysReg) {
      ctx.fillStyle = 'rgba(0,255,180,0.08)';
      ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = THEME.accent;
      ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSwitch'), px + PAD + btnW / 2, iy + 13);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_switch', data: { systemId: sys.id } });
      iy += btnH + 4;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STRATCOM — układ dwupanelowy: radar (lewo) + mapa galaktyki 2D (prawo).
  // Jeden panel duży (70%), drugi mały (30%); klik małego rozwija go (_stratcomBig).
  // Radar = przegląd polityczny; mapa galaktyki = operacyjna (ciała/skan/wyślij statek).
  // ═══════════════════════════════════════════════════════════════════════════
  _drawStratcomTab(ctx, x, y, w, h) {
    const GAP = 10;
    const bigRadar = this._stratcomBig !== 'galaxy';   // domyślnie radar duży
    const radarW = Math.round((bigRadar ? 0.68 : 0.30) * (w - GAP));
    const galaxyW = w - GAP - radarW;
    const gx = x + radarW + GAP;

    this._drawStratcom(ctx, x, y, radarW, h, bigRadar);

    // Separator pionowy między panelami
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + radarW + GAP / 2, y);
    ctx.lineTo(x + radarW + GAP / 2, y + h);
    ctx.stroke();

    this._drawStratcomGalaxy(ctx, gx, y, galaxyW, h, !bigRadar);
  }

  // Lazy: renderer 3D galaktyki. Dynamic import (NIE statyczny) — three psułoby
  // headless import FleetManagerOverlay (patrz nagłówek pliku). Pierwszy frame
  // zwraca false (import w toku) → płaski 2D; po załadowaniu klasy kolejne frame'y
  // rysują 3D. WebGL fail → _galaxy3DFailed (trwale 2D).
  _ensureGalaxy3D() {
    if (this._galaxy3DFailed) return false;
    if (this._galaxy3D) return true;
    if (this._galaxy3DLoading) return false;
    this._galaxy3DLoading = true;
    import('../renderer/StratcomGalaxyRenderer.js')
      .then(mod => { this._galaxy3D = new mod.StratcomGalaxyRenderer(); this._galaxy3DLoading = false; })
      .catch(e => { console.warn('[FleetOverlay] galaxy3D import failed:', e); this._galaxy3DFailed = true; this._galaxy3DLoading = false; });
    return false;
  }

  // Mapa galaktyki (prawy panel Stratcomu): 3D WebGL gdy DUŻA, płaski 2D gdy mały
  // podgląd. Mgła wojny wspólna z radarem (_stratcomVisibleSystems). isBig → hity
  // gwiazd + panel operacyjny; mały → „rozwiń".
  _drawStratcomGalaxy(ctx, x, y, w, h, isBig) {
    const PAD = 10;
    // Tło — subtelna mgławica galaktyki (deep_space); gdy panel DUŻY, WebGL ją nadpisze
    this._drawPanelBg(ctx, x, y, w, h, 'galaxy');

    const vis = this._stratcomVisibleSystems();
    const home = vis.home;
    if (!home) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.stratcomNoData'), x + PAD, y + 20);
      if (!isBig) this._hitZones.push({ x, y, w, h, type: 'stratcom_expand', data: { panel: 'galaxy' } });
      return;
    }

    const systems = window.KOSMOS?.galaxyData?.systems ?? [];
    const ssMgr  = window.KOSMOS?.starSystemManager;
    const vMgr   = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    const empReg = window.KOSMOS?.empireRegistry;
    const dipl   = window.KOSMOS?.diplomacySystem;

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.textAlign = 'left';
    ctx.fillText(t('fleet.galaxyMapTitle'), x + PAD, y + 14);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 1, y, w - 2, h - 1);
    ctx.clip();

    // ── Projekcja: 3D (WebGL) gdy galaktyka DUŻA, inaczej płaski 2D ──
    const visIds = new Set(vis.list.map(e => e.s.id));
    let use3D = false;
    let projS, projPt;   // projS(systemLike{x,y,z}) / projPt(galaxyX, galaxyY) → {sx,sy}|null

    if (isBig && this._ensureGalaxy3D()) {
      const g3 = this._galaxy3D;
      const hx = home.x ?? 0, hy = home.y ?? 0, hz = home.z ?? 0;   // home → origin sceny
      const m = ctx.getTransform ? ctx.getTransform() : { a: 1, d: 1 };
      const wPx = Math.max(2, Math.round((w - 2) * (Math.abs(m.a) || 1)));
      const hPx = Math.max(2, Math.round((h - 1) * (Math.abs(m.d) || 1)));

      // Gwiazdy 3D z mgły wojny (kolor spektralny + dim wg stanu); współrzędne home-względne
      g3.setSystems(vis.list.map(({ s, known }) => ({
        id: s.id, x: (s.x ?? 0) - hx, y: (s.y ?? 0) - hy, z: (s.z ?? 0) - hz,
        colorHex: s.colorHex, glowColorHex: s.glowColorHex, spectralType: s.spectralType,
        luminosity: s.luminosity ?? 1,
        isHome: !!s.isHome, dim: !known && !s.isHome,
      })));
      const rangeLY = this._getStratcomRangeLY();
      g3.setRangeRings([rangeLY * 0.25, rangeLY * 0.5, rangeLY * 0.75, rangeLY]);

      if (this._galaxyDist == null) this._galaxyDist = g3.fitDist;
      // Galaktyka stoi statycznie — obrót WYŁĄCZNIE ręczny (LPM-drag). Brak auto-spin.
      g3.setCameraOrbit(this._galaxyYaw, this._galaxyPitch, this._galaxyDist);

      if (g3.render(wPx, hPx)) {
        use3D = true;
        try { ctx.drawImage(g3.canvas, x + 1, y, w - 2, h - 1); } catch (_) { /* buffer not ready */ }
        this._galaxyPanelRect = { x, y, w, h };
        projS  = (o)      => { const p = g3.projectXYZ((o.x ?? 0) - hx, (o.z ?? 0) - hz, (o.y ?? 0) - hy, w, h); return p.behind ? null : { sx: x + p.x, sy: y + p.y }; };
        projPt = (gx, gy) => { const p = g3.projectXYZ(gx - hx, 0, gy - hy, w, h);                              return p.behind ? null : { sx: x + p.x, sy: y + p.y }; };
      } else {
        this._galaxy3DFailed = true;   // WebGL padł → trwale 2D
      }
    }

    if (!use3D) {
      // ── Płaski 2D (mały podgląd lub brak/oczekiwanie WebGL) ──
      this._galaxyPanelRect = null;
      let maxD = 1;
      for (const e of vis.list) if (e.d2 > maxD) maxD = e.d2;
      maxD *= 1.2;
      const cx = x + w / 2 + this._clusterPanX;
      const cy = y + h / 2 + this._clusterPanY;
      const baseR = Math.min(w / 2, h / 2) - 24;
      const scale = (baseR * this._clusterZoom) / maxD;
      const toSx = (lx) => cx + ((lx ?? 0) - (home.x ?? 0)) * scale;
      const toSy = (ly) => cy + ((ly ?? 0) - (home.y ?? 0)) * scale;
      projS  = (o)      => ({ sx: toSx(o.x), sy: toSy(o.y) });
      projPt = (gx, gy) => ({ sx: toSx(gx), sy: toSy(gy) });
    }

    // Linie jump-gate (między widocznymi)
    for (const g of systems.filter(s => s.jumpGate && visIds.has(s.id))) {
      const connTo = ssMgr?.getSystem(g.id)?.jumpGate?.connectedTo;
      const other = connTo && visIds.has(connTo) ? systems.find(s => s.id === connTo) : null;
      if (!other) continue;
      const a = projS(g), b = projS(other);
      if (!a || !b) continue;
      ctx.strokeStyle = 'rgba(170,136,255,0.4)'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.setLineDash([]);
    }
    // Linie tranzytu warp — SENSORY: tylko statki w zasięgu obserwatorium (rangeLY). Fog-of-war
    // identyczny jak na radarze: wróg bez intel-kontaktu = ghost „?", contact = solid czerwony.
    // Wybrany statek gracza pomijamy (ma własną trasę + marker rysowane zawsze).
    const sensorRangeLY = vis.rangeLY;
    for (const v of (vMgr?.getInterstellarVessels() ?? [])) {
      if (v.id === this._selectedWarpShipId) continue;
      const m = v.mission; if (!m || m.phase !== 'warp_transit') continue;
      const sx0 = m.currentGalX ?? 0, sy0 = m.currentGalY ?? 0;
      if (Math.hypot(sx0 - (home.x ?? 0), sy0 - (home.y ?? 0)) > sensorRangeLY) continue;
      const mode = this._stratcomWarpBlipMode(v);   // 'self' | 'contact' | 'rumor'
      const vp = projPt(m.currentGalX ?? sx0, m.currentGalY ?? sy0);
      if (mode === 'rumor') {
        // Pośredni kontakt — ghost bez linii trasy.
        if (vp) this._drawStratcomGhostBlip(ctx, vp.sx, vp.sy);
        continue;
      }
      const fromS = systems.find(s => s.id === m.fromSystemId);
      const toS   = systems.find(s => s.id === m.toSystemId);
      if (fromS && toS) {
        const a = projS(fromS), b = projS(toS);
        if (a && b) {
          ctx.strokeStyle = mode === 'contact' ? 'rgba(255,68,102,0.35)' : 'rgba(255,170,50,0.3)';
          ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      if (vp) {
        ctx.fillStyle = mode === 'contact' ? '#ff4466' : THEME.warning;
        ctx.beginPath(); ctx.arc(vp.sx, vp.sy, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Trasa wybranego statku warp (CAŁA, do celu) — bieżący skok + pozostałe (2 kolory).
    {
      const selMv = this._selectedWarpShipId ? vMgr?.getVessel?.(this._selectedWarpShipId) : null;
      if (selMv?.warpRoute) this._drawWarpRouteLine(ctx, selMv.warpRoute, (s) => projS(s));
    }

    // Gwiazdy (widoczne) — w 3D ciało rysuje WebGL pod spodem; tu chrome 2D
    const selSys = this._selectedClusterSystem;
    for (const { s, known, nameKnown } of vis.list) {
      const pp = projS(s); if (!pp) continue;
      const sx = pp.sx, sy = pp.sy;
      if (sx < x - 20 || sx > x + w + 20 || sy < y - 20 || sy > y + h + 20) continue;
      const isHome = !!s.isHome;
      const isSelected = selSys === s.id;
      const isHover = this._clusterHoverSystem === s.id;
      const empKnown = vis.isEmpKnown(s);
      let r = isHome ? 6 : (known ? 4 : 3); if (isSelected || isHover) r += 1;
      const dim = !known && !isHome;   // w zasięgu, ale niezbadana → „widmowa"
      if (!use3D) {
        // 2D: ciało gwiazdy rysujemy tu (w 3D rysuje je WebGL)
        if (isHome || isSelected) {
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 4);
          grad.addColorStop(0, isHome ? 'rgba(255,204,68,0.18)' : 'rgba(0,255,180,0.18)'); grad.addColorStop(1, 'transparent');
          ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(sx, sy, r * 4, 0, Math.PI * 2); ctx.fill();
        }
        // „Małe słońce" w realnym kolorze typu gwiazdy (stan = nakładki niżej)
        this._drawStarGlyph(ctx, sx, sy, r, s, dim);
      }
      if (empKnown) {
        const host = dipl?.getHostility?.(s.empireId) ?? 0;
        ctx.strokeStyle = host <= 30 ? (THEME.success ?? '#44cc66') : host <= 70 ? (THEME.warning ?? '#ffcc44') : (THEME.danger ?? '#ff4466');
        ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r + 3, 0, Math.PI * 2); ctx.stroke();
      }
      if (isSelected) { ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy, r + 5, 0, Math.PI * 2); ctx.stroke(); }
      if (known) {
        const sysData = ssMgr?.getSystem(s.id);
        const hasCol = colMgr?.getAllColonies?.().some(c => EntityManager.get(c.planetId)?.systemId === s.id) ?? false;
        if (hasCol)                              { ctx.font = `8px ${THEME.fontFamily}`; ctx.fillText('🏗', sx + r + 2, sy - r); }
        if (sysData?.warpBeacon || s.warpBeacon) { ctx.font = `7px ${THEME.fontFamily}`; ctx.fillText('📡', sx + r + 2, sy + 2); }
        if (sysData?.jumpGate   || s.jumpGate)   { ctx.font = `7px ${THEME.fontFamily}`; ctx.fillText('🌀', sx + r + 2, sy + 10); }
      }
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`; ctx.textAlign = 'center';
      if (nameKnown) { ctx.fillStyle = isHome ? THEME.yellow : THEME.textPrimary; ctx.fillText(s.name, sx, sy + r + 12); }
      else if (isHover || isSelected) { ctx.fillStyle = THEME.textDim; ctx.fillText('???', sx, sy + r + 12); }
      ctx.textAlign = 'left';
      if (isBig) {
        const hitR = Math.max(r + 5, 11);
        this._hitZones.push({ x: sx - hitR, y: sy - hitR, w: hitR * 2, h: hitR * 2, type: 'cluster_star', data: { systemId: s.id } });
      }
    }

    // Marker „mój statek" — wybrany statek warp (projekcja 3D/2D galaktyki).
    if (this._selectedWarpShipId) {
      const mv = vMgr?.getVessel?.(this._selectedWarpShipId);
      if (mv) {
        let p = null;
        if (mv.position?.state === 'in_transit' && mv.mission?.type === 'interstellar_jump') {
          p = projPt(mv.mission.currentGalX ?? mv.mission.fromGalX ?? 0, mv.mission.currentGalY ?? mv.mission.fromGalY ?? 0);
        } else {
          const msys = systems.find(s => s.id === (mv.systemId ?? 'sys_home'));
          p = msys ? projS(msys) : null;
        }
        if (p) this._drawMyShipMarker(ctx, p.sx, p.sy);
      }
    }

    // Panel operacyjny / rozkaz warp (duży + selekcja)
    if (isBig && selSys) {
      const selData = systems.find(s => s.id === selSys);
      if (selData) {
        if (this._selectedWarpShipId) this._drawWarpOrderPanel(ctx, x, y, w, h, selData, vMgr);
        else this._drawStratcomOps(ctx, x, y, w, h, selData, ssMgr, vMgr, colMgr);
      }
    }

    ctx.restore();

    if (!isBig) this._hitZones.push({ x, y, w, h, type: 'stratcom_expand', data: { panel: 'galaxy' } });
  }

  // Panel POLITYCZNY (radar): imperium / relacja / populacja / życie — jeśli znane.
  _drawStratcomPolitical(ctx, areaX, areaY, areaW, areaH, sys, empReg, intel, dipl, colMgr) {
    const PAD = 8;
    const panelW = Math.min(216, Math.max(150, areaW - 16));
    const px = areaX + areaW - panelW - 8;
    const py = areaY + 8;

    const empId = sys.empireId;
    const empKnown = !!(empId && (intel ? intel.isAtLeast(empId, 'rumor') : false));
    const explored = !!sys.explored;
    const known = !!sys.isHome || explored || empKnown;

    // Populacja + życie (tylko gdy znane)
    let pop = null, life = null;
    if (known) {
      const cols = colMgr?.getAllColonies?.().filter(c => EntityManager.get(c.planetId)?.systemId === sys.id) ?? [];
      if (cols.length) pop = cols.reduce((a, c) => a + (c.civSystem?.population ?? 0), 0);
      const planets = EntityManager.getByTypeInSystem?.('planet', sys.id) ?? [];
      if (planets.length) life = planets.some(p => (p.lifeScore ?? 0) > 0 || (p.lifeStage && p.lifeStage !== 'none' && p.lifeStage !== 'sterile'));
    }

    const panelH = 132;
    ctx.fillStyle = 'rgba(8,12,18,0.92)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);

    let iy = py + PAD;
    ctx.textAlign = 'left';
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    ctx.fillText(`⭐ ${this._systemDisplayName(sys)}`, px + PAD, iy + 12); iy += 20;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    // Imperium
    if (empKnown) {
      const emp = empReg?.get(empId);
      ctx.fillStyle = ARCHETYPES[emp?.archetype]?.color ?? THEME.textPrimary;
      ctx.fillText(t('fleet.stratcomEmpire', emp?.name ?? '?'), px + PAD, iy + 10); iy += 14;
      const host = dipl?.getHostility?.(empId) ?? 0;
      ctx.fillStyle = host <= 30 ? THEME.success : host <= 70 ? THEME.warning : THEME.danger;
      ctx.fillText(t('fleet.stratcomHostility', Math.round(host)), px + PAD, iy + 10); iy += 14;
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.stratcomEmpireUnknown'), px + PAD, iy + 10); iy += 14;
    }
    // Populacja
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(pop != null ? t('fleet.stratcomPopulation', pop) : t('fleet.stratcomPopUnknown'), px + PAD, iy + 10); iy += 14;
    // Życie
    ctx.fillStyle = life === true ? THEME.success : THEME.textSecondary;
    ctx.fillText(life == null ? t('fleet.stratcomLifeUnknown') : life ? t('fleet.stratcomLifeYes') : t('fleet.stratcomLifeNo'), px + PAD, iy + 10); iy += 14;
    // Status
    ctx.fillStyle = explored ? THEME.success : THEME.textDim;
    ctx.fillText(explored ? t('fleet.clusterExplored') : t('fleet.clusterUnexplored'), px + PAD, iy + 10);
  }

  // Panel OPERACYJNY (mapa galaktyki): skan układu (liczby ciał) + wyślij statek + przełącz widok.
  _drawStratcomOps(ctx, areaX, areaY, areaW, areaH, sys, ssMgr, vMgr, colMgr) {
    const PAD = 8;
    const panelW = Math.min(216, Math.max(160, areaW - 16));
    const px = areaX + areaW - panelW - 8;
    const py = areaY + 8;
    const sysReg = ssMgr?.getSystem(sys.id);
    const explored = !!sysReg?.explored || !!sys.explored;
    const obsSys = window.KOSMOS?.observatorySystem;
    const layout = this._buildSystemScanLayout(sys, obsSys, explored);

    const panelH = 50 + layout.height + (!sys.isHome ? 22 : 0) + (explored && sysReg ? 22 : 0);
    ctx.fillStyle = 'rgba(8,12,18,0.92)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);

    let iy = py + PAD;
    ctx.textAlign = 'left';
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    ctx.fillText(`⭐ ${this._systemDisplayName(sys)}`, px + PAD, iy + 12); iy += 20;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = explored ? THEME.success : THEME.textDim;
    ctx.fillText(explored ? t('fleet.clusterExplored') : t('fleet.clusterUnexplored'), px + PAD, iy + 10); iy += 16;

    // Sekcja skanu układu (wyniki + kontrolka)
    iy = this._drawSystemScanSection(ctx, px, iy, panelW, PAD, sys, layout);

    // Przyciski akcji
    const btnW = panelW - PAD * 2, btnH = 18;
    // Wyślij statek
    if (!sys.isHome) {
      const activePid = colMgr?.activePlanetId;
      const avail = activePid ? (vMgr?.getAvailable?.(activePid) ?? []) : [];
      const hasWarpShip = avail.some(v => v.warpFuel?.max > 0);
      ctx.fillStyle = hasWarpShip ? 'rgba(0,255,180,0.08)' : 'rgba(60,60,60,0.3)';
      ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = hasWarpShip ? THEME.accent : THEME.border; ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = hasWarpShip ? THEME.accent : THEME.textDim; ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSend'), px + PAD + btnW / 2, iy + 13); ctx.textAlign = 'left';
      if (hasWarpShip) this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_send', data: { systemId: sys.id } });
      iy += btnH + 4;
    }
    // Przełącz widok (gdy odwiedzony)
    if (explored && sysReg) {
      ctx.fillStyle = 'rgba(0,255,180,0.08)'; ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = THEME.accent; ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent; ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterSwitch'), px + PAD + btnW / 2, iy + 13); ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'cluster_switch', data: { systemId: sys.id } });
    }
  }

  // Nazwa układu do wyświetlenia — ujawniona po zbadaniu LUB skanie STRATCOM; inaczej „???".
  _systemDisplayName(sys) {
    if (!sys) return '???';
    if (sys.isHome || sys.explored) return sys.name ?? '???';
    const scanned = !!window.KOSMOS?.observatorySystem?.getSystemScanResult?.(sys.id);
    return scanned ? (sys.name ?? '???') : '???';
  }

  // ── Skan układu STRATCOM (wspólne dla panelu galaktyki i radaru) ──────────
  // Buduje opis sekcji: wiersze wyników (liczby ciał wg osiągniętego tieru) + stan
  // kontrolki (locked/scanning/scan/rescan/full/null) + wysokość w pikselach.
  _buildSystemScanLayout(sys, obsSys, explored) {
    const LINE = 13, BTN = 18, GAP = 4;
    const layout = { resultLines: [], control: null, pct: 0, height: 0 };
    if (!obsSys || sys?.isHome) return layout;   // home znany — nie skanujemy

    let result   = obsSys.getSystemScanResult?.(sys.id) ?? null;
    const scan   = obsSys.getSystemScanProgress?.(sys.id) ?? null;
    const maxTier = obsSys.getMaxSystemScanTier?.() ?? 0;

    // Odwiedzony układ → pełna wiedza o liczbie ciał (z EntityManager), bez potrzeby skanu.
    if (!result && explored) {
      const planets = EntityManager.getByTypeInSystem('planet', sys.id);
      if (planets.length) {
        const c = {
          planets:    planets.length,
          moons:      EntityManager.getByTypeInSystem('moon', sys.id).length,
          planetoids: EntityManager.getByTypeInSystem('planetoid', sys.id).length,
          asteroids:  EntityManager.getByTypeInSystem('asteroid', sys.id).length,
          comets:     EntityManager.getByTypeInSystem('comet', sys.id).length,
        };
        c.total = c.planets + c.moons + c.planetoids + c.asteroids + c.comets;
        result = { tier: 3, counts: c };
      }
    }

    // Wiersze wyników wg osiągniętego tieru
    if (result?.counts) {
      const c = result.counts;
      layout.resultLines.push({ label: t('fleet.scanPlanets'), value: c.planets });
      if (result.tier >= 2) layout.resultLines.push({ label: t('fleet.scanMoons'), value: c.moons });
      if (result.tier >= 3) {
        layout.resultLines.push({ label: t('fleet.scanPlanetoids'), value: c.planetoids });
        layout.resultLines.push({ label: t('fleet.scanAsteroids'),  value: c.asteroids });
        layout.resultLines.push({ label: t('fleet.scanComets'),     value: c.comets });
        layout.resultLines.push({ label: t('fleet.scanTotal'),      value: c.total, strong: true });
      }
    }

    // Kontrolka
    if (scan) {
      layout.control = 'scanning';
      layout.pct = scan.pct;
    } else if (explored) {
      layout.control = null;                      // odwiedzony — „Przełącz widok" wystarcza
    } else if (maxTier <= 0) {
      layout.control = 'locked';                  // wymaga obserwatorium Lv2+
    } else if (!result || result.tier < maxTier) {
      layout.control = result ? 'rescan' : 'scan';
    } else {
      layout.control = 'full';                    // wiemy maksimum dla tego poziomu
    }

    // Wysokość
    let h = 0;
    if (layout.resultLines.length) h += layout.resultLines.length * LINE + 2;
    if (layout.control === 'scanning')  h += LINE + 8 + BTN + GAP;   // etykieta + pasek + anuluj
    else if (layout.control === 'full') h += LINE;
    else if (layout.control)            h += BTN + GAP;              // locked/scan/rescan
    layout.height = h;
    return layout;
  }

  // Rysuj sekcję skanu układu od pozycji iy; zwraca nowe iy. Pcha hit-zony skanu/anulowania.
  _drawSystemScanSection(ctx, px, iy, panelW, PAD, sys, layout) {
    const btnW = panelW - PAD * 2, btnH = 18;

    // Wiersze wyników (etykieta z lewej, liczba z prawej)
    for (const r of layout.resultLines) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.fillStyle = r.strong ? THEME.textHeader : THEME.textSecondary;
      ctx.fillText(r.label, px + PAD, iy + 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = r.strong ? THEME.accent : THEME.textPrimary;
      ctx.fillText(String(r.value), px + panelW - PAD, iy + 9);
      ctx.textAlign = 'left';
      iy += 13;
    }
    if (layout.resultLines.length) iy += 2;

    if (layout.control === 'scanning') {
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info ?? THEME.accent;
      ctx.fillText(t('fleet.scanProgress', Math.round(layout.pct * 100)), px + PAD, iy + 9);
      iy += 13;
      ctx.fillStyle = THEME.bgSecondary; ctx.fillRect(px + PAD, iy, btnW, 5);
      ctx.fillStyle = THEME.accent;      ctx.fillRect(px + PAD, iy, btnW * layout.pct, 5);
      iy += 8;
      ctx.strokeStyle = THEME.border; ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'center';
      ctx.fillText(t('fleet.scanCancel'), px + PAD + btnW / 2, iy + 13); ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'stratcom_scan_cancel', data: { systemId: sys.id } });
      iy += btnH + 4;
    } else if (layout.control === 'locked') {
      ctx.fillStyle = 'rgba(60,60,60,0.3)'; ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = THEME.border; ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
      ctx.fillText(t('fleet.scanLocked'), px + PAD + btnW / 2, iy + 13); ctx.textAlign = 'left';
      iy += btnH + 4;
    } else if (layout.control === 'scan' || layout.control === 'rescan') {
      ctx.fillStyle = 'rgba(0,204,255,0.10)'; ctx.fillRect(px + PAD, iy, btnW, btnH);
      ctx.strokeStyle = THEME.info ?? THEME.accent; ctx.strokeRect(px + PAD, iy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.info ?? THEME.accent; ctx.textAlign = 'center';
      ctx.fillText(t(layout.control === 'rescan' ? 'fleet.scanMore' : 'fleet.opsScan'), px + PAD + btnW / 2, iy + 13); ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: iy, w: btnW, h: btnH, type: 'stratcom_scan', data: { systemId: sys.id } });
      iy += btnH + 4;
    } else if (layout.control === 'full') {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left'; ctx.fillStyle = THEME.success;
      ctx.fillText(t('fleet.scanComplete'), px + PAD, iy + 9);
      iy += 13;
    }
    return iy;
  }

  // ── Warp multi-hop UI ──────────────────────────────────────────────────────

  // Marker „mój statek" — wybrany statek warp. Pulsujący pierścień + trójkąt
  // (odróżnialny od pomarańczowej kropki tranzytu warp innych statków).
  _drawMyShipMarker(ctx, sx, sy) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    const pulse = 0.5 + 0.5 * Math.sin(t0 / 600 * Math.PI);
    ctx.save();
    ctx.strokeStyle = THEME.accent;
    ctx.globalAlpha = 0.35 + 0.45 * pulse;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(sx, sy, 8 + pulse * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = THEME.accent;
    ctx.strokeStyle = '#06121a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6);
    ctx.lineTo(sx - 5, sy + 5);
    ctx.lineTo(sx + 5, sy + 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // Rysuje CAŁĄ pozostałą trasę warp (od bieżącego odcinka do celu). Bieżący skok
  // w jednym kolorze (cyan), pozostałe w drugim (fioletowy). projSysPt(systemObj)
  // → {sx,sy}|null (radar: toSx/toSy; galaktyka: projS).
  _drawWarpRouteLine(ctx, route, projSysPt) {
    if (!route || !Array.isArray(route.hops) || route.hops.length < 2) return;
    const systems = window.KOSMOS?.galaxyData?.systems ?? [];
    const li = route.legIndex || 0;
    const ptOf = (id) => { const s = systems.find(x => x.id === id); return s ? projSysPt(s) : null; };
    ctx.save();
    for (let i = li; i < route.hops.length - 1; i++) {
      const a = ptOf(route.hops[i]);
      const b = ptOf(route.hops[i + 1]);
      if (!a || !b) continue;
      const isCurrent = (i === li);
      ctx.setLineDash(isCurrent ? [7, 4] : [4, 5]);
      ctx.lineWidth = isCurrent ? 2.5 : 1.8;
      ctx.strokeStyle = isCurrent ? '#00e0ff' : '#b884ff';   // bieżący skok cyan / pozostałe fioletowe
      ctx.globalAlpha = isCurrent ? 0.95 : 0.7;
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      // Węzeł pośredni (cel etapowy) — mała kropka.
      if (i < route.hops.length - 2) {
        ctx.setLineDash([]); ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#b884ff';
        ctx.beginPath(); ctx.arc(b.sx, b.sy, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Etykieta statusu wiersza statku warp (nieaktywny → powód z canOrder).
  _warpStatusLabel(reason) {
    switch (reason) {
      case 'in_transit':  return t('fleet.warpStatusInTransit');
      case 'immobilized': return t('fleet.warpStatusImmobilized');
      case 'docked':
      case 'orbiting':    return t('fleet.warpStatusIdle');
      default:            return t('fleet.warpStatusBusy');
    }
  }

  // Lewa tabela statków warp (kolumna radaru). Pokazuje WSZYSTKIE statki gracza
  // z napędem warp; nieaktywne wyszarzone ze statusem. Selekcja dowolnego (także
  // w tranzycie) — by pokazać marker; rozkaz gated osobno w panelu rozkazu.
  _drawWarpShipList(ctx, lx, ly, lw, h, vMgr) {
    const PAD = 8;
    ctx.fillStyle = 'rgba(6,12,18,0.55)';
    ctx.fillRect(lx, ly, lw, h);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx + lw - 0.5, ly); ctx.lineTo(lx + lw - 0.5, ly + h); ctx.stroke();

    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader; ctx.textAlign = 'left';
    ctx.fillText(t('fleet.warpShipsTitle'), lx + PAD, ly + 16);

    const all = (vMgr?.getAllVessels?.() ?? []).filter(v => !isEnemyVessel(v) && !v.isWreck && v.warpFuel?.max > 0);
    const wrs = window.KOSMOS?.warpRouteSystem;
    const canAct = (v) => wrs?.canOrder ? wrs.canOrder(v).ok : (v.position?.state === 'docked' || v.position?.state === 'orbiting');
    all.sort((a, b) => {
      const aa = canAct(a) ? 0 : 1, bb = canAct(b) ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
    });

    if (all.length === 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.warpNoShips'), lx + PAD, ly + 38);
      return;
    }

    const rowH = 34;
    let ry = ly + 26;
    const maxY = ly + h - 6;
    for (const v of all) {
      if (ry + rowH > maxY) break;   // MVP: limit widocznych (scroll = follow-up)
      const act = canAct(v);
      const selected = v.id === this._selectedWarpShipId;

      ctx.fillStyle = selected ? 'rgba(0,255,180,0.12)' : (act ? 'rgba(0,255,180,0.05)' : 'rgba(60,60,60,0.12)');
      ctx.fillRect(lx + 4, ry, lw - 8, rowH - 4);
      ctx.strokeStyle = selected ? THEME.accent : (act ? THEME.border : 'rgba(120,120,120,0.3)');
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.strokeRect(lx + 4, ry, lw - 8, rowH - 4);

      const def = SHIPS[v.shipId] ?? HULLS[v.shipId];
      const icon = def?.icon ?? '🚀';
      const nm = (v.name ?? v.id);
      const nmShort = nm.length > 16 ? nm.slice(0, 15) + '…' : nm;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = act ? THEME.textPrimary : THEME.textDim;
      ctx.textAlign = 'left';
      ctx.fillText(`${icon} ${nmShort}`, lx + PAD, ry + 13);

      const wr = warpRange(v);
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillStyle = act ? THEME.textSecondary : THEME.textDim;
      const statusLabel = act
        ? `${wr > 0 ? wr.toFixed(1) : '?'} ly`
        : this._warpStatusLabel(wrs?.canOrder ? wrs.canOrder(v).reason : v.position?.state);
      ctx.fillText(statusLabel, lx + PAD, ry + 26);

      const warpPct = v.warpFuel?.max > 0 ? Math.max(0, Math.min(1, v.warpFuel.current / v.warpFuel.max)) : 0;
      const barW = 44, barH = 5, barX = lx + lw - PAD - barW, barY = ry + 20;
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = act ? THEME.accent : THEME.textDim; ctx.fillRect(barX, barY, barW * warpPct, barH);

      this._hitZones.push({ x: lx + 4, y: ry, w: lw - 8, h: rowH - 4, type: 'warp_ship_select', data: { vesselId: v.id } });
      ry += rowH;
    }
  }

  // Etykieta błędu w panelu rozkazu (priorytet: bramka statku > powód trasy).
  _warpErrLabel(plan, gate) {
    if (!gate.ok) {
      switch (gate.reason) {
        case 'in_transit':       return t('fleet.warpErrInTransit');
        case 'immobilized':      return t('fleet.warpErrImmobilized');
        case 'not_warp_capable': return t('fleet.warpErrConfig');
        default:                 return t('fleet.warpErrState');
      }
    }
    switch (plan.reason) {
      case WARP_ROUTE_REASONS.SAME_SYSTEM:       return t('fleet.warpErrSame');
      case WARP_ROUTE_REASONS.NO_ROUTE:          return t('fleet.warpErrNoRoute');
      case WARP_ROUTE_REASONS.INSUFFICIENT_FUEL: return t('fleet.warpErrFuel');
      case WARP_ROUTE_REASONS.BAD_CONFIG:
      case WARP_ROUTE_REASONS.UNKNOWN_SYSTEM:    return t('fleet.warpErrConfig');
      default:                                   return t('fleet.warpErrNoRoute');
    }
  }

  // Panel potwierdzenia rozkazu skoku warp (gdy wybrany statek warp + system).
  // Liczy trasę co frame (planWarpRoute — tanio dla ~kilkudziesięciu układów).
  _drawWarpOrderPanel(ctx, areaX, areaY, areaW, areaH, sys, vMgr) {
    const v = vMgr?.getVessel?.(this._selectedWarpShipId);
    if (!v) return;
    const PAD = 8;
    const panelW = Math.min(220, Math.max(170, areaW - 16));
    const px = areaX + areaW - panelW - 8;
    const py = areaY + 8;

    const wrs = window.KOSMOS?.warpRouteSystem;
    const gate = wrs?.canOrder ? wrs.canOrder(v) : { ok: true };
    const wf = v.warpFuel;
    // Zasięg jednego skoku = min(twardy limit napędu, zasięg z baku) — spójne z beginJourney.
    const tankRange = (wf?.max > 0 && wf?.consumption > 0) ? wf.max / wf.consumption : 0;
    const maxHopLY = Math.min(GAME_CONFIG.WARP_MAX_JUMP_LY ?? 10, tankRange);
    const def = SHIPS[v.shipId] ?? HULLS[v.shipId];
    const stats = (Array.isArray(v.modules) && v.modules.length > 0) ? calcShipStats(def, v.modules) : null;
    const warpSpeed = stats?.warpSpeedLY || def?.warpSpeedLY || 2.5;
    const systems = window.KOSMOS?.galaxyData?.systems ?? [];
    const plan = planWarpRoute(systems, v.systemId ?? 'sys_home', sys.id, {
      maxHopLY, currentFuel: wf?.current ?? 0, consumption: wf?.consumption ?? 0, warpSpeed,
    });

    const hasPlanInfo = plan.ok || plan.reason === WARP_ROUTE_REASONS.INSUFFICIENT_FUEL;
    const feasible = plan.ok && gate.ok;

    const infoLines = hasPlanInfo ? (plan.etaYears != null ? 4 : 3) : 0;
    const panelH = PAD + 18 + 16 + (infoLines * 14) + 18 + 22 + PAD;
    ctx.fillStyle = 'rgba(8,12,18,0.94)';
    ctx.fillRect(px, py, panelW, panelH);
    ctx.strokeStyle = feasible ? THEME.accent : THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(px, py, panelW, panelH);
    // Tło-absorber kliknięć (przed przyciskami — reverse-find da priorytet przyciskom).
    this._hitZones.push({ x: px, y: py, w: panelW, h: panelH, type: 'warp_order_bg', data: {} });

    let iy = py + PAD;
    ctx.textAlign = 'left';
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('fleet.warpOrderTitle'), px + PAD, iy + 11); iy += 18;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = sys.colorHex ?? THEME.textPrimary;
    const vn = (v.name ?? v.id);
    const vnS = vn.length > 12 ? vn.slice(0, 11) + '…' : vn;
    ctx.fillText(`${vnS} → ${sys.name}`, px + PAD, iy + 10); iy += 16;

    if (hasPlanInfo) {
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(t('fleet.warpHops', String(plan.hops.length - 1)), px + PAD, iy + 10); iy += 14;
      ctx.fillText(t('fleet.warpTotalLY', plan.totalLY.toFixed(1)), px + PAD, iy + 10); iy += 14;
      ctx.fillText(t('fleet.warpFuelNeed', plan.totalFuel.toFixed(1), (wf?.current ?? 0).toFixed(1)), px + PAD, iy + 10); iy += 14;
      if (plan.etaYears != null) { ctx.fillText(t('fleet.warpEta', plan.etaYears.toFixed(1)), px + PAD, iy + 10); iy += 14; }
    }

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    if (feasible) { ctx.fillStyle = THEME.success; ctx.fillText(t('fleet.warpFeasible'), px + PAD, iy + 10); }
    else { ctx.fillStyle = THEME.danger; ctx.fillText(this._warpErrLabel(plan, gate), px + PAD, iy + 10); }
    iy += 18;

    const btnW = (panelW - PAD * 3) / 2;
    const btnH = 22;
    const sendX = px + PAD, cancelX = px + PAD * 2 + btnW;
    ctx.fillStyle = feasible ? 'rgba(0,255,180,0.12)' : 'rgba(60,60,60,0.25)';
    ctx.fillRect(sendX, iy, btnW, btnH);
    ctx.strokeStyle = feasible ? THEME.accent : THEME.border; ctx.strokeRect(sendX, iy, btnW, btnH);
    ctx.fillStyle = feasible ? THEME.accent : THEME.textDim; ctx.textAlign = 'center';
    ctx.fillText(t('fleet.warpSend'), sendX + btnW / 2, iy + 15);
    ctx.fillStyle = 'rgba(255,51,68,0.10)'; ctx.fillRect(cancelX, iy, btnW, btnH);
    ctx.strokeStyle = THEME.danger; ctx.strokeRect(cancelX, iy, btnW, btnH);
    ctx.fillStyle = THEME.danger; ctx.fillText(t('fleet.warpCancel'), cancelX + btnW / 2, iy + 15);
    ctx.textAlign = 'left';

    // Hity przycisków NA KOŃCU (priorytet nad tłem-absorberem).
    if (feasible) this._hitZones.push({ x: sendX, y: iy, w: btnW, h: btnH, type: 'warp_order_send', data: { vesselId: v.id, systemId: sys.id } });
    this._hitZones.push({ x: cancelX, y: iy, w: btnW, h: btnH, type: 'warp_order_cancel', data: {} });
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

  _bodyDistFromStar(body) {
    const bx = (body.x ?? 0) / GAME_CONFIG.AU_TO_PX;
    const by = (body.y ?? 0) / GAME_CONFIG.AU_TO_PX;
    return Math.sqrt(bx * bx + by * by);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RIGHT — szczegóły statku + akcje + konfigurator
  // ══════════════════════════════════════════════════════════════════════════

  // Panel wrogiego statku — brak akcji, ograniczone info
  // (imperium name, typ kadłuba, pozycja / odległość, stan). Intel poza zakresem MVP.
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
    const stateTxt = vessel.position?.state === 'docked'   ? 'W hangarze'
                   : vessel.position?.state === 'orbiting' ? 'Na orbicie'
                   : 'W locie';
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

  _drawRight(ctx, x, y, w, h, vMgr, ms, colMgr, activePid) {
    const pad = 8;
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

    // Tryb ship picker — wybór statku do wysyłki międzygwiezdnej
    if (this._pendingSendSystemId) {
      this._drawShipPicker(ctx, x, y, w, h, vMgr, colMgr, activePid);
      return;
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

    // Typ statku
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(ship ? getName(ship, 'ship') : vessel.shipId, x + pad + 24, cy + 32);

    cy += 44;

    // ── Ship specs panel ─────────────────────────────────────
    if (ship) {
      cy = this._drawShipSpecs(ctx, x, cy, w, pad, ship, vessel);
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 8;

    // ── Stats grid (2×2) ─────────────────────────────────────
    const gridW = (w - pad * 2) / 2;
    const gridH = 30;
    const stats = [
      { label: t('fleet.labelStatus'), value: this._statusText(vessel), color: (STATUS_COLORS[vessel.position.state] ?? (() => THEME.textSecondary))() },
      { label: t('fleet.labelSpeed'),  value: `${((vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1)).toFixed(1)} AU/r`, color: THEME.textPrimary },
      { label: t('fleet.labelBase'),   value: this._baseText(vessel), color: THEME.textPrimary },
      { label: t('fleet.labelExperience'), value: this._xpStars(vessel), color: THEME.yellow },
    ];
    for (let i = 0; i < stats.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const sx = x + pad + col * gridW;
      const sy = cy + row * gridH;

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(stats[i].label, sx, sy + 10);

      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = stats[i].color;
      ctx.fillText(stats[i].value, sx, sy + 24);
    }
    cy += gridH * 2 + 4;

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
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.maintenance'), x + pad, cy + 10);
      ctx.fillStyle = immobilized ? THEME.danger : THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(`-${t('fleet.upkeepPerYear', upkeep)}`, x + w - pad, cy + 10);
      ctx.textAlign = 'left';
      cy += 18;
      if (immobilized) {
        ctx.fillStyle = THEME.danger;
        ctx.fillText(`⚠ ${t('fleet.immobilized')}`, x + pad, cy + 10);
        cy += 16;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.unpaidYears', vessel.unpaidYears ?? 0), x + pad, cy + 10);
        cy += 16;
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

      // Lista planet w nowym układzie — redirect
      const planets = EntityManager.getByType('planet')?.filter(p => p.systemId === isMission.toSystemId) ?? [];
      if (planets.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.systemPlanets'), x + pad, cy + 10);
        cy += 16;

        for (const planet of planets.slice(0, 6)) {
          const pBtnW = w - pad * 2;
          const pBtnH = 20;
          if (cy + pBtnH > y + h - 40) break; // nie wychodź poza panel

          ctx.fillStyle = 'rgba(170,136,255,0.06)';
          ctx.fillRect(x + pad, cy, pBtnW, pBtnH);
          ctx.strokeStyle = THEME.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + pad, cy, pBtnW, pBtnH);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`🪐 ${planet.name ?? planet.id}`, x + pad + 6, cy + 14);

          // Odległość od gwiazdy
          ctx.textAlign = 'right';
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${(planet.orbital?.a ?? 0).toFixed(1)} AU`, x + w - pad - 4, cy + 14);
          ctx.textAlign = 'left';

          this._hitZones.push({
            x: x + pad, y: cy, w: pBtnW, h: pBtnH,
            type: 'interstellar_redirect', data: { vesselId: vessel.id, targetId: planet.id },
          });
          cy += pBtnH + 2;
        }
      }

      // Przycisk: Powrót do bazy
      cy += 4;
      const retBtnW = w - pad * 2;
      const retBtnH = 22;
      ctx.fillStyle = 'rgba(255,51,68,0.08)';
      ctx.fillRect(x + pad, cy, retBtnW, retBtnH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, retBtnW, retBtnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.clusterReturn'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({
        x: x + pad, y: cy, w: retBtnW, h: retBtnH,
        type: 'interstellar_return', data: { vesselId: vessel.id, fromSystemId: isMission.fromSystemId },
      });
      cy += retBtnH + 8;
    }

    // ── Panel orbiting_body — rozkazy kontekstowe w obcym układzie ──
    if (isMission?.type === 'exploration' && isMission.phase === 'orbiting_body') {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 8;

      // Nagłówek — na orbicie ciała
      const orbitBody = _findBody(isMission.targetId);
      const orbitName = orbitBody ? getName(orbitBody) : isMission.targetId;
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
        const isExplored = orbitBody?.explored ?? false;
        ctx.fillStyle = isExplored ? 'rgba(100,100,100,0.08)' : 'rgba(0,180,255,0.08)';
        ctx.fillRect(x + pad, cy, btnW, btnH);
        ctx.strokeStyle = isExplored ? THEME.textDim : THEME.info;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + pad, cy, btnW, btnH);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = isExplored ? THEME.textDim : THEME.info;
        ctx.textAlign = 'center';
        ctx.fillText(t('fleet.foreignReconBody'), x + w / 2, cy + 15);
        ctx.textAlign = 'left';
        if (!isExplored) {
          this._hitZones.push({ x: x + pad, y: cy, w: btnW, h: btnH,
            type: 'foreign_recon_body', data: { vesselId: vessel.id, targetId: isMission.targetId } });
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
        const isColonized = colMgr4?.getColony(isMission.targetId) != null;
        const validType = orbitBody && (
          ['rocky', 'ice'].includes(orbitBody.planetType) || orbitBody.type === 'planetoid'
        );
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
            type: 'foreign_colonize', data: { vesselId: vessel.id, targetId: isMission.targetId } });
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
          type: 'foreign_unload', data: { vesselId: vessel.id, targetId: isMission.targetId } });
        cy += btnH + 4;
      }

      // ── Separator ──
      cy += 2;

      // ── Leć do innego ciała (lista planet) ──
      const sysId = vessel.systemId;
      const planetsOrbit = EntityManager.getByType('planet')?.filter(p => p.systemId === sysId && p.id !== isMission.targetId) ?? [];
      if (planetsOrbit.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(t('fleet.foreignRedirect'), x + pad, cy + 10);
        cy += 16;

        for (const planet of planetsOrbit.slice(0, 6)) {
          const pBtnH2 = 20;
          if (cy + pBtnH2 > y + h - 40) break;
          ctx.fillStyle = 'rgba(170,136,255,0.06)';
          ctx.fillRect(x + pad, cy, btnW, pBtnH2);
          ctx.strokeStyle = THEME.border;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + pad, cy, btnW, pBtnH2);
          ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`🪐 ${getName(planet)}`, x + pad + 6, cy + 14);
          ctx.textAlign = 'right';
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${(planet.orbital?.a ?? 0).toFixed(1)} AU`, x + w - pad - 4, cy + 14);
          ctx.textAlign = 'left';
          this._hitZones.push({
            x: x + pad, y: cy, w: btnW, h: pBtnH2,
            type: 'foreign_redirect', data: { vesselId: vessel.id, targetId: planet.id },
          });
          cy += pBtnH2 + 2;
        }
      }

      // ── Powrót do bazy ──
      cy += 4;
      ctx.fillStyle = 'rgba(255,51,68,0.08)';
      ctx.fillRect(x + pad, cy, btnW, btnH);
      ctx.strokeStyle = THEME.danger;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + pad, cy, btnW, btnH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText(t('fleet.foreignReturn'), x + w / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({
        x: x + pad, y: cy, w: btnW, h: btnH,
        type: 'foreign_return', data: { vesselId: vessel.id, fromSystemId: isMission.originId },
      });
      cy += btnH + 8;
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

      // Powrót do macierzystego układu (skok warp)
      const homeCol = window.KOSMOS?.colonyManager?.getColony(vessel.colonyId);
      const fromSysId = vessel.systemId;
      if (fromSysId && fromSysId !== (homeCol?.systemId ?? 'sys_home')) {
        ctx.fillStyle = THEME.danger;
        ctx.fillRect(x + pad, cy, abortBtnW, btnH);
        ctx.fillStyle = '#fff';
        ctx.fillText('🏠 ' + t('fleet.returnHomeSystem'), x + pad + 8, cy + btnH / 2 + 4);
        this._hitZones.push({
          x: x + pad, y: cy, w: abortBtnW, h: btnH,
          type: 'foreign_return_from_recon',
          data: { vesselId: vessel.id, fromSystemId: homeCol?.systemId ?? 'sys_home' },
        });
        cy += btnH + 4;
      }
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
      // Wysokość liczona z UNSCROLLED cy (cy zawiera offset -_scrollY).
      this._drawMissionConfig(ctx, x, cy, w, h - (cy + _scrollY - y), pad, vessel, ms, colMgr);
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

  _drawShipPicker(ctx, x, y, w, h, vMgr, colMgr, activePid) {
    const PAD = 8;
    let cy = y + PAD;

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`🚀 ${t('fleet.selectShipToSend')}`, x + PAD, cy + 12);
    cy += 22;

    // Info o celu
    const galaxyData = window.KOSMOS?.galaxyData;
    const targetStar = galaxyData?.systems?.find(s => s.id === this._pendingSendSystemId);
    if (targetStar) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`→ ${targetStar.name}  (${targetStar.distanceLY} LY)`, x + PAD, cy + 10);
      cy += 18;
    }

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 8;

    // Pobierz dostępne statki warp
    const allVessels = vMgr?.getAllVessels() ?? [];
    const warpShips = allVessels.filter(v => {
      if (v.position.state !== 'docked') return false;
      if (v.status !== 'idle' && v.status !== 'refueling') return false;
      return v.warpFuel?.max > 0;  // S3.0b S1b: realny bak warp, nie martwy def.fuelPerLY
    });

    if (warpShips.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.noWarpShipsAvailable'), x + PAD, cy + 10);
      cy += 20;
    } else {
      // Lista statków — klikalne
      const btnW = w - PAD * 2;
      const btnH = 36;
      for (const v of warpShips) {
        if (cy + btnH > y + h - 40) break;

        const shipDef = SHIPS[v.shipId] ?? HULLS[v.shipId];
        // S3.0b S1b: zasięg skoku z realnego baku warp (warpRange), nie z martwego shipDef.fuelPerLY.
        const wr = warpRange(v);
        const rangeLY = wr > 0 ? wr.toFixed(1) : '?';
        const fuelPct = v.fuel.max > 0 ? v.fuel.current / v.fuel.max : 0;          // in-system (Q1=Oba)
        const warpPct = v.warpFuel?.max > 0 ? v.warpFuel.current / v.warpFuel.max : 0;

        // Sprawdź czy starczy paliwa
        let hasFuel = true;
        if (targetStar) {
          const fromStar = galaxyData.systems.find(s => s.id === (v.systemId ?? 'sys_home'));
          if (fromStar) {
            const dx = targetStar.x - fromStar.x;
            const dy = targetStar.y - fromStar.y;
            const dz = (targetStar.z ?? 0) - (fromStar.z ?? 0);
            const distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);
            hasFuel = canJump(v, distLY);  // S3.0b S1b: feasibility z baku warp (warpFuel)
          }
        }

        // Tło
        ctx.fillStyle = hasFuel ? 'rgba(0,255,180,0.06)' : 'rgba(60,60,60,0.15)';
        ctx.fillRect(x + PAD, cy, btnW, btnH);
        ctx.strokeStyle = hasFuel ? THEME.accent : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, btnW, btnH);

        // Ikona + nazwa
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasFuel ? THEME.textPrimary : THEME.textDim;
        const icon = shipDef?.icon ?? '🚀';
        const name = v.name.length > 14 ? v.name.slice(0, 13) + '…' : v.name;
        ctx.fillText(`${icon} ${name}`, x + PAD + 4, cy + 14);

        // Zasięg + paliwo
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasFuel ? THEME.textSecondary : THEME.textDim;
        ctx.fillText(`⛽ ${rangeLY} LY  (${t('shipPicker.fuel')} ${(fuelPct * 100).toFixed(0)}% · ${t('shipPicker.warp')} ${(warpPct * 100).toFixed(0)}%)`, x + PAD + 4, cy + 28);

        if (!hasFuel) {
          ctx.fillStyle = THEME.danger;
          ctx.textAlign = 'right';
          ctx.fillText(t('fleet.fuelInsufficient'), x + w - PAD - 4, cy + 14);
          ctx.textAlign = 'left';
        }

        if (hasFuel) {
          this._hitZones.push({
            x: x + PAD, y: cy, w: btnW, h: btnH,
            type: 'cluster_send_pick',
            data: { vesselId: v.id, systemId: this._pendingSendSystemId },
          });
        }

        cy += btnH + 4;
      }
    }

    // Przycisk Anuluj
    cy += 4;
    const cancelW = w - PAD * 2;
    const cancelH = 22;
    ctx.fillStyle = 'rgba(255,51,68,0.08)';
    ctx.fillRect(x + PAD, cy, cancelW, cancelH);
    ctx.strokeStyle = THEME.danger;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + PAD, cy, cancelW, cancelH);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.danger;
    ctx.textAlign = 'center';
    ctx.fillText(t('fleet.cancelSend'), x + w / 2, cy + 15);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: x + PAD, y: cy, w: cancelW, h: cancelH, type: 'cluster_send_cancel', data: {} });
  }

  // ── Specyfikacja statku (panel prawy) ──────────────────────────────────────

  _drawShipSpecs(ctx, x, cy, w, pad, ship, vessel) {
    const specFont = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const valFont  = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const lineH = 14;
    const labelX = x + pad;
    const valX   = x + pad + 58;
    const maxW   = w - pad * 2;

    // Opis statku (wrapped, dimmed)
    if (ship.description) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      const descLines = this._wrapTextWidth(ctx, ship.description, maxW);
      for (const line of descLines) {
        ctx.fillText(line, labelX, cy + 10);
        cy += lineH;
      }
      cy += 4;
    }

    // Generacja
    const genLabels = ['', 'I', 'II', 'III', 'IV', 'V'];
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipGeneration'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`Gen ${genLabels[ship.generation] ?? ship.generation}`, valX, cy + 10);
    cy += lineH;

    // Typ paliwa
    const fuelComm = COMMODITIES[ship.fuelType];
    const fuelName = fuelComm ? (COMMODITY_SHORT[ship.fuelType] ?? fuelComm.namePL ?? ship.fuelType) : ship.fuelType;
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipFuelType'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(fuelName, valX, cy + 10);
    cy += lineH;

    // Prędkość (z vessel jeśli dostępna, fallback na ship)
    const vesselSpeed = vessel?.speedAU ?? ship.speedAU ?? ship.baseSpeedAU ?? 1.0;
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.designSpeed'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${vesselSpeed.toFixed(1)} AU/y`, valX, cy + 10);
    cy += lineH;

    // Zasięg (z vessel jeśli dostępna)
    const vesselFuelPerAU = vessel?.fuel?.consumption ?? ship.fuelPerAU ?? 0.5;
    const vesselFuelCap = vessel?.fuel?.max ?? ship.fuelCapacity ?? 10;
    const range = vesselFuelPerAU > 0 ? vesselFuelCap / vesselFuelPerAU : (ship.range ?? 20);
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipRange'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    let rangeText = `${range.toFixed(1)} AU`;
    if (vessel?.warpFuel?.max > 0) {
      // S3.0b S1b: zasięg skoku z realnego baku warp (warpRange), nie z martwego ship.fuelPerLY.
      rangeText += ` / ${warpRange(vessel).toFixed(1)} LY`;
    }
    ctx.fillText(rangeText, valX, cy + 10);
    cy += lineH;

    // Masa
    const totalMass = vessel?.totalMass ?? ship.baseMass ?? 0;
    if (totalMass > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.designMass'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${totalMass} t`, valX, cy + 10);
      cy += lineH;
    }

    // Ładownia (jeśli > 0)
    const cargoCapacity = vessel?.cargoMax ?? ship.cargoCapacity ?? 0;
    if (cargoCapacity > 0) {
      ctx.font = specFont;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('fleet.shipCargo'), labelX, cy + 10);
      ctx.font = valFont;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${cargoCapacity} t`, valX, cy + 10);
      cy += lineH;
    }

    // Załoga
    ctx.font = specFont;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('fleet.shipCrew'), labelX, cy + 10);
    ctx.font = valFont;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${ship.crewCost} POP`, valX, cy + 10);
    cy += lineH;

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

  // ── Zakładka STOCZNIA: budowa statków (góra) + edytor projektów (dół) ───────
  // Jeden wspólny pionowy scroll (_shipyardScrollY). Edytor rysowany przez
  // UnitDesignOverlay._drawShipDesigner; jego hity trafiają do wspólnej _hitZones
  // i są delegowane w _handleHit (DESIGN_EDITOR_HIT_TYPES).
  _drawShipyardTab(ctx, x, y, w, h, colMgr, activePid) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    const BIG = 100000;                  // duża „wysokość" → sekcje renderują pełną treść (clip+scroll obcina)
    const top = y - this._shipyardScrollY;

    // 1) Sekcja budowy statków — zwraca dolną krawędź
    let cy = this._drawShipyard(ctx, x, top, w, BIG, colMgr, activePid);

    // 2) Separator + nagłówek edytora projektów
    cy += 12;
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 8, cy); ctx.lineTo(x + w - 8, cy); ctx.stroke();
    cy += 8;

    // 3) Osadzony edytor projektów (część „projektowanie statków")
    const editor = this._getDesignEditor();
    let bottom = cy;
    if (editor) {
      editor._scrollLeft = 0;            // wspólny scroll obsługuje _shipyardScrollY
      const savedHits = editor._hitZones;
      editor._hitZones = this._hitZones; // hity edytora do wspólnej tablicy
      bottom = editor._drawShipDesigner(ctx, x, cy, w, BIG) ?? cy;
      editor._hitZones = savedHits;
    }

    ctx.restore();

    // 4) Clamp wspólnego scrolla wg łącznej wysokości treści
    const contentH = bottom - top;
    this._shipyardContentH = contentH;
    this._shipyardViewH = h;
    const maxScroll = Math.max(0, contentH - h);
    if (this._shipyardScrollY > maxScroll) this._shipyardScrollY = maxScroll;
    if (this._shipyardScrollY < 0) this._shipyardScrollY = 0;

    // 5) Tooltipy budowy — PO odcięciu clipa (z-order najwyższy, realne bounds)
    if (this._hoverShipId || this._hoverPendingOrder) {
      const activeCol = colMgr?.getColony(activePid);
      const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};
      const queues = colMgr?.getShipQueues(activePid) ?? [];
      let shipyardLevel = 0;
      if (activeCol?.buildingSystem) {
        for (const [, e] of activeCol.buildingSystem._active) {
          if (e.building?.id === 'shipyard') shipyardLevel += e.level ?? 1;
        }
      }
      const canBuildAny = queues.length < shipyardLevel;
      if (this._hoverShipId) this._drawShipCostTooltip(ctx, x, y, w, h, this._hoverShipId, inv, canBuildAny, activeCol);
      if (this._hoverPendingOrder) this._drawPendingOrderTooltip(ctx, x, y, w, h, this._hoverPendingOrder, inv);
    }
  }

  // ── Stocznia — sekcja budowy statków (zwraca dolną krawędź cy) ─────────────

  _drawShipyard(ctx, x, y, w, h, colMgr, activePid) {
    const PAD = 10;
    const LH = 16;
    let cy = y + 12;

    const tSys = window.KOSMOS?.techSystem;
    const activeCol = colMgr?.getColony(activePid);

    // Nagłówek
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('fleet.shipyardAnchor'), x + PAD, cy + 10);
    cy += LH + 8;

    // Sprawdź warunki wstępne. UWAGA: zwracamy cy (nie void) — host (_drawShipyardTab)
    // rysuje poniżej edytor projektów, więc nawet bez stoczni/techu sekcja budowy
    // kończy się czytelnym komunikatem i oddaje dolną krawędź.
    const hasExploration = tSys?.isResearched('exploration') ?? false;
    if (!hasExploration) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('fleet.shipyardRequiresTech'), x + PAD, cy + 8);
      cy += LH + 8;
      return cy;
    }

    // Oblicz poziom stoczni
    let shipyardLevel = 0;
    if (activeCol?.buildingSystem) {
      for (const [, e] of activeCol.buildingSystem._active) {
        if (e.building?.id === 'shipyard') shipyardLevel += e.level ?? 1;
      }
    }

    if (shipyardLevel === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('fleet.shipyardNoBuild'), x + PAD, cy + 8);
      cy += LH + 8;
      return cy;
    }

    // Status stoczni — sloty
    const queues = colMgr?.getShipQueues(activePid) ?? [];
    const usedSlots = queues.length || 1;
    const speedBonus = Math.max(1, Math.floor(shipyardLevel / usedSlots));
    const bonusStr = speedBonus > 1 ? ` ×${speedBonus}⚡` : '';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.success;
    ctx.fillText(t('fleet.shipyardSlotsShort', `${queues.length}/${shipyardLevel}`) + bonusStr, x + PAD, cy + 8);
    cy += LH;

    // Aktywne budowy — paski progresu + Surge
    if (queues.length > 0) {
      for (let qi = 0; qi < queues.length; qi++) {
        const q = queues[qi];
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[q.shipId] ?? HULLS[q.shipId];
        const frac = q.buildTime > 0 ? Math.min(1, q.progress / q.buildTime) : 0;
        const eta = q.buildTime > 0 ? ((q.buildTime - q.progress) / speedBonus).toFixed(1) : '?';

        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : q.shipId}`, x + PAD, cy + 8);

        // Pasek progresu
        const barX = x + PAD;
        const barY = cy + 13;
        const barW = w - PAD * 2 - 50;
        const barH = 6;
        ctx.fillStyle = THEME.bgTertiary;
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
        ctx.strokeStyle = THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);

        // Procent + ETA
        ctx.fillStyle = THEME.textSecondary;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(frac * 100)}%`, x + w - PAD, cy + 8);
        ctx.textAlign = 'left';

        cy += LH + 8;

        // ── Przycisk Surge ⚡ ──────────────────────────────────
        const maxSurge = shipDef?.maxSurge ?? 1;
        const surgeCount = q.surgeCount ?? 0;
        const surgeMaxed = surgeCount >= maxSurge;

        const freePop = activeCol?.civSystem?.freePops ?? 0;
        const kr = activeCol?.credits ?? 0;
        const canSurge = !surgeMaxed
          && freePop >= 0.5
          && kr >= 500;

        const surgeLabel = surgeMaxed
          ? t('fleet.surgeMax')
          : `⚡ Surge [${surgeCount}/${maxSurge}] — 0.5 POP + 500 Kr`;
        const surgeBtnW = w - PAD * 2;
        const surgeBtnH = 18;

        ctx.fillStyle = canSurge ? 'rgba(255,180,40,0.15)' : 'rgba(40,40,50,0.3)';
        ctx.fillRect(x + PAD, cy, surgeBtnW, surgeBtnH);
        ctx.strokeStyle = canSurge ? THEME.warning : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, surgeBtnW, surgeBtnH);

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = canSurge ? THEME.warning : THEME.textDim;
        ctx.textAlign = 'center';
        ctx.fillText(surgeLabel, x + PAD + surgeBtnW / 2, cy + 13);
        ctx.textAlign = 'left';

        if (canSurge) {
          this._hitZones.push({
            x: x + PAD, y: cy, w: surgeBtnW, h: surgeBtnH,
            type: 'surge_ship', data: { planetId: activePid, queueIndex: qi },
          });
        }

        cy += surgeBtnH + 4;
      }
    }

    // Separator
    cy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
    cy += 10;

    const canBuildAny = queues.length < shipyardLevel;
    const inv = activeCol?.resourceSystem?.inventorySnapshot() ?? {};

    // ── Lista szablonów z Unit Design ──────────────────────────────────────
    const templates = window.KOSMOS?.unitDesigns ?? [];

    if (templates.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('unitDesign.noDesigns'), x + PAD, cy + 8);
      cy += LH + 8;
    } else {
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText(t('unitDesign.savedTemplates'), x + PAD, cy + 8);
      cy += LH + 4;

      for (const tpl of templates) {
        if (cy > y + h - 80) break;
        const hull = HULLS[tpl.hullId];
        if (!hull) continue;

        const hasTech = !hull.requires || (tSys?.isResearched(hull.requires) ?? false);
        const canBuildFacility = canBuildHullAt(tpl.hullId, 'ground');   // S3.4d — kolonia = stocznia naziemna (tylko small)

        const mods = (tpl.modules ?? []).filter(Boolean);
        const stats = calcShipStats(hull, mods);
        const { cost: rawC, commodityCost: comC } = calcShipCost(hull, mods);
        const allCosts = { ...rawC, ...comC };
        const allAfford = Object.entries(allCosts).every(([k, need]) => (inv[k] ?? 0) >= need);
        const crewCost = hull.crewCost ?? 0;
        const hasCrew = crewCost <= 0 || (activeCol?.civSystem?.freePops ?? 0) >= crewCost;

        const canBuildNow = hasTech && canBuildFacility && canBuildAny && allAfford && hasCrew;
        const canQueue = hasTech && canBuildFacility && hasCrew && !allAfford;
        const canClick = canBuildNow || canQueue;

        // Powód blokady (gdy nie da się kliknąć) — priorytet: brak techu kadłuba →
        // brak wolnych POPów (załoga) → stocznia zajęta. Pokazywany inline jako 3.
        // linia, bo wcześniej wyszarzony wiersz milczał (brak hit-zone, brak tooltipa)
        // i gracz nie wiedział CZEGO brakuje.
        let blockReason = null;
        let blockColor = THEME.warning;
        if (!hasTech) {
          const techName = TECHS[hull.requires] ? getName(TECHS[hull.requires], 'tech') : hull.requires;
          blockReason = `🔒 ${t('fleet.requiresTech', techName)}`;
          blockColor = THEME.textDim;
        } else if (!canBuildFacility) {
          // S3.4d — kadłub medium+/wojenny nie zbuduje się w stoczni naziemnej (kolonia). Wymaga stacji.
          blockReason = `🛰 ${t('fleet.requiresOrbitalShipyard')}`;
          blockColor = THEME.textDim;
        } else if (!hasCrew) {
          blockReason = `👥 ${t('fleet.noCrewPops', crewCost)}`;
        } else if (!canClick) {
          // hasCrew && allAfford, więc jedyne co zostało to brak wolnego slotu stoczni
          blockReason = `⏳ ${t('fleet.shipyardFull', queues.length, shipyardLevel)}`;
        }

        const btnH = blockReason ? 54 : 42;
        const bx = x + PAD, bw = w - PAD * 2;

        // Tło
        ctx.fillStyle = canClick ? 'rgba(20,40,60,0.8)' : 'rgba(20,20,30,0.5)';
        ctx.fillRect(bx, cy, bw, btnH);
        ctx.strokeStyle = canBuildNow ? THEME.borderActive : canQueue ? THEME.warning : THEME.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, cy, bw, btnH);

        // Ikona kadłuba + nazwa szablonu
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = canClick ? THEME.accent : THEME.textDim;
        ctx.fillText(`${hull.icon} ${tpl.name}`, bx + 6, cy + 14);

        // Szybkie staty
        ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`⚡${stats.speed.toFixed(1)} AU/y  📦${stats.cargo}t  🎯${Math.round(stats.range)} AU  ⚖${stats.totalMass}t`, bx + 6, cy + 28);

        // 3. linia — powód blokady (czytelny komunikat zamiast cichego wyszarzenia)
        if (blockReason) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          ctx.fillStyle = blockColor;
          ctx.fillText(blockReason, bx + 6, cy + 44);
        }

        // Przycisk BUDUJ / KOLEJKA / blokada
        const buildLabel = canBuildNow ? '🚀' : canQueue ? '⏳' : (!hasTech ? '🔒' : !canBuildFacility ? '🛰' : '—');
        const buildBtnW = 28;
        const buildBtnX = bx + bw - buildBtnW - 4;
        ctx.fillStyle = canBuildNow ? THEME.accent : canQueue ? THEME.warning : THEME.textDim;
        ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.fillText(buildLabel, buildBtnX + buildBtnW / 2, cy + 22);
        ctx.textAlign = 'left';

        if (canClick) {
          this._hitZones.push({ x: bx, y: cy, w: bw, h: btnH,
            type: 'build_template', data: { templateId: tpl.id, hullId: tpl.hullId, modules: mods, enabled: true } });
        }

        cy += btnH + 4;
      }
    }

    // Oczekujące zamówienia (pending ship orders)
    const pendingOrders = activeCol?.pendingShipOrders ?? [];
    if (pendingOrders.length > 0) {
      cy += 4;
      ctx.strokeStyle = THEME.border;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
      cy += 10;

      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(`⏳ ${t('fleet.pendingOrders')} (${pendingOrders.length})`, x + PAD, cy + 8);
      cy += LH + 2;

      for (const order of pendingOrders) {
        if (cy > y + h - 30) break;
        const shipDef = SHIPS[order.shipId] ?? HULLS[order.shipId];
        const rowH = 34;

        // Brakujące zasoby — lista z ikonami i ilościami
        const missingItems = [];
        for (const [k, need] of Object.entries(order.cost)) {
          const have = inv[k] ?? 0;
          if (have < need) {
            const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
            const shortName = COMMODITY_SHORT[k] ?? k;
            missingItems.push({ icon, name: shortName, have: Math.floor(have), need });
          }
        }

        // Tło
        ctx.fillStyle = 'rgba(60,40,5,0.5)';
        ctx.fillRect(x + PAD, cy, w - PAD * 2, rowH);
        ctx.strokeStyle = 'rgba(255,180,0,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + PAD, cy, w - PAD * 2, rowH);

        // Nazwa statku
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.warning;
        ctx.fillText(`${shipDef?.icon ?? '🚀'} ${shipDef ? getName(shipDef, 'ship') : order.shipId}`, x + PAD + 4, cy + 12);

        // Brakujące zasoby — czytelna lista pod nazwą
        if (missingItems.length > 0) {
          ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
          const parts = missingItems.slice(0, 4).map(m => `${m.icon}${m.have}/${m.need}`);
          ctx.fillStyle = '#ff8844';
          ctx.fillText(parts.join('  '), x + PAD + 4, cy + 26);
        }

        // Przycisk anulowania (×)
        const cancelX = x + w - PAD - 22;
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = '#ff6666';
        ctx.fillText('×', cancelX + 6, cy + 15);
        this._hitZones.push({
          x: cancelX, y: cy, w: 22, h: rowH,
          type: 'cancel_pending_ship', data: { planetId: activePid, orderId: order.id },
        });

        // Hit zone dla tooltipu (cały wiersz)
        this._hitZones.push({
          x: x + PAD, y: cy, w: w - PAD * 2 - 24, h: rowH,
          type: 'pending_ship_hover', data: { order },
        });

        cy += rowH + 2;
      }
    }

    // Sekcja budowy zakończona — zwróć dolną krawędź (host dorysuje edytor projektów
    // poniżej). Tooltipy budowy rysuje _drawShipyardTab PO odcięciu clipa (z-order).
    return cy;
  }

  // ── Tooltip kosztów budowy statku ───────────────────────────────────────────

  _drawShipCostTooltip(ctx, panelX, panelY, panelW, panelH, shipId, inv, slotsOk, activeCol) {
    const ship = SHIPS[shipId] ?? HULLS[shipId];
    if (!ship) return;

    // Znajdź pozycję hovered buttona
    const btnZone = this._hitZones.find(z => z.type === 'build_ship' && z.data.shipId === shipId);
    if (!btnZone) return;

    const PAD = 8;
    const LH = 14;

    // Zbierz linie kosztów
    const lines = [];
    // Surowce
    if (ship.cost) {
      for (const [k, v] of Object.entries(ship.cost)) {
        const have = Math.floor(inv[k] ?? 0);
        const ok = have >= v;
        const icon = RESOURCE_ICONS[k] ?? k;
        lines.push({ text: `${icon} ${k}: ${have}/${v}`, ok });
      }
    }
    // Commodities
    if (ship.commodityCost) {
      for (const [k, v] of Object.entries(ship.commodityCost)) {
        const have = Math.floor(inv[k] ?? 0);
        const ok = have >= v;
        const comDef = COMMODITIES[k];
        const icon = comDef?.icon ?? '📦';
        const name = COMMODITY_SHORT[k] ?? k;
        lines.push({ text: `${icon} ${name}: ${have}/${v}`, ok });
      }
    }
    // Czas budowy
    lines.push({ text: t('fleet.buildTimeLabel', ship.buildTime), ok: true, dim: true });
    // Załoga (POPy)
    const crewCost = ship.crewCost ?? 0;
    if (crewCost > 0) {
      const freePops = activeCol?.civSystem?.freePops ?? 0;
      const ok = freePops >= crewCost;
      lines.push({ text: t('fleet.crewLabel', freePops.toFixed(2), crewCost), ok });
    }
    // Sloty
    if (!slotsOk) {
      lines.push({ text: t('fleet.noFreeSlots'), ok: false });
    }

    // Wymiary tooltipa
    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    // Pozycja: po lewej od panelu (lub wewnątrz jeśli nie mieści się)
    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    let tipY = btnZone.y;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    // Tło
    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    // Nagłówek
    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(`${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    // Linie kosztów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.dim ? THEME.textSecondary : (line.ok ? THEME.success : THEME.danger);
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  // ── Tooltip pending ship order — pełna lista kosztów ─────────────────────
  _drawPendingOrderTooltip(ctx, panelX, panelY, panelW, panelH, order, inv) {
    const ship = SHIPS[order.shipId] ?? HULLS[order.shipId];
    if (!ship) return;

    const PAD = 8;
    const LH = 14;

    // Zbierz linie kosztów
    const lines = [];
    for (const [k, need] of Object.entries(order.cost)) {
      const have = Math.floor(inv[k] ?? 0);
      const ok = have >= need;
      const icon = RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? '';
      const name = COMMODITY_SHORT[k] ?? k;
      lines.push({ text: `${icon} ${name}: ${have}/${need}`, ok });
    }
    if (order.crewCost > 0) {
      const freePops = window.KOSMOS?.civSystem?.freePops ?? 0;
      lines.push({ text: `👤 ${freePops.toFixed(1)}/${order.crewCost} POP`, ok: freePops >= order.crewCost });
    }

    // Wymiary
    const tipW = 200;
    const tipH = 22 + lines.length * LH + 8;

    // Pozycja: po lewej od panelu
    let tipX = panelX - tipW - 6;
    if (tipX < 4) tipX = panelX + 4;
    // Znajdź pozycję Y z hit zone
    const zone = this._hitZones.find(z => z.type === 'pending_ship_hover' && z.data.order?.id === order.id);
    let tipY = zone ? zone.y : panelY + 100;
    if (tipY + tipH > panelY + panelH) tipY = panelY + panelH - tipH - 4;

    // Tło
    ctx.fillStyle = 'rgba(6,12,20,0.96)';
    ctx.fillRect(tipX, tipY, tipW, tipH);
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    ctx.strokeRect(tipX, tipY, tipW, tipH);

    // Nagłówek
    let ty = tipY + 6;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.warning;
    ctx.fillText(`⏳ ${ship.icon} ${getName(ship, 'ship')}`, tipX + PAD, ty + 10);
    ty += 18;

    // Linie kosztów
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const line of lines) {
      ctx.fillStyle = line.ok ? THEME.success : THEME.danger;
      ctx.fillText(line.text, tipX + PAD, ty + 8);
      ty += LH;
    }
  }

  _statusText(vessel) {
    // B2 (F4 live-gate): pasażer czekający na wolny habitat ma PIERWSZEŃSTWO nad etykietami paliwa —
    // inaczej auto-tankowanie przy stacji (depot bez power_cells) fałszywie pokazuje „Czeka na paliwo".
    if (vessel._awaitingHousing) return t('fleet.statusTextAwaitingHousing');
    if (vessel.position.state === 'docked') {
      if (vessel.status === 'idle') return t('fleet.statusTextHangar');
      // Fix C: rozróżnij "czeka na paliwo" (brak fuel w kolonii) od aktywnego tankowania.
      if (vessel._awaitingFuel) return t('fleet.statusTextAwaitingFuel');
      return t('fleet.statusTextRefueling');
    }
    if (vessel.position.state === 'orbiting') {
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
      return t('fleet.statusTextOrbiting');
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
    const order = vessel?.movementOrder;
    if (!order || order.status === 'cancelled' || order.status === 'completed') return cy;

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

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = color;
    ctx.fillText(label, x + pad, cy + 10);
    return cy + 18;
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

    return cy;
  }

  // ── Konfigurator misji ────────────────────────────────────────────────────

  _drawMissionConfig(ctx, x, cy, w, maxH, pad, vessel, ms, colMgr) {
    const config = this._missionConfig;
    const action = FLEET_ACTIONS[config.actionId];
    if (!action) return;

    if (config.step === 'select') {
      this._drawTargetPicker(ctx, x, cy, w, maxH, pad, vessel, action, ms);
    } else if (config.step === 'confirm') {
      this._drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action);
    }
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

    // Lista celów
    const targets = this._getValidTargets(vessel, this._missionConfig.actionId);
    const rowH = 24;
    const listH = maxH - 50; // Zostaw miejsce na ANULUJ

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, cy, w, listH);
    ctx.clip();

    let ry = cy - this._targetScrollOffset;
    for (const tgt of targets) {
      if (ry + rowH < cy) { ry += rowH; continue; }
      if (ry > cy + listH) break;

      // Ikona + nazwa + odległość
      const icon = tgt.type === 'planet' ? '🌍' : tgt.type === 'moon' ? '🌙' : tgt.type === 'planetoid' ? '🪨' : tgt.type === 'station' ? '🛰' : '☄';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = tgt.reachable ? THEME.textPrimary : THEME.textDim;
      ctx.fillText(`${icon} ${(tgt.name ?? '?').slice(0, 10)}`, x + pad, ry + 16);

      // Odległość
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${tgt.distAU.toFixed(1)} AU`, x + w - pad - 60, ry + 16);

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
      else { badge = t('fleet.badgeExplored'); badgeColor = THEME.textDim; }

      ctx.fillStyle = badgeColor;
      ctx.fillText(badge, x + w - pad, ry + 16);
      ctx.textAlign = 'left';

      if (tgt.reachable) {
        this._hitZones.push({
          x, y: Math.max(ry, cy), w, h: rowH,
          type: 'select_target',
          data: { targetId: tgt.id },
        });
      }

      // Separator
      ctx.strokeStyle = 'rgba(0,255,180,0.07)';
      ctx.beginPath(); ctx.moveTo(x + pad, ry + rowH - 1); ctx.lineTo(x + w - pad, ry + rowH - 1); ctx.stroke();

      ry += rowH;
    }

    // Ograniczenie scroll
    const maxScroll = Math.max(0, targets.length * rowH - listH);
    if (this._targetScrollOffset > maxScroll) this._targetScrollOffset = maxScroll;

    ctx.restore();

    // Przycisk ANULUJ
    const cancelY = cy + listH + 4;
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
  }

  _drawMissionConfirm(ctx, x, cy, w, maxH, pad, vessel, action) {
    const targetId = this._missionConfig.targetId;
    // S3.3b-S3b — cel może być STACJĄ (HUB); _findBody nie zna 'station' → fallback na EntityManager.
    const target = _findBody(targetId) ?? EntityManager.get(targetId);
    if (!target) { this._missionConfig = null; return; }

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

    // Tabela: odległość, czas lotu, paliwo
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const distAU = this._calcDistAU(vessel, target);
    const effectiveSpeed = (vessel.speedAU ?? ship?.speedAU ?? 1) * (window.KOSMOS?.techSystem?.getShipSpeedMultiplier() ?? 1);
    const travelYears = effectiveSpeed > 0 ? distAU / effectiveSpeed : Infinity;
    const fuelCost = distAU * (vessel.fuel.consumption ?? 0);

    const tableData = [
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

    // ETA (duże)
    const gameYear = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    const eta = gameYear + travelYears;
    ctx.font = `bold ${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'center';
    ctx.fillText(t('fleet.etaYearLabel', Math.ceil(eta)), x + w / 2, cy + 22);
    ctx.textAlign = 'left';
    cy += 34;

    // Checkbox "Powtarzaj" — dla transportu ze statkami z ładownią.
    // vessel.cargoMax (z modułów) lub ship.cargoCapacity (legacy SHIPS) — nowoczesne
    // statki projektowane z modułów mają pojemność tylko na vessel.cargoMax.
    const config = this._missionConfig;
    const hasCargoCap = (vessel.cargoMax ?? 0) > 0 || (ship?.cargoCapacity ?? 0) > 0;
    if (config.actionId === 'transport' && vessel && hasCargoCap) {
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
    const insufficientFuel = (vessel.fuel?.current ?? 0) < fuelCost;
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

    // Zbierz ciała aktywnego układu
    const activeSysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const bodies = [
      ...EntityManager.getByTypeInSystem('planet', activeSysId),
      ...EntityManager.getByTypeInSystem('moon', activeSysId),
      ...EntityManager.getByTypeInSystem('planetoid', activeSysId),
      ...EntityManager.getByTypeInSystem('asteroid', activeSysId),
      ...EntityManager.getByTypeInSystem('comet', activeSysId),
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

      // Transport (cargo/pasażer) — tylko ciała z kolonią/outpostem (POP dostarczany do kolonii).
      if (actionId === 'transport' || actionId === 'transport_passenger') {
        if (!colMgr?.hasColony(body.id)) continue;
        // S3.4c Z3 — wyklucz cel tożsamy ze ŹRÓDŁEM (kolonia→ta sama kolonia = self-transfer cargo /
        // self-POP bez sensu). Stacja↔matka dla pasażerów ZOSTAJE legalna (to blok stacji niżej, nie
        // ta pętla ciał — źródło=kolonia, cel=stacja, różne id).
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
      });
    }

    // S3.3b-S3b — stacje GRACZA (HUB handlowy) jako cele transportu cargo; S3.4 FAZA 4 — także cel
    // transportu pasażerskiego (dostawa POP na stację). Cudze stacje pominięte (cross-empire → S3.5).
    if (actionId === 'transport' || actionId === 'transport_passenger') {
      for (const st of EntityManager.getByTypeInSystem('station', activeSysId)) {
        if ((st.ownerEmpireId ?? 'player') !== 'player') continue;
        if (st.id === vessel.position.dockedAt) continue;   // nie celuj we własny dok (no-op)
        // S3.4c (D8) — stacja z matką = wspólny magazyn kolonii → transport CARGO to self-cargo
        // (jałowa pętla, R5). Wyklucz z 'transport'; 'transport_passenger' ZOSTAJE (POP → habitat,
        // niezależny od depotu). Sierota (bez matki, własny depot) pozostaje legalnym celem cargo.
        if (actionId === 'transport' && resolveHomeColony(st) !== null) continue;
        const body = EntityManager.get(st.bodyId);
        const distAU = this._calcDistAU(vessel, { x: body?.x ?? st.x, y: body?.y ?? st.y });
        targets.push({
          id: st.id, name: st.name ?? st.id, type: 'station',
          distAU, explored: true, reachable: distAU <= effectiveRange(vessel),
          colonyStatus: 'station',
        });
      }
    }

    // Sortuj: reachable najpierw, potem po odległości
    targets.sort((a, b) => {
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      return a.distAU - b.distAU;
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
