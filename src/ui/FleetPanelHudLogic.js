// FleetPanelHudLogic — REFORMA ZAKŁADEK T6 (TABS_REFORM_PLAN.md §5.9; decyzja właściciela 2026-10-26 — D-TR-9 zmieniona):
// czysta logika PANELU FLOTY (`FleetCommandPanel`) i PANELU GRUPY N ≥ 2 (`FleetGroupPanel`) W IDIOMIE ETYKIET z T5, przy
// prawym outlinerze, za flagą `FEATURES.fleetPanelHud` (stoi na T5 — `isShipPanelHudActive`: geometria T3, tryb kompaktowy;
// brak klucza = OFF → dzisiejsze panele w lewym dolnym rogu co do bitu). Rysunek, pomiar tekstu i strefy —
// `FleetPanelHudLayer`; spięcie z hostem (geometria T3, klik, kółko, kursor, przeszkody, mutex) — `UIManager`.
//   • TREŚĆ I AKCJE = LUSTRO `FleetCommandPanel.draw` / `FleetGroupPanel.draw`: te same warunki aktywności, te same strefy
//     `{ type, data }` (flota — 16 typów `FLEET_PANEL_ZONE_TYPES`, grupa — 11 `GROUP_PANEL_ZONE_TYPES`) i TE SAME handlery:
//     `runFleetPanelAction` → `_onHit(zone)` instancji z `UIManager` (`fleetCommandPanel` / `fleetGroupPanel`), które dalej
//     trzymają stan — flotę, zaznaczenie, zwinięcie. Stronicowanie (▲ ▼, `PAGING_ZONE_TYPES`) zastępuje przewijanie listy
//     członków kółkiem; pochłanianie `bg` — reszta panelu.
//   • Układ (od góry): linia sterowania — chipy-glify „◀ ▶” (flota) i „— ✕” (flota) / „—” (grupa); po zwinięciu „+” · nazwa
//     (glif ⛬, małe litery, pogrubiona, łamana do 2 linii) + ✎ (flota) · linia 9 px „N statków · lider: X · stan” (flota) /
//     „lider: X” + linia zbiorcza (grupa) · „doktryna: X ▾” (flota) · lista członków (glif roli w kolorze znacznika + nazwa;
//     chipy-glify ◎ ✕ / ◎ ✎ ✕ (glify tekstowe w kolorze roli, nie emoji) na końcu linii; linia celu ataku / pościgu w roli alarmu) · akcje główne („[ Rozwiąż ]” /
//     „[ → Flota ]”) · „[ Rozkazy ▼ ]” — rozkazy floty / grupy zwinięte (akordeon T5). Konfigurator celu floty — picker Rusz /
//     Atak uzbrojony dla TEJ floty (dziś cel = klik w mapę, baner u góry): szerszy panel, nagłówek, podpowiedź, „[ ANULUJ ]”.
//   • Mutex (`fleetHudSurface`): w danej chwili jeden z trzech paneli — flota > N ≥ 2 > lider (reguła Doku taktycznego
//     `computePanelMode`, ta sama co w `readClickSelection`). Zaznaczenie statku (z każdej powierzchni) zdejmuje flotę —
//     lustro §7.11 outlinera i P2.5 Rejestru (`dropFleetOnShipSelection`); Esc zamyka panel floty; zmiana zaznaczenia zwija
//     akordeon i zdejmuje picker celu floty (reguła 546 — `shouldDropFleetPicker`).
//   • Strojenie 1 (właściciel 2026-10-27): klik w PUSTĄ mapę zdejmuje flotę (`dropFleetOnEmptyMapClick` — jak panel statku
//     i przypięcia; uzbrojony picker — wyjątek, klik = cel); baner pickera u góry ekranu ukryty, gdy panel pokazuje
//     konfigurator (`pickerBannerHidden`); „Odwrót” grupy tylko dla członka w aktywnym starciu (Finding 562 — `countActionable`
//     z predykatem MOS `combatCheckOf`, przy OFF i ON).
// Czysty: bez three, bez DOM i bez `window` — świat (`K`), instancje paneli i `um` podaje wołający.
import { t, getLocale } from '../i18n/i18n.js';
import { getPrimaryRole } from '../entities/Vessel.js';
import { ROLE_GLYPHS, ORDER_ACTIVITY_KEYS, ORDER_ACTIVITY_FALLBACK_KEY, buildShipEntry } from './FleetPictureLogic.js';
import { shipMarker, worstMarker, TRANSIT } from './ShipTreeLogic.js';
import { computePanelMode } from './TacticalDockLogic.js';
import { summarizeFleetGroup, countActionable, combatCheckOf } from './FleetGroupPanelLogic.js';
import { isShipPanelHudActive } from './ShipPanelHudLogic.js';
import { toggleOpenList, openListFor } from './LabelPinLogic.js';
import { doctrineNameKey } from '../data/FleetDoctrines.js';
import { systemIdOf } from '../utils/SystemScope.js';

/** Flaga kroku — `true` wyłącznie przy `features.fleetPanelHud === true` (brak klucza = OFF). */
export const isFleetPanelHudOn = (features) => features?.fleetPanelHud === true;
/** Panele T6 stoją na panelu statku T5 (idiom, geometria T3, tryb kompaktowy) — bez niego zostają dzisiejsze panele. */
export const isFleetPanelHudActive = (features) => isFleetPanelHudOn(features) && isShipPanelHudActive(features);

// Stałe (px logiczne) — wartości startowe = panel statku T5 po bramce. Strojenie z konsoli: `KOSMOS.fleetPanelHud.tune({ W: 210 })`.
export const FLEET_PANEL_HUD_DEFAULTS = Object.freeze({
  W: 200,                // szerokość panelu
  W_CONFIG: 260,         // konfigurator celu floty (picker Rusz / Atak uzbrojony)
  PAD_X: 6, PAD_Y: 5,    // margines treści w pasku
  LINE_GAP: 1,           // odstęp linii nazwy
  SECTION_GAP: 4,        // odstęp sekcji
  BAR_ALPHA: 0.72,       // tło — ciemny pasek bez ramki (jak przypięta etykieta HUD)
  SUB_ALPHA: 0.78,       // linie 9 px
  EYEBROW_ALPHA: 0.62, EYEBROW_SPACING: 1,
  CHIP_GAP: 6, CHIP_ROW_GAP: 2, CHIP_PAD_Y: 2, CHIP_HIT_PAD_X: 2,
  CHIP_ALPHA: 0.9, CHIP_HOVER_FILL: 0.18,
  GLYPH_GAP: 7,          // odstęp chipów-glifów (linia sterowania, koniec linii członka)
  MEMBER_PAD_Y: 1,       // linia członka — zapas nad i pod tekstem (strefa kliku)
  MEMBER_IDLE_ALPHA: 0.62, // glif członka bezczynnego (rola `dim`) / zadokowanego — krycie
  MEMBERS_MAX: 8,        // widoczne linie członków; więcej — lista przewijana kółkiem
  NAME_MAX_LINES: 2, RENAME_GAP: 4,
  LIST_MIN_H: 48, SCROLL_STEP: 0.5, SCROLLBAR_W: 2, BAR_TRACK_ALPHA: 0.35,
});
export const FLEET_PANEL_HUD = { ...FLEET_PANEL_HUD_DEFAULTS };

/** Strojenie stałych z konsoli (bramka): nieznane klucze pominięte; zwraca bieżące wartości. */
export function tuneFleetPanelHud(patch = {}) {
  for (const [k, v] of Object.entries(patch ?? {})) if (k in FLEET_PANEL_HUD_DEFAULTS && Number.isFinite(v)) FLEET_PANEL_HUD[k] = v;
  return { ...FLEET_PANEL_HUD };
}
export function resetFleetPanelHud() { Object.assign(FLEET_PANEL_HUD, FLEET_PANEL_HUD_DEFAULTS); return { ...FLEET_PANEL_HUD }; }

/** Strefy dzisiejszego panelu floty (inwentarz §5.9.1 I2) — bez stronicowania (`PAGING_ZONE_TYPES`) i tła `bg`. */
export const FLEET_PANEL_ZONE_TYPES = Object.freeze([
  'prevFleet', 'nextFleet', 'renameFleet', 'minimize', 'restore', 'closeFleet', 'doctrine', 'memberFocus', 'memberRemove',
  'bgMove', 'bgEngage', 'bgDock', 'bgUndock', 'bgReturn', 'bgStop', 'bgDisband',
]);
/** Strefy dzisiejszego panelu grupy (§5.9.1 I2) — bez stronicowania i tła. */
export const GROUP_PANEL_ZONE_TYPES = Object.freeze([
  'minimize', 'restore', 'assignFleet', 'focus', 'rename', 'remove', 'grpDock', 'grpUndock', 'grpRefuel', 'grpStop', 'grpRetreat',
]);
/** Stronicowanie dzisiejszych paneli — w T6 zastąpione przewijaniem listy członków (kółko nad panelem). */
export const PAGING_ZONE_TYPES = Object.freeze(['pageUp', 'pageDown']);
/** Pickery celu floty z `FleetCommandPanel` (`_armMovePicker`, `_armEngagePicker`) — konfigurator celu floty. */
export const FLEET_PICKER_INTENTS = Object.freeze(new Set(['fleetcmd_move', 'fleetcmd_engage']));

const low = (s) => String(s ?? '').toLocaleLowerCase(getLocale());
const zone = (type, data = {}) => ({ type, data });
/** Chip: `zone` — strefa jak w dzisiejszym panelu, `null` — nieaktywny (przygaszony, nieklikalny); `local` — akcja panelu T6. */
const chip = (id, label, z, enabled = !!z, extra = {}) => ({ id, label, enabled: enabled && !!(z || extra.local), zone: enabled ? z : null, ...extra });

// ── Mutex trzech paneli ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Powierzchnia zaznaczenia przy T6 (`UIManager._mapSurface`): przy aktywnym T6 — reguła Doku taktycznego
 * `computePanelMode` (flota > N ≥ 2 > lider): `fleetHud` — panel floty T6, `groupHud` — panel grupy T6, reszta bez zmian
 * (`vessel` — panel statku T5). Bramki dzisiejszych paneli (`fcFleetPanel`, `fcGroupPanel`) obowiązują; OFF — bez zmian.
 * @param {'none'|'vessel'|'group'} surface — `resolveMapSelectionSurface`
 * @param {{ features:object, fleetId?:string|null, vesselCount?:number, leadId?:string|null }} p
 * @returns {'none'|'vessel'|'group'|'fleetHud'|'groupHud'}
 */
export function fleetHudSurface(surface, { features, fleetId = null, vesselCount = 0, leadId = null } = {}) {
  if (!isFleetPanelHudActive(features)) return surface;
  const mode = computePanelMode({ leadId, selectedCount: vesselCount, fleetId });
  if (mode === 'fleet' && features?.fcFleetPanel) return 'fleetHud';
  if (surface === 'group' && features?.fcGroupPanel) return 'groupHud';
  return surface;
}

/** Zaznaczenie statku (setSelectedVesselId / addToSelection — każda powierzchnia) zdejmuje flotę — tylko przy aktywnym T6. */
export const dropFleetOnShipSelection = ({ features, vesselId = null, fleetId = null } = {}) =>
  isFleetPanelHudActive(features) && vesselId != null && fleetId != null;

/** Esc zamyka panel floty (zaznaczenie floty) — przy aktywnym T6, bez otwartego overlayu i okna DOM. */
export const escapeClosesFleetPanel = ({ features, fleetId = null, overlayOpen = false, modalOpen = false } = {}) =>
  isFleetPanelHudActive(features) && fleetId != null && overlayOpen !== true && modalOpen !== true;

/**
 * Reguła 546 dla floty: picker celu floty (Rusz / Atak) uzbrojony dla floty, której panel już nie pokazuje (zmiana
 * zaznaczenia floty albo statku) — zdjęty. Przy OFF — jak dziś (picker przeżywa zmianę zaznaczenia).
 * @param {{ features:object, picker:{metadata?:{intent?:string, fleetId?:string}}|null, fleetId:string|null }} p
 */
export function shouldDropFleetPicker({ features, picker = null, fleetId = null } = {}) {
  if (!isFleetPanelHudActive(features) || !picker) return false;
  const md = picker.metadata ?? {};
  return FLEET_PICKER_INTENTS.has(md.intent) && md.fleetId !== fleetId;
}

/** Czy picker celu jest uzbrojony dla floty `fleetId` (konfigurator celu floty). */
export function fleetPickerFor(picker, fleetId) {
  const md = picker?.metadata ?? null;
  return !!md && fleetId != null && FLEET_PICKER_INTENTS.has(md.intent) && md.fleetId === fleetId ? md.intent : null;
}

/**
 * Strojenie 1 (3): klik w PUSTĄ mapę zdejmuje flotę — panel floty znika jak panel statku i przypięcia (grupa N ≥ 2 znika już
 * z `clearSelection`). WYJĄTEK — uzbrojony picker: klik w mapę to cel (gałąź pickera `GameScene._handleTacticalLeftClick`
 * wraca przed zaznaczeniem; tu — obrona w głąb). Klik ciała / stacji zostawia flotę (D-TR-14, jak zaznaczenie statku).
 * Przy OFF — jak dziś (flota zostaje).
 */
export const dropFleetOnEmptyMapClick = ({ features, fleetId = null, pickerActive = false } = {}) =>
  isFleetPanelHudActive(features) && fleetId != null && pickerActive !== true;

/**
 * Strojenie 1 (4): baner pickera u góry ekranu ukryty, gdy panel T6 pokazuje konfigurator celu floty (podpowiedź tylko
 * w panelu) — picker Rusz / Atak uzbrojony dla floty z panelu, panel narysowany i niezwinięty (te same warunki co
 * `buildFleetPanelModel` → `config`). Zwinięty panel, overlay, brak panelu — baner widoczny. Przy OFF — jak dziś (baner).
 * @param {{ features:object, picker?:object|null, fleetId?:string|null, minimized?:boolean, panelShown?:boolean }} p
 */
export function pickerBannerHidden({ features, picker = null, fleetId = null, minimized = false, panelShown = false } = {}) {
  return isFleetPanelHudActive(features) && panelShown === true && minimized !== true && fleetPickerFor(picker, fleetId) != null;
}

// ── Kotwica przy wierszu (geometria T3 — `ShipPanelAnchorLogic`) ─────────────────────────────────────────────────────

/** Klucze wierszy prawego outlinera dla floty: węzeł floty, potem nagłówek jego sekcji (układ zwinięty / „W drodze”). */
export function fleetRowKeys(fleetId, tree) {
  if (fleetId == null) return [];
  const keys = [`fleet:${fleetId}`];
  const sec = tree?.fleetIndex?.get?.(fleetId) ?? null;
  if (sec === TRANSIT) keys.push('transit');
  else if (sec != null) keys.push(`system:${sec}`);
  return keys;
}

// ── Członkowie (lista) ──────────────────────────────────────────────────────────────────────────────────────────────

/** Znacznik członka → rola i krycie glifu (idiom HUD: kolory z ról; znacznik — jak kolor glifu w outlinerze, D-UI-9). */
export const MARKER_ROLE = Object.freeze({ combat: 'alert', noFuel: 'alert', moving: 'primary', docked: 'primary', idle: 'dim' });
function markerAlpha(marker) {
  return marker === 'docked' || marker === 'idle' ? FLEET_PANEL_HUD.MEMBER_IDLE_ALPHA : 1;
}

/** Wpięcia świata dla `buildShipEntry` (ten sam kształt co outliner, Dok i panel statku T5). */
export function pictureCtx(K) {
  const vm = K?.vesselManager;
  return {
    gameYear:      K?.timeSystem?.gameTime ?? 0,
    fleetSystem:   K?.fleetSystem ?? null,
    combatCheck:   combatCheckOf(K),   // predykat bramki MOS `not_in_combat` (jedno źródło z „Odwrotem” grupy — 562)
    isImmobilized: vm?.isImmobilized ? (v) => vm.isImmobilized(v) : null,
  };
}

function memberRow(v, { pc, leadId, chips, noteOf, orderTargetInfo }) {
  const e = buildShipEntry(v, pc) ?? {};
  const sys = systemIdOf(v);
  const marker = shipMarker({ ...e, systemId: sys });
  const ti = typeof orderTargetInfo === 'function' ? orderTargetInfo(v) : null;
  let target = null;
  if (ti) {
    const dist = Number.isFinite(ti.distAU) ? ti.distAU.toFixed(1) : '?';
    target = { text: `${ti.icon} ${t('fleetGroup.targetLine', ti.name, dist)}`, role: 'alert' };
  }
  return {
    id: v.id, glyph: e.glyph ?? ROLE_GLYPHS[getPrimaryRole(v)] ?? '○', text: low(v.name ?? v.id),
    marker, role: MARKER_ROLE[marker] ?? 'primary', alpha: markerAlpha(marker), lead: v.id === leadId,
    note: noteOf?.(v, sys) ?? null, chips, target, docked: v.position?.state === 'docked', systemId: sys, alerts: e.alerts ?? [],
  };
}

/** Słowo stanu floty (linia „N statków · lider: X · stan”): walka / bez paliwa > aktywny rozkaz > ruch / dok / bezczynna. */
export function fleetStateText(rows, fleet, pc) {
  const marker = worstMarker(rows.map((r) => r.marker));
  if (marker === 'combat') return t('fleetPicture.alert.combat');
  if (marker === 'noFuel') {
    const stranded = rows.some((r) => r.marker === 'noFuel' && (r.alerts ?? []).some((a) => a?.kind === 'stranded'));
    return t(stranded ? 'fleetPicture.alert.stranded' : 'fleetPicture.alert.immobilized');
  }
  const ord = fleet?.activeOrder?.type ?? null;
  if (ord) return t(ORDER_ACTIVITY_KEYS[ord] ?? ORDER_ACTIVITY_FALLBACK_KEY);
  if (marker === 'moving') return t('fleetPicture.state.inTransit');
  if (marker === 'docked') return t('fleetPicture.state.docked');
  return t('fleetPicture.state.idle');
}

// ── Model panelu floty (lustro `FleetCommandPanel.draw`) ────────────────────────────────────────────────────────────

/**
 * Model panelu floty — `null` dla braku floty (jak `FleetCommandPanel.draw`: `!fleet` → bez panelu).
 * @param {object} fleet — `FleetSystem.getFleet(id)`
 * @param {{ K:object, minimized?:boolean, picker?:object, orderTargetInfo?:Function, systemName?:Function }} env
 */
export function buildFleetPanelModel(fleet, env = {}) {
  if (!fleet?.id) return null;
  const K = env.K ?? null;
  const vm = K?.vesselManager ?? null;
  // Lustro `FleetCommandPanel._members`: członkowie żywi (bez wraków), w kolejności `memberIds`.
  const members = (fleet.memberIds ?? []).map((id) => vm?.getVessel?.(id)).filter((v) => v && !v.isWreck);
  const fleetId = fleet.id;
  const lead = members[0] ?? null;   // prowadzący — pierwszy żywy członek (decyzja 6 (a), Finding 272)
  const m = {
    kind: 'fleet', key: `fleet:${fleetId}`, fleetId, leadId: lead?.id ?? null, minimized: env.minimized === true,
    wide: false, top: { left: [], right: [] }, sub: null, info: [], doctrine: null, members: [], chips: [], orders: null, config: null,
  };
  m.name = { glyph: '⛬', text: low(fleet.name ?? '—'), rename: null };
  if (m.minimized) {
    // Lustro chipa zwiniętego (F6): jedyna strefa — `restore`.
    m.top.right.push(chip('restore', '+', zone('restore')));
    return m;
  }
  m.top.left.push(chip('prevFleet', '◀', zone('prevFleet', { id: '_pf' })), chip('nextFleet', '▶', zone('nextFleet', { id: '_nf' })));
  m.top.right.push(chip('minimize', '—', zone('minimize', { id: '_min' })), chip('closeFleet', '✕', zone('closeFleet', { id: '_cl' })));
  m.name.rename = zone('renameFleet', { id: '_rn' });
  const pc = pictureCtx(K);
  const leadSys = lead ? systemIdOf(lead) : null;
  const noteOf = (v, sys) => (v === lead ? null : sys == null ? t('rightOutliner.inTransit')
    : sys !== leadSys ? (env.systemName?.(sys) ?? sys) : null);
  m.members = members.map((v) => memberRow(v, {
    pc, leadId: lead?.id ?? null, noteOf, orderTargetInfo: env.orderTargetInfo,
    chips: [chip(`memberFocus:${v.id}`, '◎', zone('memberFocus', { id: v.id })), chip(`memberRemove:${v.id}`, '✕', zone('memberRemove', { id: v.id }))],
  }));
  m.sub = [t('fleet.shipsCount', members.length), lead ? t('fleetPanelHud.leader', low(lead.name ?? lead.id)) : null,
    low(fleetStateText(m.members, fleet, pc))].filter(Boolean).join(' · ');
  m.doctrine = { label: `${low(t('fleetCmd.doctrine'))}: ${low(t(doctrineNameKey(fleet.doctrine)))} ▾`, zone: zone('doctrine') };
  // Rozkazy (lustro F5): warunki aktywności co do znaku jak `FleetCommandPanel.draw`.
  const hasOrder = !!fleet.activeOrder;
  const inSpace = members.some((v) => v.position?.state !== 'docked');
  const hasDocked = members.some((v) => v.position?.state === 'docked');
  const any = members.length > 0;
  const act = (type, key, enabled, extra = {}) => { const label = t(key); return chip(type, label, zone(type, { label }), enabled, extra); };
  m.chips.push(act('bgDisband', 'fleetCmd.disband', true, { role: 'alert' }));   // dziś przycisk w stylu „danger”
  m.orders = { items: [
    act('bgMove', 'fleetCmd.move', any), act('bgEngage', 'fleetCmd.engage', any), act('bgDock', 'fleetCmd.dock', any),
    act('bgUndock', 'fleetCmd.undock', hasDocked), act('bgReturn', 'fleetCmd.return', inSpace), act('bgStop', 'fleetCmd.stop', hasOrder),
  ] };
  // Konfigurator celu floty — picker Rusz / Atak tej floty uzbrojony (dziś: baner u góry i klik w mapę).
  const intent = fleetPickerFor(env.picker ?? null, fleetId);
  if (intent) {
    m.wide = true;
    const verb = t(intent === 'fleetcmd_move' ? 'fleetCmd.move' : 'fleetCmd.engage');
    m.config = { intent, header: t('fleet.selectTargetFor', String(verb).toUpperCase()), hint: t('picker.point.instructions'),
      chips: [chip('cancelPicker', t('fleet.cancel'), null, true, { local: 'cancelPicker' })] };
  }
  return m;
}

// ── Model panelu grupy (lustro `FleetGroupPanel.draw`) ──────────────────────────────────────────────────────────────

/**
 * Model panelu grupy N ≥ 2 — `null` bez żywych statków gracza (jak `FleetGroupPanel.draw`).
 * @param {object[]} vessels — żywe statki gracza z zaznaczenia (lustro `_liveVessels`), w kolejności zaznaczenia
 * @param {{ K:object, leadId?:string|null, minimized?:boolean, orderTargetInfo?:Function }} env
 */
export function buildGroupPanelModel(vessels, env = {}) {
  const list = (vessels ?? []).filter(Boolean);
  if (!list.length) return null;
  const K = env.K ?? null;
  const vm = K?.vesselManager ?? null;
  const leadId = env.leadId ?? list[0].id;
  const lead = list.find((v) => v.id === leadId) ?? list[0];
  const ids = list.map((v) => v.id);
  const m = {
    kind: 'group', key: `group:${[...ids].sort().join(',')}`, ids, leadId: lead.id, minimized: env.minimized === true,
    wide: false, top: { left: [], right: [] }, sub: null, info: [], doctrine: null, members: [], chips: [], orders: null, config: null,
  };
  m.name = { glyph: '⛬', text: low(`${t('fleetPanelHud.group')} · ${t('fleet.shipsCount', list.length)}`), rename: null };
  if (m.minimized) {
    m.top.right.push(chip('restore', '+', zone('restore')));
    return m;
  }
  m.top.right.push(chip('minimize', '—', zone('minimize', { id: '_min' })));
  const summary = summarizeFleetGroup(list, { vesselManager: vm });
  const pc = pictureCtx(K);
  // Finding 562 — „Odwrót” tym samym predykatem co bramka MOS (`not_in_combat`) i dzisiejszy panel grupy (lustro co do znaku).
  const act = countActionable(list, { vesselManager: vm, combatCheck: pc.combatCheck });
  m.sub = t('fleetPanelHud.leader', low(lead.name ?? lead.id));
  // Linia zbiorcza (lustro G2): paliwo · utrzymanie · uzbrojenie; rezerwa i unieruchomione — osobne linie (dim / alarm).
  const segs = [
    `${low(t('fleetGroup.fuel'))} ${Math.round(summary.fuelPct * 100)}%`,
    `${low(t('fleetGroup.upkeep'))} ${t('fleetGroup.upkeepPerYear', Math.round(summary.totalUpkeep))}`,
    low(t('fleetGroup.weapons', summary.weaponsCount, summary.totalCount)),
  ];
  m.info.push({ text: segs.join(' · ') });
  // Rezerwa (W2-5) — osobna linia tekstem (w idiomie etykiet bez kolorowego emoji 📦): „w tym rezerwa: N kadł. · X Kr/rok”.
  if (summary.reserveCount > 0) {
    m.info.push({ text: `${low(t('fleet.reserveUpkeepRow'))}: ${t('fleet.reserveBill', summary.reserveCount, Math.round(summary.reserveUpkeep))}`, role: 'dim' });
  }
  if (summary.immobilizedCount > 0) m.info.push({ text: `⚠ ${t('fleetPicture.alert.immobilized')}: ${summary.immobilizedCount}`, role: 'alert' });
  m.members = list.map((v) => memberRow(v, {
    pc, leadId: lead.id, orderTargetInfo: env.orderTargetInfo,
    chips: [chip(`focus:${v.id}`, '◎', zone('focus', { id: v.id })), chip(`rename:${v.id}`, '✎', zone('rename', { id: v.id })),
      chip(`remove:${v.id}`, '✕', zone('remove', { id: v.id }))],
  }));
  const lbl = (type, key, enabled) => { const label = t(key); return chip(type, label, zone(type, { label }), enabled); };
  // „→ Flota” (G1) — tylko gdy `FleetSystem` istnieje (dziś przycisk nie istnieje bez niego — nie przygaszony).
  if (K?.fleetSystem) m.chips.push(lbl('assignFleet', 'fleetGroup.assignFleet', true));
  m.orders = { items: [
    lbl('grpDock', 'fleetGroup.actionDock', act.canDock > 0), lbl('grpUndock', 'fleetGroup.actionUndock', act.canUndock > 0),
    lbl('grpRefuel', 'fleetGroup.actionRefuel', act.canRefuel > 0), lbl('grpStop', 'fleetGroup.actionStop', act.canStop > 0),
    lbl('grpRetreat', 'fleetGroup.actionRetreat', act.canRetreat > 0),
  ] };
  return m;
}

// ── Strefy modelu (keeper — zbiór akcji ON = OFF; odczyt bramki) ────────────────────────────────────────────────────

/** Wszystkie AKTYWNE strefy dzisiejszych typów w modelu (akordeon rozkazów wliczony — jak w T5). */
export function modelZones(m) {
  if (!m) return [];
  const out = [];
  const push = (c) => { if (c?.enabled && c.zone) out.push(c.zone); };
  for (const c of [...m.top.left, ...m.top.right]) push(c);
  if (m.name?.rename) out.push(m.name.rename);
  if (m.doctrine?.zone) out.push(m.doctrine.zone);
  for (const r of m.members ?? []) for (const c of r.chips ?? []) push(c);
  for (const c of m.chips ?? []) push(c);
  for (const c of m.orders?.items ?? []) push(c);
  return out;
}

/** Klucz strefy do porównania zbiorów (typ + dane posortowane). */
export function zoneKey(z) {
  const d = z?.data ?? {};
  return `${z?.type}|${JSON.stringify(Object.keys(d).sort().reduce((o, k) => ((o[k] = d[k]), o), {}))}`;
}

// ── Akordeon rozkazów (lustro T5) ───────────────────────────────────────────────────────────────────────────────────

export const toggleOrders = (state, key) => toggleOpenList(state, key, 'orders');
export const ordersOpen = (state, key) => openListFor(state, key) === 'orders';

// ── Strefy kliku: chip > linia członka > linia nazwy > pasek (pochłania) ─────────────────────────────────────────────

/** @param {Array<{kind:'chip'|'member'|'name'|'body', x:number, y:number, w:number, h:number}>} zones */
export function fleetPanelHitAt(zones, x, y) {
  if (!Array.isArray(zones) || !zones.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const inside = (z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;
  for (const kind of ['chip', 'member', 'name', 'body']) {
    for (let i = zones.length - 1; i >= 0; i--) if (zones[i].kind === kind && inside(zones[i])) return zones[i];
  }
  return null;
}

/**
 * Wykonanie chipa — DZISIEJSZY handler co do metody: `_onHit(zone)` panelu floty (`FleetCommandPanel`) albo grupy
 * (`FleetGroupPanel`).
 * @returns {boolean}
 */
export function runFleetPanelAction(zone, { panel } = {}) {
  if (!zone?.type || typeof panel?._onHit !== 'function') return false;
  panel._onHit(zone);
  return true;
}

/**
 * Klik w linię członka (brief T6): zaznaczenie statku → panel statku T5, panel floty / grupy znika. Statek już zaznaczony
 * jako jedyny (np. po „→ Flota” z panelu statku) — tylko zdjęcie floty (bez polecenia kamery); inaczej reguła D-UI-5
 * (`select`) + mutex floty + ping zadokowanego — jak wiersz statku w prawym outlinerze.
 * @param {{ vesselIds?:string[], leadId?:string|null }} sel — `readClickSelection` sprzed kliku
 * @returns {'clearFleet'|'select'}
 */
export function memberClickPlan(sel, vesselId) {
  const ids = Array.isArray(sel?.vesselIds) ? sel.vesselIds : [];
  return ids.length === 1 && sel?.leadId != null && String(sel.leadId) === String(vesselId) ? 'clearFleet' : 'select';
}
