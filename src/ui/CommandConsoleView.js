// ARC KONSOLE K7-A — Dowództwo na szablonie konsoli: rysunek (KZ-Command: jedyna ścieżka Dowództwa, flaga zdjęta).
//
// Wołane przez `FleetManagerOverlay.draw` (jedyna ścieżka rysunku Dowództwa od KZ-Command). Szablon 4-strefowy (kierunek podpisany przez właściciela):
//   nagłówek — tytuł + czipy zakładek Dowództwa (zastępują własny pasek zakładek; strefa `tab` z dzisiejszym `data.tab`) + [ x ]
//   lista     — szukajka (DOM `<input>` z prostokąta strefy), grupowanie, floty, układy, role, sekcje — z licznikami
//   bohater   — tabela statków (12 dzisiejszych kolumn, sort, grupy, pole wyboru, „Pokaż”), linia kontekstu, pasek zbiorczy
//   inspektor — statek / flota / wrak w języku konsoli (K7-B, `CommandInspectorView`) albo podsumowanie zaznaczenia
//   pas       — oś czasu misji dla zaznaczenia (flota / zaznaczone / statek; bez wyboru — wiersze widoczne w tabeli)
// Pozostałe zakładki (Naziemne, Atlas, Logistyka) — od K7-C też w 4 strefach (`CommandPagesView`).
// Strefy trafień mają DZISIEJSZE typy i dane (handlery `_handleHit` bez zmian); nowa jest tylko `registryClearFilters`.
// Kolory wyłącznie przez role konsoli (`consoleRoles`).

import { THEME } from '../config/ThemeConfig.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t } from '../i18n/i18n.js';
import { consoleZones, consoleClockRect, insetRect, uiViewport } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawActionChip, drawConsoleTooltip,
  drawList, drawSelectBrackets, drawTabular, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { truncateText } from './HudLabelLogic.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';
import { buildRegistryRows, sortRows, filterRows, groupRows } from './FleetRegistryLogic.js';
import { buildTimelineRows } from './FleetPictureLogic.js';
import { defaultViewport, layoutTimelineRows, nowLineX, timelineTicks } from './TimelineLayout.js';
import { commandGroupChips, rowRole, fuelRole, registryColumnLayout, facetCounts, registryListRows, fleetListItems,
  contextParts, emptyState, focusGate, bulkGate, rowHintKey, timelineSubject, subjectLabel, multiSummary,
  roleShort, emptyColumnIds } from './CommandConsoleLogic.js';
import { drawInspector, summaryRows } from './CommandInspectorView.js';
import { groupStats } from './CommandInspectorLogic.js';
import { PAGES, drawAtlasPage, drawLogisticsPage, drawGroundPage } from './CommandPagesView.js';

// Układ konsoli Dowództwa (px logiczne). Tabela potrzebuje szerokości — lista i inspektor węższe niż domyślne.
export const CMD = Object.freeze({
  LIST_W: 200,
  INSP_W: 300,
  STRIP_H: 112,
  STRIP_COLLAPSED_H: 24,
  SEARCH_H: 18,
  CLEAR_W: 16,
  ROW_H: 20,            // wiersz tabeli (gęstość „akt technicznych”)
  HEAD_H: 16,           // nagłówki kolumn
  CELL_FONT: 10,        // dzisiejsza czcionka komórek rejestru
  HEAD_FONT: 9,
  LANE_H: 15,
  LANE_LABEL_W: 110,
  INSP_LINE_H: 15,
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const push = (ov, x, y, w, h, type, data = {}) => ov._hitZones.push({ x, y, w, h, type, data });

/** Etykiety ról i układów (te same klucze co dawny rejestr pełnej szerokości). */
const roleLabel = (role) => (role ? t(`fleetPicture.role.${role}`) : '—');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// RAMA
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export function drawCommandConsole(ov, ctx, W, H) {
  const roles = consoleRoles(THEME);
  const K = window.KOSMOS;
  const tactical = (ov._activeTab ?? 'tactical') === 'tactical';
  // K7-C: każda zakładka ma własny podział 4 stref (rejestr — tabela szeroka; Atlas / Logistyka / Jednostki — `PAGES`)
  const pg = tactical ? null : PAGES[ov._activeTab];
  const stripH = tactical ? (ov._timelineCollapsed ? CMD.STRIP_COLLAPSED_H : CMD.STRIP_H) : (pg?.stripH ?? 0);
  const z = consoleZones(ov._bounds, { listW: pg?.listW ?? CMD.LIST_W, inspW: pg?.inspW ?? CMD.INSP_W, stripH,
    clock: consoleClockRect(W, H, NAV_GROUPS.length) });
  ov.consoleZones = z;
  ov._cmdTip = null;
  ov._cmdDisabled = [];
  // skala UI do pozycjonowania pola DOM — liczona tu (rysunek); handler czyta zapamiętaną wartość
  if (typeof window !== 'undefined' && window.innerWidth) ov._uiScale = uiViewport(window.innerWidth, window.innerHeight).scale;
  const hz = ov._kitHoverZone;

  // (1) Nagłówek — czipy zakładek (strefa `tab`, dzisiejsze `data.tab`) i [ x ] (`close`)
  const hoverHdr = hz?.type === 'tab' ? hz.data?.tab : hz?.type === 'close' ? 'close' : null;
  const chips = commandGroupChips(ov._activeTab, GAME_CONFIG.FEATURES, t);
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('fleet.tacticalCommandTitle'), chips, hoverId: hoverHdr })) {
    if (h.type === 'close') push(ov, h.x, h.y, h.w, h.h, 'close', {});
    else push(ov, h.x, h.y, h.w, h.h, 'tab', { tab: h.id });
  }

  const vMgr = K?.vesselManager;
  const ms = K?.missionSystem ?? K?.expeditionSystem;
  const colMgr = K?.colonyManager;
  const allVessels = vMgr?.getAllVessels?.() ?? [];
  const activePid = colMgr?.activePlanetId;

  if (tactical) {
    ov._contentBounds = z.body;
    drawRegistryConsole(ov, ctx, z, roles, { vMgr, ms, colMgr, activePid, allVessels });
  } else if (ov._activeTab === 'atlas') {
    // K7-C: Atlas Gwiazd w 4 strefach (ciała aktywnego układu — decyzja właściciela 2026-11-17)
    drawAtlasPage(ov, ctx, z, roles);
  } else if (ov._activeTab === 'logistics') {
    // K7-C: Logistyka w 4 strefach (zlecenia transportowe; strefy `logi_*` dzisiejsze)
    drawLogisticsPage(ov, ctx, z, roles, colMgr);
  } else if (ov._activeTab === 'ground') {
    // K7-C: Jednostki w 4 strefach (kolonia strony lokalna; dzisiejsze strefy `ground:*`). Żadna strona Dowództwa nie stoi
    // już na nieprzezroczystym tle.
    ov._contentBounds = z.body;
    drawGroundPage(ov, ctx, z, roles);
  }

  // Podpowiedź (powód wyłączonej akcji, pełna treść uciętej komórki) — na wierzchu
  const mx = ov._regMouseX, my = ov._regMouseY;
  if (!ov._cmdTip) {
    const d = (ov._cmdDisabled ?? []).find((q) => inside(q.rect, mx, my));
    if (d) ov._cmdTip = { text: d.text ?? t(d.reasonKey, ...(d.args ?? [])), x: mx + 12, y: my + 14, tone: d.tone ?? 'alert' };
  }
  if (ov._cmdTip) drawConsoleTooltip(ctx, ov._cmdTip, z.frame, roles, { tone: ov._cmdTip.tone ?? 'primary' });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// REJESTR (zakładka taktyczna)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Dane rejestru tej klatki — te same funkcje i ten sam stan co ścieżka OFF (`_drawRegistry`). */
export function registryConsoleData(ov, allVessels) {
  const regCtx = ov._registryCtx();
  const gameYear = regCtx.pictureCtx.gameYear;
  const rowsAll = buildRegistryRows(allVessels, regCtx);
  const rows = sortRows(filterRows(rowsAll, ov._registryFilter), ov._registrySort.col, ov._registrySort.dir);
  const { items, visibleRows } = groupRows(rows, ov._registryGroupMode, ov._registryCollapsedGroups);
  const counts = facetCounts(rowsAll, ov._registryFilter);
  const fleetsRaw = window.KOSMOS?.fleetSystem?.listFleets?.() ?? [];
  return { regCtx, gameYear, rowsAll, rows, items, visibleRows, counts, fleetsRaw, fleets: fleetListItems(fleetsRaw) };
}

function drawRegistryConsole(ov, ctx, z, roles, env) {
  const d = registryConsoleData(ov, env.allVessels);
  ov._cmdRects = { list: z.list, hero: z.hero, inspector: z.inspector, strip: z.strip, table: null, search: null, timeline: null };
  drawListZone(ov, ctx, z.list, roles, d);
  drawHeroTable(ov, ctx, z.hero, roles, d);
  if (z.strip) drawTimelineStrip(ov, ctx, z.strip, roles, d, env.allVessels);
  drawInspectorZone(ov, ctx, z.inspector, roles, d, env);
}

// ── Lista: szukajka + grupy, floty, filtry z licznikami ─────────────────────────────────────────────────────────────

function drawListZone(ov, ctx, lz, roles, d) {
  const lh = drawZoneRule(ctx, lz, t('cmdConsole.listTitle'), roles);
  // Szukajka: pole + (gdy jest tekst) „×”. DOM `<input>` siada w `_cmdRects.search` (px logiczne → CSS w handlerze).
  const f = ov._registryFilter;
  const sy = lz.y + lh + 4;
  const sRect = { x: lz.x, y: sy, w: lz.w - (f.search ? CMD.CLEAR_W : 0), h: CMD.SEARCH_H };
  ov._cmdRects.search = sRect;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeSmall);
  const active = !!ov._registrySearchEl;
  ctx.fillStyle = f.search ? roles.primary : roles.dim;
  const label = `${t('cmdConsole.searchLabel').toUpperCase()}: ${f.search || t('cmdConsole.searchPlaceholder')}`;
  if (!active) ctx.fillText(fit(ctx, label, sRect.w - 6), sRect.x + 4, sy + CMD.SEARCH_H / 2);
  ctx.strokeStyle = active || f.search ? roles.primary : roles.dim;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sRect.x, sy + CMD.SEARCH_H - 0.5); ctx.lineTo(lz.x + lz.w, sy + CMD.SEARCH_H - 0.5); ctx.stroke();
  push(ov, sRect.x, sy, sRect.w, CMD.SEARCH_H, 'registrySearch', {});
  if (f.search) {
    const cx = lz.x + lz.w - CMD.CLEAR_W;
    ctx.fillStyle = ov._kitHoverZone?.type === 'registrySearchClear' ? roles.alert : roles.dim;
    ctx.textAlign = 'center';
    ctx.fillText('×', cx + CMD.CLEAR_W / 2, sy + CMD.SEARCH_H / 2);
    push(ov, cx, sy, CMD.CLEAR_W, CMD.SEARCH_H, 'registrySearchClear', {});
  }
  ctx.restore();

  // Pozycje listy (dzisiejsze czipy jako wiersze z licznikami)
  const rows = registryListRows({
    counts: d.counts, filter: f, groupMode: ov._registryGroupMode, fleets: d.fleets,
    selectedFleetId: ov._selectedFleetId ?? null,
    systemLabel: (c) => c.name ?? '—', roleLabel,
  }, t);
  const listRect = { x: lz.x, y: sy + CMD.SEARCH_H + 8, w: lz.w, h: Math.max(0, lz.y + lz.h - (sy + CMD.SEARCH_H + 8)) };
  const mx = ov._regMouseX, my = ov._regMouseY;
  const hovId = inside(listRect, mx, my) ? (ov._cmdListZones ?? []).find((q) => inside(q, mx, my))?.id ?? null : null;
  const renderRow = (c, r, rr, { hov }) => {
    const cy = rr.y + rr.h / 2;
    c.font = F(THEME.fontSizeSmall);
    let vw = 0;
    if (r.value) {
      c.fillStyle = r.active ? roles.primary : roles.dim;
      vw = drawTabular(c, r.value, rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X, cy, 'right') + 8;
    }
    c.fillStyle = r.active ? roles.primary : (r.dimmed || !r.zone ? roles.dim : roles.primary);
    c.globalAlpha = r.active || hov ? 1 : (r.dimmed ? 0.7 : 0.85);
    c.fillText(fit(c, r.label, rr.w - 2 * CONSOLE_KIT.ROW_PAD_X - vw), rr.x + CONSOLE_KIT.ROW_PAD_X, cy);
    c.globalAlpha = 1;
    if (r.active) drawSelectBrackets(c, rr, roles);
  };
  const res = drawList(ctx, listRect, rows, roles, { selectedId: null, hoverId: hovId, scroll: ov._cmdListScroll ?? 0,
    renderRow, underline: false });
  ov._cmdListScroll = res.scroll;
  const byId = new Map(rows.filter((r) => !r.group).map((r) => [r.id, r]));
  ov._cmdListZones = [];
  for (const zz of res.zones) {
    const r = byId.get(zz.id);
    if (!r?.zone) continue;
    ov._cmdListZones.push(zz);
    push(ov, zz.x, zz.y, zz.w, zz.h, r.zone.type, { ...r.zone.data });
  }
}

// ── Bohater: tabela statków ─────────────────────────────────────────────────────────────────────────────────────────

function drawHeroTable(ov, ctx, hz, roles, d) {
  drawZoneFrame(ctx, hz, roles);
  const inner = insetRect(hz, CONSOLE_KIT.BRACKET_ARM);
  const x = inner.x, w = inner.w;
  const mx = ov._regMouseX, my = ov._regMouseY;
  const f = ov._registryFilter;
  ctx.save();
  ctx.textBaseline = 'middle';

  // (a) Tytuł + linia kontekstu (co widać i dlaczego)
  let y = inner.y;
  ctx.font = F(THEME.fontSizeSmall, true);
  ctx.fillStyle = roles.primary;
  ctx.fillText(t('cmdConsole.heroTitle').toUpperCase(), x, y + 6);
  const sysName = f.systemKey != null ? (d.counts.systems.find((s) => s.key === f.systemKey)?.name ?? null) : null;
  const totalVisibleKinds = d.rowsAll.filter((r) => (r.kind === 'wreck' ? f.showWrecks : r.kind === 'contact' ? f.showContacts : true)).length;
  const parts = contextParts({ shown: d.rows.length, total: totalVisibleKinds, filter: f, systemName: sysName,
    roleName: f.role != null ? roleLabel(f.role) : null,
    sortLabel: colLabel(ov._registrySort.col), sortDir: ov._registrySort.dir }, t);
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = roles.dim;
  ctx.fillText(fit(ctx, parts.join('  ·  '), w), x, y + 20);
  y += 30;

  // (b) Pasek zbiorczy — stała linia (tabela nie skacze, gdy pojawia się zaznaczenie)
  const n = ov._multiSelectedIds.size;
  const gate = bulkGate(n);
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = n > 0 ? roles.primary : roles.dim;
  const selTxt = t('cmdConsole.bulkSelected', n).toUpperCase();
  ctx.fillText(selTxt, x, y + CONSOLE_KIT.CHIP_H / 2);
  let bx = x + ctx.measureText(selTxt).width + 14;
  const aLabel = t('cmdConsole.bulkAssign', n);
  const aw = Math.ceil(ctx.measureText(`[ ${aLabel.toUpperCase()} ]`).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
  const hovA = inside({ x: bx, y, w: aw, h: CONSOLE_KIT.CHIP_H }, mx, my);
  const ar = drawActionChip(ctx, bx, y, aw, roles, { label: aLabel, enabled: gate.ok, hover: hovA });
  if (gate.ok) push(ov, ar.x, ar.y, ar.w, ar.h, 'fleetAssignMenuOpen', {});
  else ov._cmdDisabled.push({ rect: ar, reasonKey: gate.reasonKey });
  bx += aw + CONSOLE_KIT.CHIP_GAP;
  if (n > 0) {
    const cLabel = t('cmdConsole.bulkClear');
    const cw = Math.ceil(ctx.measureText(`[ ${cLabel.toUpperCase()} ]`).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
    const cr = drawActionChip(ctx, bx, y, cw, roles, { label: cLabel, danger: true,
      hover: inside({ x: bx, y, w: cw, h: CONSOLE_KIT.CHIP_H }, mx, my) });
    push(ov, cr.x, cr.y, cr.w, cr.h, 'fleetClearMultiSelect', {});
  }
  y += CONSOLE_KIT.CHIP_H + 8;

  // (c) Nagłówki kolumn (sort klikiem — `registrySort`)
  const lay = registryColumnLayout(x, w, { shrink: emptyColumnIds(d.rows) });
  ctx.font = F(CMD.HEAD_FONT, true);
  for (const c of lay.cols) {
    const sorted = ov._registrySort.col === c.id;
    ctx.fillStyle = sorted ? roles.primary : roles.dim;
    const lbl = `${colLabel(c.id).toUpperCase()}${sorted ? (ov._registrySort.dir > 0 ? ' ▲' : ' ▼') : ''}`;
    const shown = fit(ctx, lbl, c.w - 4);
    ctx.fillText(shown, c.x, y + CMD.HEAD_H / 2);
    push(ov, c.x, y, c.w, CMD.HEAD_H, 'registrySort', { col: c.id });
    if (shown !== lbl && inside({ x: c.x, y, w: c.w, h: CMD.HEAD_H }, mx, my)) ov._cmdTip = { text: lbl, x: mx + 12, y: my + 14, tone: 'primary' };
  }
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + CMD.HEAD_H + 0.5); ctx.lineTo(x + w, y + CMD.HEAD_H + 0.5); ctx.stroke();
  y += CMD.HEAD_H + 3;

  // (d) Wiersze + grupy
  const table = { x, y, w, h: Math.max(0, inner.y + inner.h - y) };
  ov._cmdRects.table = table;
  const items = d.items;
  const rowH = CMD.ROW_H;
  const contentH = items.length * rowH;
  let sc = clampScroll(ov._registryScroll ?? 0, contentH, table.h);
  if (ov._pendingFocusVesselId) {   // 4d (Dok) — jednorazowe przewinięcie do statku po open({ focusVesselId })
    const idx = items.findIndex((it) => it.type === 'row' && it.row?.id === ov._pendingFocusVesselId);
    if (idx >= 0) {
      const top = idx * rowH;
      if (top < sc) sc = top;
      else if (top + rowH > sc + table.h) sc = top + rowH - table.h;
      sc = clampScroll(sc, contentH, table.h);
    }
    ov._pendingFocusVesselId = null;
  }
  ov._registryScroll = sc;
  const selId = window.KOSMOS?.uiManager?.getSelectedVesselId?.() ?? ov._selectedVesselId ?? null;
  const selFleetId = window.KOSMOS?.uiManager?.getSelectedFleetId?.() ?? ov._selectedFleetId ?? null;
  ctx.save();
  ctx.beginPath(); ctx.rect(table.x - 4, table.y, table.w + 8, table.h); ctx.clip();
  let ry = table.y - sc;
  for (const it of items) {
    if (ry + rowH > table.y && ry < table.y + table.h) {
      // strefy tylko w pasie widoku (clip nie przycina stref — Finding 110)
      const zy0 = Math.max(ry, table.y), zy1 = Math.min(ry + rowH, table.y + table.h);
      const zone = zy1 - zy0 >= rowH / 2 ? { y: zy0, h: zy1 - zy0 } : null;
      if (it.type === 'header') drawGroupHeader(ov, ctx, lay, x, ry, w, rowH, it, selFleetId, roles, zone);
      else drawTableRow(ov, ctx, lay, x, ry, w, rowH, it.row, selId, roles, zone, mx, my, table);
    }
    ry += rowH;
  }
  ctx.restore();

  // (e) Pusta tabela — powód i (gdy można) „wyczyść filtry”
  const empty = emptyState(d.rows.length, d.counts, f);
  if (empty) {
    ctx.font = F(THEME.fontSizeNormal);
    ctx.fillStyle = roles.dim;
    ctx.textAlign = 'center';
    ctx.fillText(t(empty.key), x + w / 2, table.y + 30);
    ctx.textAlign = 'left';
    if (empty.canClear) {
      ctx.font = F(THEME.fontSizeSmall);
      const lbl = t('cmdConsole.clearFilters');
      const cw = Math.ceil(ctx.measureText(`[ ${lbl.toUpperCase()} ]`).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
      const cx = Math.round(x + w / 2 - cw / 2), cy = table.y + 44;
      const r = drawActionChip(ctx, cx, cy, cw, roles, { label: lbl, hover: inside({ x: cx, y: cy, w: cw, h: CONSOLE_KIT.CHIP_H }, mx, my) });
      push(ov, r.x, r.y, r.w, r.h, 'registryClearFilters', {});
    }
  }
  // pasek przewijania 2 px
  const th = scrollThumb(sc, contentH, table.h, table.y);
  if (th) {
    const sx = hz.x + hz.w - CONSOLE_KIT.SCROLLBAR_W - 2;
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, table.y, CONSOLE_KIT.SCROLLBAR_W, table.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, th.y, CONSOLE_KIT.SCROLLBAR_W, th.h);
  }
  ctx.restore();
}

/** Etykieta kolumny: dzisiejsze klucze `registry.col_*`; paliwo i alarmy słowem zamiast emoji. */
function colLabel(id) {
  if (id === 'fuel') return t('cmdConsole.colFuel');
  if (id === 'alerts') return t('cmdConsole.colAlerts');
  return t(`registry.col_${id}`);
}

function drawGroupHeader(ov, ctx, lay, x, ry, w, rowH, it, selFleetId, roles, zone) {
  const isFleet = it.fleetId != null;
  const selected = isFleet && it.fleetId === selFleetId;
  const cy = ry + rowH / 2;
  ctx.font = F(CMD.CELL_FONT, true);
  ctx.fillStyle = roles.dim;
  ctx.fillText(it.collapsed ? '▸' : '▾', x + 2, cy);
  const label = it.isTransit ? t('cmdConsole.transit')
    : (it.label ?? t('registry.ungrouped'));
  ctx.fillStyle = selected || isFleet ? roles.primary : roles.dim;
  ctx.fillText(fit(ctx, `${label.toUpperCase()}  ×${it.count}`, w - 40), x + 16, cy);
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA;
  ctx.beginPath(); ctx.moveTo(x, ry + rowH - 0.5); ctx.lineTo(x + w, ry + rowH - 0.5); ctx.stroke();
  ctx.globalAlpha = 1;
  if (selected) drawSelectBrackets(ctx, { x: x - 4, y: ry, w: w + 8, h: rowH }, roles);
  if (!zone) return;
  push(ov, x - 4, zone.y, 18, zone.h, 'registryGroupToggle', { key: it.key });
  if (isFleet) push(ov, x + 14, zone.y, w - 14, zone.h, 'registryGroupFleet', { fleetId: it.fleetId });
  else push(ov, x + 14, zone.y, w - 14, zone.h, 'registryGroupToggle', { key: it.key });
}

function drawTableRow(ov, ctx, lay, x, ry, w, rowH, r, selId, roles, zone, mx, my, table) {
  const kind = r.kind ?? 'own';
  const isSel = r.id === selId;
  const isMulti = ov._multiSelectedIds.has(r.id);
  const cy = ry + rowH / 2;
  const rowRect = { x: x - 4, y: ry, w: w + 8, h: rowH };
  const hov = inside(table, mx, my) && inside(rowRect, mx, my);
  if (hov && !isSel && kind !== 'contact') {
    ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rowRect.x, ry, rowRect.w, rowH); ctx.globalAlpha = 1;
  }
  // pole wyboru — tylko własne żywe (wraki / kontakty tylko do odczytu, jak dziś)
  if (kind === 'own') {
    ctx.strokeStyle = isMulti ? roles.primary : roles.dim; ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, ry + rowH / 2 - 4.5, 9, 9);
    if (isMulti) { ctx.fillStyle = roles.primary; ctx.fillRect(x + 3.5, ry + rowH / 2 - 2.5, 5, 5); }
    if (zone) push(ov, x, zone.y, lay.check.w - 2, zone.h, 'vesselMultiToggle', { vesselId: r.id });
  }
  const role = rowRole(r);
  const cells = {
    name: [`${r.glyph ?? ''} ${r.name}`.trim(), role, true],
    role: [kind === 'wreck' ? t(r.isEnemy ? 'registry.enemyShort' : 'registry.ownShort') : roleShort(r.role, t).text, 'dim'],
    fleet: [r.fleetName ?? '—', 'dim'],
    system: [r.isTransit ? t('cmdConsole.transit') : (r.systemName ?? ''), r.isTransit ? 'primary' : 'dim'],
    body: [r.body ?? (kind === 'own' ? t('registry.bodyTransit') : '—'), 'dim'],
    state: [r.stateKey ? t(r.stateKey) : '—', role === 'alert' ? 'alert' : 'dim'],
    activity: [kind === 'wreck'
      ? (r.wreckedYear != null ? t('registry.wreckYear', Math.floor(r.wreckedYear)) : '—')
      : (r.activityKey ? `${t(r.activityKey)}${r.isLoop ? ' ↻' : ''}` : '—'), role === 'primary' ? 'primary' : 'dim'],
    from: [r.fromName ?? '—', 'dim'],
    to: [r.toName ?? '—', 'dim'],
    eta: [r.eta?.year == null ? '—' : `${r.eta.confidence === 'moving' ? '~' : ''}${Math.round(r.eta.year)}`, 'dim', false, true],
    fuel: [r.fuelPct == null ? '—' : `${Math.round(r.fuelPct * 100)}%`, fuelRole(r.fuelPct), false, true],
    alerts: [r.alertCount > 0 ? `!${r.alertCount}` : '', 'alert', false, true],
  };
  for (const c of lay.cols) {
    const [txt, tone, bold, tab] = cells[c.id];
    ctx.font = F(CMD.CELL_FONT, !!bold);
    ctx.fillStyle = roles[tone] ?? roles.dim;
    const maxW = c.w - 6;
    if (tab && ctx.measureText(txt).width <= maxW) drawTabular(ctx, txt, c.x, cy);
    else {
      const shown = fit(ctx, txt, maxW);
      ctx.fillText(shown, c.x, cy);
      // ucięta komórka pod kursorem → pełna treść w podpowiedzi
      if (hov && shown !== txt && mx >= c.x && mx <= c.x + c.w) ov._cmdTip = { text: txt, x: mx + 12, y: my + 14, tone: 'primary' };
    }
  }
  // K7-B — pełna nazwa roli pod kursorem (komórka pokazuje formę skróconą)
  const roleCol = lay.cols.find((q) => q.id === 'role');
  if (hov && kind !== 'wreck' && roleCol && mx >= roleCol.x && mx <= roleCol.x + roleCol.w && r.role) {
    ov._cmdTip = { text: roleShort(r.role, t).full, x: mx + 12, y: my + 14, tone: 'primary' };
  }
  if (isSel) {
    drawSelectBrackets(ctx, rowRect, roles);
    ctx.strokeStyle = roles.primary; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + lay.check.w, ry + rowH - 1.5); ctx.lineTo(lay.focus.x - 4, ry + rowH - 1.5); ctx.stroke();
  }

  // kontakt: zero akcji (jak dziś) — podpowiedź zamiast cichego braku reakcji
  const hint = rowHintKey(r);
  if (hint) { if (zone) ov._cmdDisabled.push({ rect: { x: rowRect.x, y: zone.y, w: rowRect.w, h: zone.h }, reasonKey: hint, tone: 'foreign' }); return; }
  if (!zone) return;
  // wiersz = wybór (wrak → raport bitwy w inspektorze)
  push(ov, lay.cols[0].x, zone.y, lay.focus.x - lay.cols[0].x, zone.h, 'vessel', { vesselId: r.id });
  // „Pokaż” (dzisiejsze 🎯) — JEDYNA droga z konsoli do statku (wiersz tylko zaznacza); plan z żywego statku
  const g = focusGate(r, ov._focusPlanFor ? ov._focusPlanFor(r.id) : undefined);
  if (!g) return;
  ctx.font = F(CMD.HEAD_FONT, true);
  const fr = { x: lay.focus.x, y: zone.y, w: lay.focus.w, h: zone.h };
  const hovF = inside(fr, mx, my);
  ctx.fillStyle = g.ok ? (hovF ? roles.primary : roles.dim) : roles.dim;
  ctx.globalAlpha = g.ok ? 1 : 0.45;
  ctx.fillText(fit(ctx, t('cmdConsole.focus').toUpperCase(), lay.focus.w - 4), lay.focus.x + 2, cy);
  ctx.globalAlpha = 1;
  if (g.ok) {
    push(ov, fr.x, fr.y, fr.w, fr.h, 'registryFocus', { vesselId: r.id, systemId: r.systemId });
    if (hovF) ov._cmdDisabled.push({ rect: fr, reasonKey: g.reasonKey, args: g.args, tone: 'primary' });
  } else {
    ov._cmdDisabled.push({ rect: fr, reasonKey: g.reasonKey, args: g.args });
  }
}

// ── Pas: oś czasu misji dla zaznaczenia ─────────────────────────────────────────────────────────────────────────────

function drawTimelineStrip(ov, ctx, sz, roles, d, allVessels) {
  const K = window.KOSMOS;
  const vById = new Map((allVessels ?? []).map((v) => [v.id, v]));
  const selV = ov._selectedVesselId ? vById.get(ov._selectedVesselId) : null;
  const fleet = ov._selectedFleetId ? (K?.fleetSystem?.getFleet?.(ov._selectedFleetId) ?? null) : null;
  const subj = timelineSubject({ selVesselId: selV ? selV.id : null, fleet, multiIds: [...ov._multiSelectedIds],
    visibleRows: d.visibleRows, vesselName: selV?.name ?? null });
  const label = `${ov._timelineCollapsed ? '▸' : '▾'} ${t('cmdConsole.stripTitle')} — ${subjectLabel(subj, t)}`;
  const sh = drawZoneRule(ctx, sz, label, roles);
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall);
  const lw = Math.min(sz.w, Math.ceil(ctx.measureText(label.toUpperCase()).width) + 8);
  ctx.restore();
  push(ov, sz.x, sz.y, lw, sh, 'timelineCollapse', {});
  if (ov._timelineCollapsed) return;

  if (!ov._timelineYears) {
    const dv = defaultViewport(d.gameYear, 0, 1);
    ov._timelineYears = { startYear: dv.startYear, endYear: dv.endYear };
  }
  const area = { x: sz.x, y: sz.y + sh + 2, w: sz.w, h: Math.max(0, sz.h - sh - 2) };
  const vp = { ...ov._timelineYears, x0: area.x + CMD.LANE_LABEL_W, x1: area.x + area.w - 4 };
  ov._cmdRects.timeline = { ...area, vx0: vp.x0, vx1: vp.x1 };
  ov._timelineBarZones = [];
  const tlVessels = subj.ids.map((id) => vById.get(id)).filter(Boolean);
  const laid = layoutTimelineRows(buildTimelineRows(tlVessels, d.fleetsRaw, d.gameYear), vp);
  const anyBars = laid.some((ln) => ln.bars.length > 0);
  ctx.save();
  ctx.textBaseline = 'middle';
  // podziałka + „teraz” — tylko gdy jest co pokazać (pusty stan = sam komunikat)
  ctx.font = F(THEME.fontSizeTiny ?? THEME.fontSizeSmall);
  for (const tick of anyBars ? timelineTicks(vp) : []) {
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.strokeStyle = roles.dim;
    ctx.beginPath(); ctx.moveTo(tick.x + 0.5, area.y + 10); ctx.lineTo(tick.x + 0.5, area.y + area.h); ctx.stroke();
    ctx.globalAlpha = 1; ctx.fillStyle = roles.dim; ctx.textAlign = 'center';
    drawTabular(ctx, String(Math.round(tick.year * 100) / 100), tick.x, area.y + 5, 'center');
  }
  ctx.textAlign = 'left';

  const lanesTop = area.y + 12;
  const visLanes = Math.max(0, Math.floor((area.y + area.h - lanesTop) / CMD.LANE_H));
  // temat „widoczne w tabeli” przewija się z tabelą (jak dziś); zaznaczenie — od początku, reszta jako „+N”
  const start = subj.kind === 'visible' ? Math.min(Math.max(0, laid.length - visLanes), Math.floor((ov._registryScroll ?? 0) / CMD.ROW_H)) : 0;
  if (!anyBars) {
    ctx.font = F(THEME.fontSizeSmall);
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, t('cmdConsole.stripEmpty'), area.w - 8), area.x + 4, lanesTop + 10);
  } else {
    ctx.beginPath(); ctx.rect(area.x, lanesTop, area.w, area.h - (lanesTop - area.y)); ctx.clip();
    for (let i = start; i < Math.min(laid.length, start + visLanes); i++) {
      const ln = laid[i];
      const ly = lanesTop + (i - start) * CMD.LANE_H;
      const v = vById.get(ln.entryId);
      ctx.font = F(THEME.fontSizeTiny ?? THEME.fontSizeSmall);
      ctx.fillStyle = ln.entryId === ov._selectedVesselId ? roles.primary : roles.dim;
      ctx.fillText(fit(ctx, v?.name ?? '', CMD.LANE_LABEL_W - 10), area.x + 4, ly + CMD.LANE_H / 2);
      ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim;
      ctx.fillRect(vp.x0, Math.round(ly + CMD.LANE_H / 2), vp.x1 - vp.x0, 1); ctx.globalAlpha = 1;
      for (const b of ln.bars) {
        const bw = Math.max(2, b.x1 - b.x0);
        const tone = b.kind === 'return' ? 'dim' : 'primary';
        ctx.globalAlpha = ln.confidence === 'moving' ? 0.55 : 0.9;
        ctx.fillStyle = roles[tone];
        ctx.fillRect(b.x0, ly + 2, bw, CMD.LANE_H - 5);
        ctx.globalAlpha = 1;
        if (bw > 40) {
          ctx.fillStyle = THEME.bgPrimary;
          ctx.fillText(fit(ctx, t(b.labelKey).toUpperCase(), bw - 6), b.x0 + 3, ly + CMD.LANE_H / 2);
        }
        const zone = { x: b.x0, y: ly + 2, w: bw, h: CMD.LANE_H - 5, labelKey: b.labelKey, vesselId: ln.entryId, kind: b.kind };
        ov._timelineBarZones.push(zone);
        push(ov, zone.x, zone.y, zone.w, zone.h, 'timelineBar', { vesselId: ln.entryId });
      }
    }
    const more = laid.length - (start + visLanes);
    if (subj.kind !== 'visible' && more > 0) {
      ctx.font = F(THEME.fontSizeTiny ?? THEME.fontSizeSmall);
      ctx.fillStyle = roles.dim;
      ctx.fillText(t('cmdConsole.stripMore', more), area.x + 4, area.y + area.h - 6);
    }
  }
  ctx.restore();
  const nx = anyBars ? nowLineX(d.gameYear, vp) : null;
  if (nx !== null) {
    ctx.strokeStyle = roles.primary; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(nx) + 0.5, area.y + 10); ctx.lineTo(Math.round(nx) + 0.5, area.y + area.h); ctx.stroke();
  }
  // pasek pod kursorem → etykieta (tylko do odczytu, jak dziś)
  const mx = ov._regMouseX, my = ov._regMouseY;
  const hb = ov._timelineBarZones.find((q) => inside(q, mx, my));
  if (hb) ov._cmdTip = { text: t(hb.labelKey), x: mx + 12, y: my - 26, tone: 'primary' };
}

// ── Inspektor: dzisiejszy panel albo podsumowanie zaznaczenia wielokrotnego ─────────────────────────────────────────

function drawInspectorZone(ov, ctx, iz, roles, d, env) {
  const ih = drawZoneRule(ctx, iz, t('cmdConsole.inspTitle'), roles);
  const body = { x: iz.x, y: iz.y + ih + 4, w: iz.w, h: Math.max(0, iz.h - ih - 4) };
  ov._cmdRects.inspBody = body;
  const multi = ov._multiSelectedIds.size > 0 && !ov._selectedVesselId && !ov._selectedFleetId;
  if (multi) { drawMultiSummary(ov, ctx, body, roles, d); return; }
  // K7-B: statek / flota / wrak w języku konsoli (te same strefy trafień co `_drawRight`)
  drawInspector(ov, ctx, body, roles, env);
}

function drawMultiSummary(ov, ctx, r, roles, d) {
  const s = multiSummary(d.rowsAll, [...ov._multiSelectedIds]);
  const mx = ov._regMouseX, my = ov._regMouseY;
  const c = { x: r.x, y: r.y, w: r.w - 6 };
  ctx.save();
  drawEyebrow(ctx, c.x, c.y, c.w, t('cmdConsole.multiTitle', s.count), roles);
  c.y += CONSOLE_KIT.EYEBROW_H + 4;
  const kv = (k, v, tone = 'primary') => { drawKvRow(ctx, c.x, c.y, c.w, k, String(v), roles, { tone }); c.y += CONSOLE_KIT.KV_H + 2; };
  summaryRows(ctx, c, roles, groupStats(ov._inspectorMemberStats([...ov._multiSelectedIds]), s.count));
  for (const rl of s.roles) kv(roleLabel(rl.role), `×${rl.n}`);
  kv(t('cmdConsole.multiSystems'), s.systems);
  kv(t('cmdConsole.multiCombat'), s.combat, s.combat > 0 ? 'alert' : 'dim');
  kv(t('cmdConsole.multiAlert'), s.alert, s.alert > 0 ? 'alert' : 'dim');
  kv(t('cmdConsole.multiLowFuel'), s.lowFuel, s.lowFuel > 0 ? 'alert' : 'dim');
  // akcje zbiorcze (te same strefy co pasek nad tabelą)
  c.y += 6;
  ctx.font = F(THEME.fontSizeSmall);
  const aLabel = t('cmdConsole.bulkAssign', s.count);
  const ar = drawActionChip(ctx, c.x, c.y, c.w, roles, { label: aLabel, enabled: s.count > 0,
    hover: inside({ x: c.x, y: c.y, w: c.w, h: CONSOLE_KIT.CHIP_H }, mx, my) });
  if (s.count > 0) push(ov, ar.x, ar.y, ar.w, ar.h, 'fleetAssignMenuOpen', {});
  else ov._cmdDisabled.push({ rect: ar, reasonKey: 'cmdConsole.bulkNeed' });
  c.y += CONSOLE_KIT.CHIP_H + 4;
  const cr = drawActionChip(ctx, c.x, c.y, c.w, roles, { label: t('cmdConsole.bulkClear'), danger: true,
    hover: inside({ x: c.x, y: c.y, w: c.w, h: CONSOLE_KIT.CHIP_H }, mx, my) });
  push(ov, cr.x, cr.y, cr.w, cr.h, 'fleetClearMultiSelect', {});
  c.y += CONSOLE_KIT.CHIP_H + 10;
  // nazwy — klik = wybór statku (dzisiejsza strefa `vessel`)
  drawEyebrow(ctx, c.x, c.y, c.w, t('cmdConsole.multiShips'), roles);
  c.y += CONSOLE_KIT.EYEBROW_H + 2;
  ctx.textBaseline = 'middle';
  const bottom = r.y + r.h;
  let shown = 0;
  for (const nm of s.names) {
    if (c.y + CMD.INSP_LINE_H > bottom - CMD.INSP_LINE_H) break;
    const rr = { x: c.x, y: c.y, w: c.w, h: CMD.INSP_LINE_H };
    const hov = inside(rr, mx, my);
    if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1; }
    ctx.font = F(THEME.fontSizeSmall);
    ctx.fillStyle = roles.primary;
    ctx.fillText(fit(ctx, nm.name, c.w - 8), c.x + 4, c.y + CMD.INSP_LINE_H / 2);
    push(ov, rr.x, rr.y, rr.w, rr.h, 'vessel', { vesselId: nm.id });
    c.y += CMD.INSP_LINE_H; shown++;
  }
  if (shown < s.names.length) {
    ctx.fillStyle = roles.dim;
    ctx.fillText(t('cmdConsole.multiMore', s.names.length - shown), c.x + 4, c.y + CMD.INSP_LINE_H / 2);
  }
  ctx.restore();
}
