// ShipPanelHudLogic — REFORMA ZAKŁADEK T5 (TABS_REFORM_PLAN.md §5.8; decyzje właściciela 2026-10-26): czysta logika panelu
// statku W IDIOMIE PRZYPIĘĆ HUD przy prawym outlinerze (flaga kroku `shipPanelHud` i flagi, na których stał — T3
// `shipPanelOutliner`, slice 258 / B `mapVesselPanel`, `mapVesselPanelCompact` — na stałe ON od T4, klucze usunięte).
// Rysunek, pomiar tekstu i strefy — `ShipPanelHudLayer`; spięcie z hostem (geometria T3, klik, kółko, kursor, przeszkody)
// — `UIManager`.
//   • TREŚĆ I AKCJE = LUSTRO `FleetManagerOverlay._drawRight` (tryb kompaktowy) + footer dawnego `drawVesselPanel` (panel T3
//     usunięty w T4 — wyrocznią keepera jest jego migawka `src/testing/fixtures/traces/T4-ship-panel-t3-baseline.json`): te same warunki
//     pokazania, te same strefy `{ type, data }` — 31 typów (`SHIP_PANEL_ZONE_TYPES`; 16 rozkazów misji = typ `action`
//     z `getAvailableActions`) — i TE SAME handlery: footer → `FleetManagerOverlay._handleVesselPanelFooter`, reszta →
//     `_handleHit` (`runShipPanelAction` — dyspozycja jak dawne `handleVesselPanelClick`). Żadnej nowej logiki akcji; keeper
//     `ship_panel_hud_smoke` porównuje zbiór stref z migawką panelu T3 w każdym stanie statku. Dane tekstowe — te same
//     źródła co panel T3 (`_statusText`, `_baseText`, `_roleLabel`, `_xpStars`, `_missionTypeName`, `_getValidTargets` —
//     metody instancji `FleetManagerOverlay`), słowa wyłącznie z istniejących kluczy i18n (+ jeden nowy: „Rozkazy”).
//   • Układ (od góry): „← Stocznia” (linia tekstowa) · nazwa statku małymi literami jak etykieta statku (glif roli), PEŁNA,
//     łamana do 2 linii, obok ✎ · linia 9 px „typ · kadłub · ★” · status „● stan · baza: X” (kropka w roli `primary`,
//     `alert` — walka / alert jak dziś w outlinerze i etykiecie: `buildShipEntry.tone`) · linie 9 px rozkazu, misji, ETA,
//     paliwa, manifestu, obcego układu, pętli, rally — tylko gdy mają wartość · eyebrow „MODUŁY n/m” + linia na moduł
//     (ikona slotu + nazwa, bez pustej kolumny, łamane) · ładunek: „📦 użyte / maks. t” + pasek 2 px (chip `cargo_load`,
//     gdy dziś przycisk jest) · akcje główne — chipy „[ … ]” zawijane w wiersze (nieaktywne w roli `dim`, nieklikalne) ·
//     „[ Rozkazy ▼ ]” — 16 rozkazów misji zwiniętych; rozwinięte — chipy + powody blokad (akordeon, zwija się przy zmianie
//     zaznaczenia). Konfigurator misji (wybór celu, potwierdzenie) — szerszy panel, w miejscu akcji (jak dziś).
//   • Geometria (kotwica przy wierszu, łącznik, klamra, karta walki, zapas, tryb Y) — `ShipPanelAnchorLogic` z T3 BEZ ZMIAN
//     (szerokość i wysokość z tego modułu); 530 — `coordTooltipBlocked` (dymek współrzędnych nie nad UI).
// Czysty: bez three, bez DOM i bez `window` — świat (`K`), overlay floty (`fmo`), funkcje z `window` (`orderTargetInfo`)
// podaje wołający; moduły danych i i18n importowane jak w `FleetManagerOverlay`.
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES, getModuleCapabilities } from '../data/ShipModulesData.js';
import { getAvailableActions, FLEET_ACTIONS } from '../data/FleetActions.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import EntityManager from '../core/EntityManager.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
import { isEnemyVessel, canColonize as vesselCanColonize, getPrimaryRole } from '../entities/Vessel.js';
import { ROLE_GLYPHS, ORDER_ACTIVITY_KEYS, ORDER_ACTIVITY_FALLBACK_KEY, buildShipEntry } from './FleetPictureLogic.js';
import { layoutButtonRows, toggleOpenList, openListFor } from './LabelPinLogic.js';
import { launchFuelMultiplierForVessel } from '../utils/SpaceportCheck.js';
import { foreignActionsBodyId, foreignActionsContext, isForeignColonizeType } from '../utils/ForeignActions.js';

// Stałe (px logiczne). Strojenie na bramce — z konsoli: `KOSMOS.shipPanelHud.tune({ W: 210 })` (przeżywa do F5).
export const SHIP_PANEL_HUD_DEFAULTS = Object.freeze({
  W: 200,                // szerokość panelu
  W_CONFIG: 260,         // konfigurator misji (wybór celu, potwierdzenie)
  PAD_X: 6, PAD_Y: 5,    // margines treści w pasku
  LINE_GAP: 1,           // odstęp linii
  SECTION_GAP: 4,        // odstęp sekcji
  BAR_ALPHA: 0.72,       // tło — ciemny pasek bez ramki (jak przypięta etykieta HUD: `BAR_ALPHA_SELECTED`)
  SUB_ALPHA: 0.78,       // linie 9 px (jak druga linia etykiety)
  EYEBROW_ALPHA: 0.62, EYEBROW_SPACING: 1,
  CHIP_GAP: 6,           // odstęp chipów w wierszu
  CHIP_ROW_GAP: 2,       // odstęp wierszy chipów
  CHIP_PAD_Y: 2,         // chip — zapas nad i pod tekstem (strefa kliku wyższa niż linia)
  CHIP_HIT_PAD_X: 2,     // strefa kliku chipa — zapas w poziomie
  CHIP_ALPHA: 0.9, CHIP_HOVER_FILL: 0.18,
  BAR_H: 2,              // pasek ładunku / postępu
  BAR_TRACK_ALPHA: 0.35, // tor paska (rola `dim`)
  NAME_MAX_LINES: 2,
  RENAME_GAP: 4,         // odstęp ✎ od nazwy
  LIST_MIN_H: 48,        // przewijana lista (rozkazy / cele) — najmniejsze okno
  SCROLL_STEP: 0.5,      // mnożnik delty kółka (jak `_applyRightScroll` panelu T3)
  SCROLLBAR_W: 2,
});
export const SHIP_PANEL_HUD = { ...SHIP_PANEL_HUD_DEFAULTS };

/** Strojenie stałych z konsoli (bramka): nieznane klucze pominięte; zwraca bieżące wartości. */
export function tuneShipPanelHud(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) if (k in SHIP_PANEL_HUD_DEFAULTS && Number.isFinite(v)) SHIP_PANEL_HUD[k] = v;
  return { ...SHIP_PANEL_HUD };
}
export function resetShipPanelHud() { Object.assign(SHIP_PANEL_HUD, SHIP_PANEL_HUD_DEFAULTS); return { ...SHIP_PANEL_HUD }; }

/** 31 typów stref panelu statku (inwentarz I2, §3.3) — 16 rozkazów misji to jeden typ `action`. */
export const SHIP_PANEL_ZONE_TYPES = Object.freeze([
  'back_to_shipyard', 'rename', 'cargo_load', 'unload_colonists', 'undock', 'cancel_movement_order', 'cluster_switch',
  'foreign_recon_body', 'foreign_recon_system', 'foreign_colonize', 'foreign_unload', 'abort_foreign_recon', 'cancel_loop',
  'withdraw_vessel', 'deploy_vessel', 'action', 'select_target', 'confirm_mission', 'cancel_config', 'change_target',
  'toggle_repeat', 'set_return_cargo', 'disband', 'manual_refuel', 'toggle_refuel_auto', 'toggle_logistics_pool',
  'rally_assign_open', 'rally_assign_remove', 'mvpRetreat', 'mvpFleet', 'mvpDock',
]);
/** Footer-3 panelu statku (D-MVP-8) — dyspozycja przez `_handleVesselPanelFooter` (`VesselGroupActions`), nie `_handleHit`. */
export const FOOTER_ZONE_TYPES = Object.freeze(new Set(['mvpRetreat', 'mvpFleet', 'mvpDock']));

// ── Lustra drobnych pomocników `FleetManagerOverlay` (moduł ich nie eksportuje; tylko tekst) ────────────────────────────

// Ikona slotu modułu — lustro `MODULE_SLOT_INFO` (FMO).
const MODULE_SLOT_ICON = Object.freeze({
  propulsion: '🔥', fuel: '⛽', cargo: '📦', science: '🔬', special: '🤖', habitat: '🏠', armor: '🛡', weapon: '🔫',
  shield: '✦', troop: '🪖',
});
const BODY_TYPES = ['star', 'planet', 'moon', 'asteroid', 'comet', 'planetoid'];
/** Ciało niebieskie po id (lustro `_findBody`). */
export function findBody(id) {
  if (!id) return null;
  for (const bt of BODY_TYPES) for (const b of EntityManager.getByType(bt) ?? []) if (b.id === id) return b;
  return null;
}
/** Czytelna nazwa ciała / stacji / kolonii po id (lustro `_resolveName`). */
export function resolveName(id, K) {
  if (!id) return '???';
  const body = findBody(id);
  if (body?.name) return body.name;
  const ent = EntityManager.get?.(id);
  if (ent?.type === 'station' && ent.name) return `🛰 ${ent.name}`;
  const col = K?.colonyManager?.getColony?.(id);
  if (col?.name) return col.name;
  return id;
}
const cargoIcon = (id) => RESOURCE_ICONS[id] ?? ALL_RESOURCES[id]?.icon ?? COMMODITIES[id]?.icon ?? '•';
function cargoName(id) {
  const en = getLocale() === 'en';
  const def = ALL_RESOURCES[id] ?? COMMODITIES[id];
  if (!def) return id;
  return en ? (def.nameEN ?? def.namePL ?? id) : (def.namePL ?? id);
}
/** Powód odmowy / blokady rozkazu — klucz `vessel.reason<PascalCase>` (lustro `CameraFrame._reasonText`), zapas — slug. */
export function reasonText(reason) {
  const slug = reason ?? 'unknown';
  const key = 'vessel.reason' + String(slug).split('_').map((w) => (w[0]?.toUpperCase() ?? '') + w.slice(1)).join('');
  const s = t(key);
  return s !== key ? s : slug;
}
const low = (s) => String(s ?? '').toLocaleLowerCase(getLocale());
const stripBrackets = (s) => String(s ?? '').replace(/^\s*\[\s*/, '').replace(/\s*\]\s*$/, '');

// ── Model panelu (lustro `_drawRight` w trybie kompaktowym + footer dawnego `drawVesselPanel`) ──────────────────────────

/**
 * Chip akcji: `zone` = strefa jak w panelu T3 (`{ type, data }`), `null` — nieaktywny (rysowany przygaszony, nieklikalny).
 * @returns {{ id:string, label:string, enabled:boolean, zone:object|null }}
 */
const chip = (id, label, zone, enabled = !!zone) => ({ id, label, enabled: enabled && !!zone, zone: enabled ? zone : null });

/**
 * Model panelu statku — `null` dla braku statku, wraku i wroga (D-MVP-12 — jak dawny `drawVesselPanel`).
 * @param {object} vessel
 * @param {{ K:object, fmo:object, features?:object, orderTargetInfo?:Function, gameYear?:number }} env
 * @returns {object|null}
 */
export function buildShipPanelModel(vessel, env = {}) {
  if (!vessel || vessel.isWreck || isEnemyVessel(vessel)) return null;
  const K = env.K ?? null, fmo = env.fmo ?? null;
  const features = env.features ?? {};
  const vMgr = K?.vesselManager ?? null;
  const ms = K?.missionSystem ?? K?.expeditionSystem ?? null;
  const colMgr = K?.colonyManager ?? null;
  const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId] ?? null;
  const vid = vessel.id;
  const pos = vessel.position ?? {};
  const docked = pos.state === 'docked';
  const cfg = fmo?._missionConfig ?? null;

  const m = { vesselId: vid, wide: !!cfg, info: [], chips: [], orders: null, config: null };
  // Nagłówek: „← Stocznia”, nazwa (glif roli + małe litery — jak etykieta statku), ✎, „typ · kadłub · ★”.
  m.back = { label: t('fleet.backToShipyard'), zone: { type: 'back_to_shipyard', data: {} } };
  m.name = { glyph: ROLE_GLYPHS[getPrimaryRole(vessel)] ?? '', text: low(vessel.name ?? vid), rename: { type: 'rename', data: { vesselId: vid } } };
  const hull = ship ? getName(ship, 'ship') : vessel.shipId;
  m.sub = [low(fmo?._roleLabel?.(vessel) ?? ''), low(hull), fmo?._xpStars?.(vessel) ?? ''].filter(Boolean).join(' · ');
  // Status „● stan · baza: X” — kropka `alert` przy walce / alercie (ton `buildShipEntry` — jak outliner, Dok i etykieta).
  const dscs = K?.deepSpaceCombatSystem;
  const entry = buildShipEntry(vessel, {
    gameYear: K?.timeSystem?.gameTime ?? 0, fleetSystem: K?.fleetSystem ?? null,
    combatCheck: dscs?._findActiveEncounterContaining ? (id) => !!dscs._findActiveEncounterContaining(id) : null,
    isImmobilized: vMgr?.isImmobilized ? (v) => vMgr.isImmobilized(v) : null,
  });
  m.status = {
    dotRole: entry && (entry.tone === 'combat' || entry.tone === 'alert') ? 'alert' : 'primary',
    text: `${low(fmo?._statusText?.(vessel) ?? '')} · ${low(t('fleet.labelBase'))}: ${fmo?._baseText?.(vessel) ?? ''}`,
  };

  // ── Linie pomocnicze (tylko gdy mają wartość) ──
  const order = vessel.movementOrder;
  if (order && order.status !== 'cancelled' && order.status !== 'completed') m.info.push(...orderLines(vessel, order, K, env.orderTargetInfo, fmo));
  const activeMissions = ms?.getActive?.() ?? [];
  const mission = activeMissions.find((mm) => mm.vesselId === vid) ?? null;
  if (mission) m.info.push(...missionLines(mission, fmo, K));
  m.info.push(...fuelLines(vessel));
  if (mission) m.info.push(...manifestLines(mission, vessel));

  // ── Moduły ──
  const mods = vessel.modules ?? [];
  const maxSlots = ship?.baseModuleSlots ?? ship?.slots?.length ?? mods.length;
  m.modules = {
    header: `${t('fleet.modulesHeader')} ${mods.length}/${maxSlots}`,
    items: mods.map((id) => { const md = SHIP_MODULES[id]; return { text: `${MODULE_SLOT_ICON[md?.slotType] ?? '▪'} ${md ? getName(md, 'module') : id}`, unknown: !md }; }),
    empty: mods.length === 0 ? t('fleet.noModules') : null,
  };

  // ── Ładunek (pasek + tekst; chip `cargo_load`, gdy dziś jest przycisk — w doku albo na orbicie) ──
  const cargoMax = (vessel.cargoMax ?? 0) > 0 ? vessel.cargoMax : (ship?.cargoCapacity ?? 0);
  if (cargoMax > 0) {
    const used = vessel.cargoUsed ?? 0;
    m.cargo = {
      text: `📦 ${Math.round(used)} / ${cargoMax} t`, pct: Math.max(0, Math.min(1, used / cargoMax)),
      zone: (docked || pos.state === 'orbiting') ? { type: 'cargo_load', data: { vesselId: vid } } : null,
    };
  } else m.cargo = null;

  // ── Akcje przed konfiguratorem (lustro kolejności T3: rysowane też w trybie konfiguratora) ──
  const onBoard = vessel.colonists ?? 0;
  if (onBoard > 0 && docked) m.chips.push(chip('unload_colonists', `🏠 ${t('fleet.unloadColonists', onBoard)}`, { type: 'unload_colonists', data: { vesselId: vid } }));
  if (docked && pos.dockedAt) m.chips.push(chip('undock', t('fleet.undock'), { type: 'undock', data: { vesselId: vid } }));
  if (order && order.status === 'active') m.chips.push(chip('cancel_movement_order', `✕ ${t('fleet.cancelOrder')}`, { type: 'cancel_movement_order', data: { vesselId: vid } }));
  const isMission = vessel.mission;
  if (isMission?.type === 'interstellar_jump' && isMission.phase === 'in_system') {
    m.info.push({ text: `🌟 ${t('fleet.arrivedAt', isMission.targetName ?? isMission.toSystemId)}` });
    if (K?.starSystemManager?.getSystem?.(isMission.toSystemId)) {
      m.chips.push(chip('cluster_switch', t('fleet.clusterSwitch'), { type: 'cluster_switch', data: { systemId: isMission.toSystemId } }));
    }
  }
  // Finding 578 (D-1) — akcje obce kluczuje PREDYKAT, nie kształt misji: trasa Atlas (stan C) jak dziś, plus bezczynna
  // orbita ciała poza śladem kolonii (stan B — PPM „Lecisz do planety", rozkaz ruchu d2). Jedno źródło z rejestrem.
  const foreignBodyId = foreignActionsBodyId(vessel, foreignActionsContext(K));
  if (foreignBodyId) m.chips.push(...foreignOrbitChips(vessel, foreignBodyId, colMgr, m.info));
  if (isMission?.type === 'foreign_recon') {
    m.info.push(...foreignReconLines(isMission));
    m.chips.push(chip('abort_foreign_recon', `⏹ ${t('fleet.abortRecon')}`, { type: 'abort_foreign_recon', data: { vesselId: vid } }));
  }
  const loop = activeMissions.find((mm) => mm.vesselId === vid && mm.loop && mm.type === 'transport') ?? null;
  if (loop) {
    m.info.push(...loopLines(loop, colMgr, K));
    m.chips.push(chip('cancel_loop', t('fleet.stopLoop'), { type: 'cancel_loop', data: { vesselId: vid } }));
  }

  // ── Konfigurator misji (zastępuje akcje, rally i dziennik — jak dziś) ──
  if (cfg) {
    m.config = configModel(vessel, cfg, { fmo, K, ship });
    m.chips.push(...footerChips(vessel, K));
    return m;
  }

  // ── Akcje (`_drawActions`): oś służby, rozkazy misji, rozbiórka, tankowanie, pula, rally; footer-3 ──
  m.chips.push(...footerChips(vessel, K));
  if (vMgr?.deployVessel && !vessel.isWreck) {
    const st = vessel.serviceState ?? 'active';
    if (st === 'mobilizing') {
      m.info.push({ text: vessel.mobilizeTarget === 'stored' ? t('fleet.withdrawing') : t('fleet.mobilizing'),
        bar: Math.max(0, Math.min(1, (vessel.mobilizeProgress ?? 0) / 1.0)) });
    } else {
      const toReserve = st === 'active';
      m.chips.push(chip(toReserve ? 'withdraw_vessel' : 'deploy_vessel',
        toReserve ? `📦 ${t('fleet.withdrawAction')}` : `⚓ ${t('fleet.deployAction')}`,
        { type: toReserve ? 'withdraw_vessel' : 'deploy_vessel', data: { vesselId: vid } }));
    }
  }
  const state = { missionSystem: ms, vesselManager: vMgr, colonyManager: colMgr, techSystem: K?.techSystem, activePlanetId: colMgr?.activePlanetId };
  const actions = getAvailableActions(vessel, state);
  const reasons = [];
  m.orders = {
    items: actions.map(({ action, ok, reason }) => {
      if (!ok && reason && !reasons.includes(reason)) reasons.push(reason);
      return chip('action:' + action.id, `${action.icon} ${action.label}`, { type: 'action', data: { actionId: action.id, vessel } }, ok);
    }),
    reasons,
  };
  if (docked) {
    m.chips.push(chip('manual_refuel', t('fleet.refuelNow'), { type: 'manual_refuel', data: { vesselId: vid } }));
    const autoOn = vessel.refuelAutomatically ?? true;
    m.chips.push(chip('toggle_refuel_auto', autoOn ? t('fleet.refuelAutoOn') : t('fleet.refuelAutoOff'), { type: 'toggle_refuel_auto', data: { vesselId: vid } }));
  }
  const tos = K?.transportOrderSystem;
  if (features?.transportOrders && tos && !isEnemyVessel(vessel)) {
    const inPool = tos.isInPool?.(vid) ?? false;
    m.chips.push(chip('toggle_logistics_pool', inPool ? t('fleet.removeFromPool') : t('fleet.addToPool'), { type: 'toggle_logistics_pool', data: { vesselId: vid } }));
  }
  m.chips.push(...rallyChips(vessel, K, m.info));
  // Rozbiórka — na końcu (nieodwracalna; od T3 po potwierdzeniu — 543): w doku przy kolonii ze stocznią; bez stoczni —
  // przygaszona z dzisiejszym tekstem.
  const colony = vessel.colonyId ? colMgr?.getColony?.(vessel.colonyId) : null;
  const hasShipyard = colony ? (colMgr?._getShipyardLevel?.(colony) ?? 0) > 0 : false;
  if (docked && hasShipyard) m.chips.push(chip('disband', t('fleet.disbandReturn'), { type: 'disband', data: { vesselId: vid } }));
  else if (docked) m.chips.push(chip('disband', t('fleet.disbandRequiresShipyard'), null, false));
  return m;
}

/** Linie rozkazu ruchu (lustro `_drawMovementOrderLabel` — słowa z kluczy i18n zamiast literałów, 538). */
function orderLines(vessel, order, K, orderTargetInfo, fmo) {
  const out = [];
  if (order.status === 'blocked') {
    out.push({ text: `⚠ ${t('fleetPicture.alert.blocked')}: ${reasonText(order.blockReason)}`, role: 'alert' });
  } else {
    const tinfo = typeof orderTargetInfo === 'function' ? orderTargetInfo(vessel) : null;
    let target = '';
    if (tinfo) target = tinfo.name;
    else if (order.targetEntityId) target = K?.vesselManager?.getVessel?.(order.targetEntityId)?.name ?? resolveName(order.targetEntityId, K);
    else if (order.targetPoint) target = `(${Number(order.targetPoint.x).toFixed(0)}, ${Number(order.targetPoint.y).toFixed(0)})`;
    const kind = low(t(ORDER_ACTIVITY_KEYS[order.type] ?? ORDER_ACTIVITY_FALLBACK_KEY));
    let text;
    if (order.type === 'patrol') {
      const idx = order.patrolWaypointIndex ?? 0, total = order.patrolRoute?.length ?? 0;
      const poi = order.poiId ? (K?.poiRegistry?.getPOI?.(order.poiId)?.name ?? order.poiId) : '';
      text = `↻ ${kind}${poi ? ' ' + poi : ''} (${idx + 1}/${total})`;
    } else if (order.type === 'goToPOI') {
      text = `→ ${kind}: ${K?.poiRegistry?.getPOI?.(order.poiId)?.name ?? order.poiId ?? '?'}`;
    } else {
      text = `→ ${kind}${target ? ': ' + target : ''}`;
    }
    if (tinfo && Number.isFinite(tinfo.distAU)) text += ` · ${tinfo.distAU.toFixed(1)} AU`;
    // Rola: rozkazy na wrogi cel (atak, pościg, przechwycenie — w panelu T3 barwy niebezpieczeństwa) — `alert`; reszta — `primary`.
    out.push({ text, role: ['engage', 'pursue', 'intercept'].includes(order.type) ? 'alert' : 'primary' });
  }
  // Misja zawieszona przez rozkaz (§8.3; snapshot `vessel._suspendedMission`) — glif ⏸ zamiast „(mission paused)”: typ → cel.
  const sm = vessel._suspendedMission;
  if (sm) {
    const kind = sm.type ? low(fmo?._missionTypeName?.(sm.type) ?? sm.type) : '';
    const tg = sm.targetName ?? (sm.targetId ? resolveName(sm.targetId, K) : '');
    out.push({ text: ['⏸', kind, tg ? `→ ${tg}` : ''].filter(Boolean).join(' ') });
  }
  return out;
}

/** Linie aktywnej misji (lustro `_drawActiveMission`): typ → cel, faza · ETA + pasek postępu. */
function missionLines(mission, fmo, K) {
  const out = [];
  const typeName = fmo?._missionTypeName?.(mission.type) ?? mission.type;
  out.push({ text: `${low(typeName)} → ${mission.targetName ?? resolveName(mission.targetId, K)}` });
  const phase = mission.status ?? 'transit';
  const waiting = phase === 'no_housing';
  const phaseTxt = phase === 'returning' ? t('fleet.phaseReturn') : phase === 'orbiting' ? t('fleet.phaseOrbiting')
    : phase === 'working' ? t('fleet.phaseWorking') : waiting ? t('fleet.phaseWaitingHousing') : t('fleet.phaseTransit');
  const eta = (mission.arrivalYear && !waiting) ? t('fleet.etaYearLabel', Math.ceil(mission.arrivalYear)) : '';
  const pct = mission.progressPct ?? 0;
  out.push({ text: [low(phaseTxt), eta].filter(Boolean).join(' · '), bar: pct > 0 ? Math.min(1, pct) : null });
  return out;
}

/** Paliwo (paski T3 Rejestru — tu linia 9 px; brief T5): „paliwo 7,3 / 10 pc” · „🌀 2 / 4 wc” przy baku warp. */
function fuelLines(vessel) {
  const out = [];
  const f = vessel.fuel;
  if (f && f.max > 0) out.push({ text: `${low(t('fleet.labelFuel'))} ${Number(f.current ?? 0).toFixed(1)} / ${f.max} pc` });
  const w = vessel.warpFuel;
  if (w && w.max > 0) out.push({ text: `🌀 ${Number(w.current ?? 0).toFixed(1)} / ${w.max} wc` });
  return out;
}

/** Manifest misji (lustro `_drawMissionManifest`): plan / na pokładzie / powrót — po 4 pozycje + „+N więcej”. */
function manifestLines(mission, vessel) {
  const out = [];
  const list = (obj) => Object.entries(obj ?? {}).filter(([, q]) => q > 0);
  const fmt = (entries) => {
    const shown = entries.slice(0, 4).map(([id, q]) => `${cargoIcon(id)} ${cargoName(id)} ${Math.round(q)}`);
    if (entries.length > 4) shown.push(t('fleet.manifestMore', entries.length - 4));
    return shown.join(' · ');
  };
  const plan = list(mission.cargo), board = list(vessel.cargo), ret = list(mission.returnCargoSpec);
  if (plan.length) out.push({ text: `${low(t('fleet.manifestPlanned'))} ${fmt(plan)}` });
  if (board.length) out.push({ text: `${low(t('fleet.manifestOnBoard'))} ${fmt(board)}` });
  if (ret.length) out.push({ text: `${low(t('fleet.manifestReturn'))} ${fmt(ret)}` });
  return out;
}

/** Orbita obcego ciała (lustro panelu rejestru; ciało z `foreignActionsBodyId`): recon ciała / układu, kolonizacja, rozładunek. */
function foreignOrbitChips(vessel, bodyId, colMgr, info) {
  const out = [];
  const vid = vessel.id;
  const body = findBody(bodyId);
  info.push({ text: `🌍 ${t('fleet.orbitingBody', body?.name ?? bodyId)}` });
  const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
  const hullCaps = ship?.capabilities ?? [];
  const modCaps = vessel.modules?.length ? getModuleCapabilities(vessel.modules) : new Set();
  if (vessel.modules?.some((id) => SHIP_MODULES[id]?.slotType === 'propulsion')) { modCaps.add('recon'); modCaps.add('survey'); }
  const has = (c) => hullCaps.includes(c) || modCaps.has(c);
  if (has('recon')) {
    const analyzed = body?.analyzed ?? false;
    out.push(chip('foreign_recon_body', t('fleet.foreignReconBody'), { type: 'foreign_recon_body', data: { vesselId: vid, targetId: bodyId } }, !analyzed));
    out.push(chip('foreign_recon_system', t('fleet.foreignReconSystem'), { type: 'foreign_recon_system', data: { vesselId: vid } }));
  }
  if (vesselCanColonize(vessel)) {
    const explored = body?.explored ?? false;
    const colonized = colMgr?.getColony?.(bodyId) != null;
    const validType = isForeignColonizeType(body);
    const can = explored && !colonized && validType;
    let label = t('fleet.foreignColonize');
    if (!explored) label += ` (${t('fleet.requiresExplored')})`;
    else if (colonized) label += ` (${t('fleet.alreadyColonized')})`;
    out.push(chip('foreign_colonize', label, { type: 'foreign_colonize', data: { vesselId: vid, targetId: bodyId } }, !!can));
  }
  if (has('cargo') && (vessel.cargoUsed ?? 0) > 0) {
    out.push(chip('foreign_unload', `${t('fleet.foreignUnload')} (${Math.round(vessel.cargoUsed ?? 0)}t)`, { type: 'foreign_unload', data: { vesselId: vid, targetId: bodyId } }));
  }
  return out;
}

/** Rekon obcy w toku (lustro panelu `foreign_recon`): „Skanowanie / W drodze do …” + postęp i / N. */
function foreignReconLines(mission) {
  if (mission.scope === 'target') {
    const b = findBody(mission.targetId);
    return [{ text: t('fleet.foreignScanning', b ? (b.name ?? b.id) : '...') }];
  }
  if (mission.scope === 'full_system') {
    const cur = mission.targets?.[mission.currentIdx];
    const b = cur ? findBody(cur) : null;
    const nm = b ? (b.name ?? b.id) : '...';
    const txt = mission.phase === 'scanning' ? t('fleet.foreignScanning', nm) : t('fleet.foreignTraveling', nm);
    return [{ text: `${txt} · ${(mission.currentIdx ?? 0) + 1} / ${mission.targets?.length ?? '?'}` }];
  }
  return [];
}

/** Pętla transportowa (lustro panelu pętli): etap, „A ⇄ B”, oczekiwanie. */
function loopLines(loop, colMgr, K) {
  const icon = loop.status === 'waiting_reload' || loop.status === 'waiting_return_cargo' ? '⏳' : loop.leg === 'return' ? '⬅' : '➡';
  const src = colMgr?.getColony?.(loop.loopSourceId)?.name ?? loop.loopSourceId ?? '?';
  const tgt = findBody(loop.loopTargetId)?.name ?? colMgr?.getColony?.(loop.loopTargetId)?.name ?? loop.loopTargetId ?? '?';
  const out = [{ text: `${icon} ${low(t('fleet.activeLoopLabel'))}: ${src} ⇄ ${tgt}` }];
  if (loop.status === 'waiting_reload') out.push({ text: t('fleet.loopWaitReload'), role: 'alert' });
  else if (loop.status === 'waiting_return_cargo') out.push({ text: t('fleet.loopWaitReturnCargo'), role: 'alert' });
  return out;
}

/** Rally (lustro `_drawRallyAssignSection`): bez przypisania — „Przypisz”; z przypisaniem — linia + „Zmień” / „Usuń”. */
function rallyChips(vessel, K, info) {
  const reg = K?.poiRegistry;
  if (!reg?.listPOIs) return [];
  const rallies = reg.listPOIs({ type: 'rally' }) ?? [];
  if (rallies.length === 0) return [];
  const cur = rallies.find((r) => (r.memberVesselIds ?? []).includes(vessel.id)) ?? null;
  const vid = vessel.id;
  if (!cur) return [chip('rally_assign_open', t('fleet.rally.notAssigned'), { type: 'rally_assign_open', data: { vesselId: vid, currentRallyId: null } })];
  const nm = (cur.name ?? '?').length > 18 ? cur.name.slice(0, 17) + '…' : (cur.name ?? '?');
  info.push({ text: t('fleet.rally.assigned', nm) });
  return [
    chip('rally_assign_open', t('fleet.rally.change'), { type: 'rally_assign_open', data: { vesselId: vid, currentRallyId: cur.id } }),
    chip('rally_assign_remove', t('fleet.rally.remove'), { type: 'rally_assign_remove', data: { vesselId: vid, rallyId: cur.id } }),
  ];
}

/** Footer-3 (lustro dawnego `_drawVesselPanelFooter`, D-MVP-8): Dokuj / → Flota / Odwrót — nieaktywne bez strefy. */
function footerChips(vessel, K) {
  const docked = vessel?.position?.state === 'docked';
  const immob = !!K?.vesselManager?.isImmobilized?.(vessel);
  const d = { vesselId: vessel.id };
  return [
    chip('mvpDock', t('fleetGroup.actionDock'), { type: 'mvpDock', data: d }, !immob),
    chip('mvpFleet', t('fleetGroup.assignFleet'), { type: 'mvpFleet', data: d }, !!K?.fleetSystem),
    chip('mvpRetreat', t('fleetGroup.actionRetreat'), { type: 'mvpRetreat', data: d }, !docked && !immob),
  ];
}

/** Konfigurator misji (lustro `_drawMissionConfig` — krok wyboru celu i potwierdzenie). */
function configModel(vessel, cfg, { fmo, K, ship }) {
  const action = FLEET_ACTIONS[cfg.actionId];
  if (!action) return { step: null };
  if (cfg.step === 'select') {
    const hints = [t('fleet.clickBodyOnMap')];
    const warp = (vessel.warpFuel?.max ?? 0) > 0 || (vessel.modules ?? []).some((id) => SHIP_MODULES[id]?.warpCapable);
    if (cfg.actionId === 'colonize' && warp) hints.push(t('fleet.colonizeCrossSystemHint'));
    const targets = fmo?._getValidTargets?.(vessel, cfg.actionId) ?? [];
    const rows = [];
    let lastSys = null;
    for (const tg of targets) {
      if (tg.sameSystem === false && tg.systemName !== lastSys) {
        lastSys = tg.systemName;
        rows.push({ kind: 'group', text: `🪐 ${t('fleet.otherSystem')}: ${tg.systemName}` });
      }
      const icon = tg.type === 'planet' ? '🌍' : tg.type === 'moon' ? '🌙' : tg.type === 'planetoid' ? '🪨' : tg.type === 'station' ? '🛰' : '☄';
      const dist = tg.distAU != null ? `${tg.distAU.toFixed(1)} AU` : `${(tg.distLY ?? 0).toFixed(1)} ly`;
      let badge;
      if (!tg.reachable) badge = t('fleet.badgeTooFar');
      else if (!tg.explored) badge = t('fleet.badgeUnexplored');
      else if (cfg.actionId === 'found_outpost' && tg.colonyStatus === 'colony') badge = t('fleet.target.existingColony');
      else if (cfg.actionId === 'found_outpost' && tg.colonyStatus === 'outpost') badge = t('fleet.target.existingOutpost');
      else if (tg.sameSystem === false) badge = t('fleet.badgeWarp');
      else badge = t('fleet.badgeExplored');
      rows.push({ kind: 'target', id: 'select_target:' + tg.id, text: `${icon} ${tg.name ?? '?'}`, right: `${dist} · ${badge}`,
        enabled: !!tg.reachable, zone: tg.reachable ? { type: 'select_target', data: { targetId: tg.id, targetSystemId: tg.systemId ?? null } } : null });
    }
    return { step: 'select', header: t('fleet.selectTargetFor', action.label.toUpperCase()), hints, rows,
      chips: [chip('cancel_config', t('fleet.cancel'), { type: 'cancel_config', data: {} })] };
  }
  if (cfg.step === 'confirm') {
    const target = findBody(cfg.targetId) ?? EntityManager.get(cfg.targetId);
    if (!target) return { step: 'confirm', missingTarget: true };
    const lines = [];
    const tIcon = target.type === 'planet' ? '🌍' : target.type === 'moon' ? '🌙' : '🪨';
    const tsys = cfg.targetSystemId ?? null;
    const cross = !!tsys && tsys !== (vessel.systemId ?? 'sys_home');
    if (cross) {
      const sysName = K?.galaxyData?.systems?.find?.((s) => s.id === tsys)?.name ?? tsys;
      lines.push({ text: t('fleet.crossSystemDelivery', sysName) }, { text: t('fleet.crossSystemDeliveryHint') });
    }
    const distAU = fmo?._calcDistAU?.(vessel, target) ?? 0;
    const speed = (vessel.speedAU ?? ship?.speedAU ?? 1) * (K?.techSystem?.getShipSpeedMultiplier?.() ?? 1);
    const travel = speed > 0 ? distAU / speed : Infinity;
    const fuelCost = distAU * (vessel.fuel?.consumption ?? 0) * launchFuelMultiplierForVessel(vessel);
    if (!cross) {
      lines.push(
        { text: `${low(t('fleet.distanceLabel'))}: ${distAU.toFixed(2)} AU` },
        { text: `${low(t('fleet.travelTime'))}: ${travel < 1 ? t('fleet.etaDays', Math.ceil(travel * 365)) : t('fleet.etaYears', travel.toFixed(1))}` },
        { text: `${low(t('fleet.fuelOneWay'))}: ${fuelCost.toFixed(1)} pc` },
        { text: t('fleet.etaYearLabel', Math.ceil((K?.timeSystem?.gameTime ?? 0) + travel)) },
      );
    }
    const chips = [chip('change_target', stripBrackets(t('fleet.changeTargetBracket')), { type: 'change_target', data: {} })];
    const hasCargoCap = (vessel.cargoMax ?? 0) > 0 || (ship?.cargoCapacity ?? 0) > 0;
    const tail = [];
    if (cfg.actionId === 'transport' && hasCargoCap) {
      const checked = cfg.repeat ?? false;
      tail.push(chip('toggle_repeat', `${checked ? '☑' : '☐'} ${t('fleet.repeatAuto')}`, { type: 'toggle_repeat', data: {} }));
      if (checked && K?.colonyManager?.getColony?.(cfg.targetId)) {
        tail.push(chip('set_return_cargo', t('fleet.setReturnCargo'), { type: 'set_return_cargo', data: {} }));
        const n = cfg.returnCargo ? Object.keys(cfg.returnCargo).length : 0;
        lines.push({ text: n > 0 ? t('fleet.returnCargoStatus', n) : t('fleet.returnCargoNone'), tail: true });
      }
    }
    const noFuel = (vessel.fuel?.current ?? 0) < fuelCost;
    tail.push(chip('confirm_mission', noFuel ? t('fleet.sendMissionNoFuel') : t('fleet.sendMission'), { type: 'confirm_mission', data: {} }, !noFuel));
    tail.push(chip('cancel_config', t('fleet.cancel'), { type: 'cancel_config', data: {} }));
    return { step: 'confirm', header: `${action.icon} ${action.label.toUpperCase()}`, target: `${tIcon} ${target.name ?? cfg.targetId}`,
      lines, chips, tail };
  }
  return { step: null };
}

/**
 * Wszystkie AKTYWNE strefy modelu (kolejność nieistotna) — do porównania z panelem T3 (keeper) i do odczytu bramki.
 * @returns {Array<{ type:string, data:object }>}
 */
export function modelZones(m) {
  if (!m) return [];
  const out = [m.back.zone, m.name.rename];
  if (m.cargo?.zone) out.push(m.cargo.zone);
  for (const c of m.chips) if (c.enabled) out.push(c.zone);
  for (const c of m.orders?.items ?? []) if (c.enabled) out.push(c.zone);
  const cf = m.config;
  if (cf) {
    for (const r of cf.rows ?? []) if (r.enabled) out.push(r.zone);
    for (const c of [...(cf.chips ?? []), ...(cf.tail ?? [])]) if (c.enabled) out.push(c.zone);
  }
  return out;
}

/**
 * Klucz strefy do porównania zbiorów (typ + dane; obiekt statku w `data.vessel` → id).
 * @returns {string}
 */
export function zoneKey(z) {
  const d = { ...(z?.data ?? {}) };
  if (d.vessel && typeof d.vessel === 'object') d.vessel = d.vessel.id;
  return `${z?.type}|${JSON.stringify(Object.keys(d).sort().reduce((o, k) => ((o[k] = d[k]), o), {}))}`;
}

// ── Tekst: łamanie nazwy i długich linii ─────────────────────────────────────────────────────────────────────────────

/**
 * Łamanie tekstu do szerokości `maxW` (słowa; słowo dłuższe niż linia — dzielone po znakach); `widthOf(s)` mierzy napis.
 * @returns {string[]}
 */
export function wrapText(text, maxW, widthOf) {
  const s = String(text ?? '');
  if (!(maxW > 0) || widthOf(s) <= maxW) return [s];
  const out = [];
  let line = '';
  const pushWord = (w) => {
    // Słowo dłuższe niż linia — po znakach.
    let rest = w;
    while (rest && widthOf(rest) > maxW) {
      let k = 1;
      while (k < rest.length && widthOf(rest.slice(0, k + 1)) <= maxW) k++;
      out.push(rest.slice(0, k));
      rest = rest.slice(k);
    }
    return rest;
  };
  for (const word of s.split(' ')) {
    const test = line ? `${line} ${word}` : word;
    if (widthOf(test) <= maxW) { line = test; continue; }
    if (line) out.push(line);
    line = widthOf(word) <= maxW ? word : pushWord(word);
  }
  if (line) out.push(line);
  return out;
}

/**
 * Nazwa statku PEŁNA, łamana do `maxLines` (2) linii, bez „…” (nazwa z okna zmiany ma ≤ 30 znaków — mieści się
 * w 2 liniach panelu z konstrukcji). Nazwa dłuższa niż `maxLines` linii (spoza okna zmiany nazwy) — ostatnia linia ucięta
 * z „…” (`clipped`).
 * @returns {{ lines:string[], clipped:boolean }}
 */
export function wrapName(name, maxW, widthOf, maxLines = SHIP_PANEL_HUD.NAME_MAX_LINES) {
  const lines = wrapText(name, maxW, widthOf);
  if (lines.length <= maxLines) return { lines, clipped: false };
  const head = lines.slice(0, maxLines - 1);
  let last = lines.slice(maxLines - 1).join(' ');
  while (last.length > 1 && widthOf(last + '…') > maxW) last = last.slice(0, -1);
  return { lines: [...head, last + '…'], clipped: true };
}

/** Wiersze chipów (lustro `LabelPinLogic.layoutButtonRows` — ten sam algorytm przypięć T2). */
export const layoutChipRows = (chips, widthOf, maxW, gap = SHIP_PANEL_HUD.CHIP_GAP) => layoutButtonRows(chips, widthOf, maxW, gap);

// ── Akordeon rozkazów (lustro akordeonu przypięcia T2) ──────────────────────────────────────────────────────────────

/** Klucz akordeonu — statek (zmiana zaznaczenia zwija listę: `ShipPanelHudLayer` słucha `ui:selectionChanged`). */
export const ordersKey = (vesselId) => 'vessel:' + vesselId;
export const toggleOrders = (state, vesselId) => toggleOpenList(state, ordersKey(vesselId), 'orders');
export const ordersOpen = (state, vesselId) => openListFor(state, ordersKey(vesselId)) === 'orders';

/**
 * Zachowanie 9 (PASS T5, Finding 546): czy zmiana zaznaczenia (także A → nic → A) zdejmuje konfigurator misji
 * (`FleetManagerOverlay._missionConfig` — wybór celu / potwierdzenie nie przechodzi na inny statek), jak zwinięcie listy
 * rozkazów. Tylko bez otwartego overlayu — Rejestr Dowództwa ma własną regułę (klik w wiersz statku zdejmuje
 * konfigurator).
 */
export const shouldDropMissionConfig = ({ overlayOpen = false, config = null } = {}) =>
  overlayOpen !== true && config != null;

// ── Strefy kliku: chip > nazwa > pasek (pochłania) ────────────────────────────────────────────────────────────────────

/**
 * Strefa panelu pod punktem: chip (`chip` — akcja, ✎, „← Stocznia”, „[ Rozkazy ▼ ]”, wiersz celu), linia nazwy (`name` —
 * reguła D-UI-5: 2. klik, kamera), reszta panelu (`body` — klik pochłonięty, nie idzie do mapy).
 * @param {Array<{kind:'chip'|'name'|'body', x:number, y:number, w:number, h:number}>} zones
 */
export function shipPanelHitAt(zones, x, y) {
  if (!Array.isArray(zones) || !zones.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const inside = (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  for (const kind of ['chip', 'name', 'body']) {
    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].kind === kind && inside(zones[i])) return zones[i];
  }
  return null;
}

/**
 * Wykonanie chipa — DZISIEJSZE handlery co do metody (dyspozycja jak dawne `FleetManagerOverlay.handleVesselPanelClick`):
 * footer-3 → `_handleVesselPanelFooter(zone)`, reszta → `_handleHit(zone, x, y)`.
 * @returns {'footer'|'hit'|null}
 */
export function runShipPanelAction(zone, { fmo, x = null, y = null } = {}) {
  if (!zone?.type || !fmo) return null;
  if (FOOTER_ZONE_TYPES.has(zone.type)) { fmo._handleVesselPanelFooter?.(zone); return 'footer'; }
  fmo._handleHit?.(zone, x, y);
  return 'hit';
}

// ── 530 — dymek współrzędnych nie nad UI ──────────────────────────────────────────────────────────────────────────────

/**
 * Finding 530: dymek „Pozycja: (x, y)” pustej mapy NIE pokazuje się, gdy kursor jest nad JAKIMKOLWIEK UI — powierzchnią
 * `UIManager.isOverUI` (panel statku, outlinery, belka, pas, nawigacja, dziennik, panele) albo strefą warstwy HUD
 * (etykieta, przypięcie — `HudLayer.coversUiPoint`). Niezależnie od flag kroku.
 */
export const coordTooltipBlocked = ({ overUI = false, hudZone = false } = {}) => overUI === true || hudZone === true;
