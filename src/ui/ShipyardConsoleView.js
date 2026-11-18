// ShipyardConsoleView — rysunek Stoczni na szablonie konsoli (ARC KONSOLE, krok K1c-A; CONSOLES_PLAN.md §1.2, D-K-1/4/10/17;
// Finding 723 — Stocznia ignorowała układ 4-strefowy; 726 — picker modułów z surowymi kluczami tarcz i desantu).
//
// Wołane przez `ShipyardOverlay.draw` (jedyna ścieżka rysunku Stoczni od KZ-Shipyard). Strefy trafień mają
// DZISIEJSZE typy i dane (te same handlery w `ShipyardOverlay._onHit` i we wspólnym edytorze `overlays.unit_design`); nowy jest tylko
// `holo_view` (czipy [ 3D ] [ PLAN ]). Geometria wyłącznie z `consoleZones` (bez window.inner*), barwy wyłącznie z ról konsoli.
//
// (1) nagłówek: STOCZNIA + kontekst (aktywna kolonia · stocznia naziemna) + linia banera bramek S0/S1 + [ x ]; pasek walki w gnieździe
// (2) lista: zapisane projekty (wybór = wczytaj do projektanta; [ EDYTUJ ] [ USUŃ ]) + kadłuby (układ slotów, masa, blokady 🔒 / 🛰)
// (3) bohater: hologram projektu (model jak na mapie, D-K-10) + etykiety ról na kotwicach (K1b) + [ 3D ] [ PLAN ]
// (4) inspektor: sloty + picker modułów (przewijane) · staty z deltą przy najechaniu modułu · [ BUDUJ ] [ ZAPISZ ] [ WYCZYŚĆ ]
// (5) pas (pochylnia): budowy + Surge · oczekujące + anuluj (podpowiedź braków) · rezerwa + Rozmieść

import { THEME } from '../config/ThemeConfig.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS, getSlotCounts } from '../data/HullsData.js';
import { canBuildHullAt } from '../data/ShipBuildRules.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES, calcShipStats, calcShipCost } from '../data/ShipModulesData.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { TECHS } from '../data/TechData.js';
import { t, getName } from '../i18n/i18n.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { consoleZones, consoleClockRect, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawChipRow,
  drawList, drawSelectBrackets, chipLabel, CONSOLE_KIT, applyConsoleHalo, drawTabular } from './ConsoleKit.js';
import { consoleScrimAlpha, CONSOLE_GLASS } from './ConsoleSceneLogic.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { truncateText } from './HudLabelLogic.js';
import { clampScroll, pruneZones } from './InfoPanelLayoutLogic.js';
import { drawDesignAnchors } from './ShipAnchorOverlay.js';
import { designModelKey, HOLO_TUNING } from '../renderer/ShipHologramLogic.js';
import {
  MODULE_CATEGORY_ICONS, categoryLabelKey, designDelta, roleStacks, shipyardGate, templateBuildState, canAfford,
  buildTarget, hullPickerRows, fittedModules, fmtDelta, inspectorStatLayout, ACTION_REASON_LINES, deleteArmed, statDeltaSubSlots,
} from './ShipyardConsoleLogic.js';

// Wymiary ekranu (px logiczne). Pas wyższy niż domyślny 112 — trzy kolumny z wierszami dwulinijkowymi.
export const SHIPYARD_CONSOLE = {
  STRIP_H: 158,
  TPL_ROW_H: 46,     // wiersz projektu: nazwa + czipy / kadłub + staty / stan budowy
  HULL_ROW_H: 30,    // wiersz kadłuba: nazwa + układ / blokady
  SLOT_H: 20,
  MOD_H: 20,
  CAT_H: 16,
  STRIP_ROW_H: 44,
  HERO_PAD: 14,
  STRIP_COLS: [0.3, 0.3, 0.4],
  REASON_H: 13,      // K1c-B — linia powodu pod czipami akcji (stała rezerwa ACTION_REASON_LINES)
  DELTA_W: 64,       // K1c-B — stała kolumna delty bloku statystyk
};

const font = (size, bold = false) => `${bold ? 'bold ' : ''}${size}px ${THEME.fontFamily}`;
const fits = (ctx) => (s) => ctx.measureText(s).width;

/** Zawijanie po słowach do `maxLines` wierszy (ostatni przycięty wielokropkiem). */
function wrapText(ctx, text, w, maxLines = 2) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const wd of words) {
    const next = cur ? `${cur} ${wd}` : wd;
    if (ctx.measureText(next).width <= w || !cur) cur = next;
    else { lines.push(cur); cur = wd; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines);
    head[maxLines - 1] = truncateText(lines.slice(maxLines - 1).join(' '), w, fits(ctx));
    return head;
  }
  return lines.map((l) => truncateText(l, w, fits(ctx)));
}

function text(ctx, s, x, y, color, f = font(THEME.fontSizeSmall), align = 'left') {
  ctx.font = f; ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

const shipName = (id) => { const d = SHIPS[id] ?? HULLS[id]; return { icon: d?.icon ?? '🚀', name: d ? getName(d, 'ship') : id, def: d }; };
const techName = (id) => (TECHS[id] ? getName(TECHS[id], 'tech') : id);
const inRect = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

// ── Stan świata (czytany raz na klatkę) ─────────────────────────────────────────────────────────────────────────────────

function readWorld() {
  const K = window.KOSMOS;
  const colMgr = K?.colonyManager;
  const activePid = colMgr?.activePlanetId;
  const col = colMgr?.getColony?.(activePid) ?? null;
  const tSys = K?.techSystem;
  const hasExploration = tSys?.isResearched('exploration') ?? false;
  let shipyardLevel = 0;
  if (col?.buildingSystem) for (const [, e] of col.buildingSystem._active) if (e.building?.id === 'shipyard') shipyardLevel += e.level ?? 1;
  const queues = colMgr?.getShipQueues?.(activePid) ?? [];
  return {
    K, colMgr, activePid, col, tSys, hasExploration, shipyardLevel, queues,
    gate: shipyardGate({ hasExploration, shipyardLevel }),
    inv: col?.resourceSystem?.inventorySnapshot?.() ?? {},
    templates: K?.unitDesigns ?? [],
    researched: (id) => tSys?.isResearched(id) ?? false,
  };
}

function gateText(gate) {
  return gate === 'S0' ? t('fleet.shipyardRequiresTech') : gate === 'S1' ? t('fleet.shipyardNoBuild') : '';
}

/** Stan budowy szablonu w świecie `w` (lustro dzisiejszej reguły) + tekst powodu. */
function tplBuild(w, tpl) {
  const hull = HULLS[tpl.hullId];
  const mods = fittedModules(tpl.modules);
  const { cost, commodityCost } = calcShipCost(hull, mods);
  const st = templateBuildState({ hull, hullId: tpl.hullId, techResearched: w.researched, canBuildHullAt,
    queuesLen: w.queues.length, shipyardLevel: w.shipyardLevel, allAfford: canAfford({ ...cost, ...commodityCost }, w.inv) });
  let reason;
  if (w.gate) reason = gateText(w.gate);
  else if (st.state === 'tech') reason = `🔒 ${t('fleet.requiresTech', techName(st.techId))}`;
  else if (st.state === 'orbital') reason = `🛰 ${t('fleet.requiresOrbitalShipyard')}`;
  else if (st.state === 'full') reason = `⏳ ${t('fleet.shipyardFull', w.queues.length, w.shipyardLevel)}`;
  else if (st.state === 'queue') reason = `⏳ ${t('shipyardConsole.state.queue')}`;
  else reason = `🚀 ${t('shipyardConsole.state.build')}`;
  return { ...st, canClick: st.canClick && !w.gate, reason, mods, warn: !!w.gate || st.state === 'full' };
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export function drawShipyardConsole(ov, ctx, W, H) {
  const roles = consoleRoles(THEME);
  const w = readWorld();
  const ed = ov._getDesignEditor();
  const spec = { ...(CONSOLE_SCREEN_SPECS.shipyard ?? {}), stripH: SHIPYARD_CONSOLE.STRIP_H, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  ov._consoleScrollRects = {};
  ov._hoverPendingOrder = ov._hoverPendingOrder ?? null;
  ov._tplTooltip = null;   // K1c-B — podpowiedź wyłączonego [ BUDUJ ] (ustawiana w wierszu projektu)
  const hz = ov._hoverZone;

  drawHeader(ov, ctx, z, roles, w, hz);
  drawListZone(ov, ctx, z.list, roles, w, ed, hz);
  drawHero(ov, ctx, z.hero, roles, ed, w);
  drawInspector(ov, ctx, z.inspector, roles, w, ed, hz);
  drawStrip(ov, ctx, z.strip, roles, w, hz);

  // Podpowiedź braków oczekującego zamówienia — najwyżej w z-order (jak dziś)
  if (ov._hoverPendingOrder && ov._pendingColRect) {
    const r = ov._pendingColRect;
    ov._drawPendingOrderTooltip(ctx, r.x, r.y, r.w, r.h, ov._hoverPendingOrder, w.inv);
  }
  if (ov._tplTooltip) drawTooltip(ctx, ov._tplTooltip, z.frame, roles);
  // Tło-absorber klików NA KOŃCU (first-match: konkretne strefy wygrywają) — jak dziś
  ov._addHit(z.frame.x, z.frame.y, z.frame.w, z.frame.h, 'bg');
}

/** K1c-B — podpowiedź (powód wyłączonego [ BUDUJ ]): ramka konsoli pod czipem, w klamrze ramy ekranu. */
function drawTooltip(ctx, tip, frame, roles) {
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = font(THEME.fontSizeSmall);
  const pad = 6, tw = Math.ceil(ctx.measureText(tip.text).width), w = tw + 2 * pad, h = 20;
  const x = Math.max(frame.x, Math.min(tip.x, frame.x + frame.w - w)), y = Math.min(tip.y, frame.y + frame.h - h);
  ctx.globalAlpha = 0.94; ctx.fillStyle = THEME.bgPrimary; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  text(ctx, tip.text, x + pad, y + 14, roles.alert);
  ctx.restore();
}

// ── (1) Nagłówek ────────────────────────────────────────────────────────────────────────────────────────────────────────

function drawHeader(ov, ctx, z, roles, w, hz) {
  const hoverHdr = hz?.type === 'close' ? 'close' : null;
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('civPanel.shipyard'), chips: [], hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
  }
  // kontekst + baner bramki w tym samym paśmie, za tytułem
  const tr = z.title, cy = z.header.y + z.header.h / 2 + 4;
  ctx.save();
  ctx.font = font(THEME.fontSizeMedium, true);
  let x = tr.x + ctx.measureText(String(t('civPanel.shipyard')).toUpperCase()).width + 18;
  const colName = w.col?.name ?? w.activePid ?? '—';
  const ctxTxt = `${colName} · ${t('shipyardConsole.facilityGround')}`;
  ctx.font = font(THEME.fontSizeSmall);
  const room = Math.max(0, tr.x + tr.w - x);
  const ct = truncateText(ctxTxt, room, fits(ctx));
  text(ctx, ct, x, cy, roles.dim);
  x += ctx.measureText(ct).width + 18;
  if (w.gate) {
    const g = truncateText(gateText(w.gate), Math.max(0, tr.x + tr.w - x), fits(ctx));
    text(ctx, g, x, cy, roles.alert);
  }
  ctx.restore();
}

// ── (2) Lista: projekty + kadłuby ───────────────────────────────────────────────────────────────────────────────────────

function drawListZone(ov, ctx, lz, roles, w, ed, hz) {
  const S = SHIPYARD_CONSOLE;
  const hullRows = hullPickerRows({ hulls: HULLS, getSlotCounts, canBuildHullAt, techResearched: w.researched });
  const hullBlockH = 22 + hullRows.length * S.HULL_ROW_H;
  const hullTop = lz.y + Math.max(80, lz.h - hullBlockH);

  // projekty
  const tplH = drawZoneRule(ctx, lz, `${t('unitDesign.savedTemplates')} (${w.templates.length})`, roles);
  const tplRect = { x: lz.x, y: lz.y + tplH + 2, w: lz.w, h: Math.max(0, hullTop - 8 - (lz.y + tplH + 2)) };
  ov._consoleScrollRects.designs = tplRect;
  if (!w.templates.length) {
    ctx.save();
    const lines = wrapText((ctx.font = font(THEME.fontSizeSmall), ctx), t('unitDesign.noTemplates'), tplRect.w - 16, 3);
    lines.forEach((l, i) => text(ctx, l, tplRect.x + 8, tplRect.y + 18 + i * 14, roles.dim));
    ctx.restore();
  } else {
    const selId = ed?._editingTemplateId ?? null;
    const hoverIdx = hz?.type === 'tpl_row' ? hz.data?.index : null;
    const rows = w.templates.map((tpl, i) => ({ id: tpl.id, tpl, i }));
    const chipZones = [];
    const res = drawList(ctx, tplRect, rows, roles, {
      selectedId: selId, hoverId: hoverIdx != null ? w.templates[hoverIdx]?.id : null, scroll: ov._designsScroll ?? 0, rowH: S.TPL_ROW_H,
      underline: false,   // K1c-B (uwaga D) — wybrany projekt: same nawiasy, bez podkreślenia
      renderRow: (c, row, r) => drawTemplateRow(c, row, r, roles, w, chipZones, hz, ov),
    });
    ov._designsScroll = res.scroll;
    pruneZones(chipZones, 0, tplRect.y, tplRect.y + tplRect.h);
    for (const cz of chipZones) ov._addHit(cz.x, cz.y, cz.w, cz.h, cz.type, cz.data);
    for (const r of res.zones) {
      const row = rows.find((q) => q.id === r.id);
      ov._addHit(r.x, r.y, r.w, r.h, 'tpl_row', { index: row.i });
    }
  }

  // kadłuby
  const hz2 = { x: lz.x, y: hullTop, w: lz.w, h: lz.y + lz.h - hullTop };
  const hh = drawZoneRule(ctx, hz2, t('shipyardConsole.hulls'), roles);
  const hullRect = { x: hz2.x, y: hz2.y + hh + 2, w: hz2.w, h: Math.max(0, hz2.h - hh - 2) };
  const hoverHull = hz?.type === 'select_hull' ? hz.data?.hullId : null;
  const res = drawList(ctx, hullRect, hullRows, roles, {
    selectedId: ed?._selectedHullId ?? null, hoverId: hoverHull, scroll: 0, rowH: S.HULL_ROW_H,
    underline: false,   // K1c-B (bramka, decyzja 4) — wybrany kadłub: same nawiasy, jak lista projektów
    renderRow: (c, row, r) => drawHullRow(c, row, r, roles),
  });
  for (const r of res.zones) ov._addHit(r.x, r.y, r.w, r.h, 'select_hull', { hullId: r.id });
}

function drawTemplateRow(ctx, row, r, roles, w, chipZones, hz, ov) {
  const { tpl, i } = row;
  const hull = HULLS[tpl.hullId];
  const px = r.x + CONSOLE_KIT.ROW_PAD_X;
  if (!hull) { text(ctx, tpl.name, px, r.y + 14, roles.dim); return; }
  const b = tplBuild(w, tpl);
  const stats = calcShipStats(hull, b.mods);
  // K1c-B — czipy [ BUDUJ ] (dzisiejsza reguła karty szablonu; wyłączony — podpowiedź z powodem) i [ USUŃ ] → [ POTWIERDŹ ]
  // (drugi klik w DELETE_CONFIRM_MS). Strefy przed strefą wiersza — pierwsza wygrywa; klik w wiersz dalej wczytuje projekt.
  ctx.font = font(THEME.fontSizeSmall);
  const onRow = (tp) => hz?.type === tp && hz.data?.index === i;
  const armed = deleteArmed(ov?._delArm, tpl.id, ov?._now?.() ?? 0);
  const buildLbl = b.canQueue && !b.canBuildNow ? t('shipyardConsole.queue') : t('shipyardConsole.build');
  const delLbl = armed ? t('shipyardConsole.confirm') : t('unitDesign.delete');
  const cw = (s) => Math.ceil(ctx.measureText(chipLabel(s)).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
  const delW = cw(delLbl), buildW = cw(buildLbl);
  const delX = r.x + r.w - delW - 2, editX = delX - 4 - buildW;
  const canBuild = !!b.canClick;
  const chips = [
    canBuild
      ? { type: 'build_template', x: editX, w: buildW, label: buildLbl, col: roles.primary,
        data: { templateId: tpl.id, hullId: tpl.hullId, modules: b.mods, enabled: true }, hover: hz?.type === 'build_template' && hz.x === editX && hz.y === r.y + 3 }
      : { type: 'tpl_build_blocked', x: editX, w: buildW, label: buildLbl, col: roles.dim, data: { index: i, reason: b.reason }, hover: onRow('tpl_build_blocked') },
    { type: 'delete_template', x: delX, w: delW, label: delLbl, col: roles.alert, data: { index: i, label: t('unitDesign.delete') }, hover: onRow('delete_template'), armed },
  ];
  for (const c of chips) {
    const cr = { x: c.x, y: r.y + 3, w: c.w, h: CONSOLE_KIT.CHIP_H };
    if (c.hover && c.type !== 'tpl_build_blocked') { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = c.col; ctx.fillRect(cr.x, cr.y, cr.w, cr.h); ctx.globalAlpha = 1; }
    if (c.armed) { ctx.save(); ctx.strokeStyle = c.col; ctx.lineWidth = 1; ctx.strokeRect(cr.x + 0.5, cr.y + 0.5, cr.w - 1, cr.h - 1); ctx.restore(); }
    text(ctx, chipLabel(c.label), cr.x + CONSOLE_KIT.CHIP_PAD_X, cr.y + 13, c.col);
    chipZones.push({ ...cr, type: c.type, data: c.data });
    if (c.type === 'tpl_build_blocked' && c.hover && ov) ov._tplTooltip = { x: cr.x, y: cr.y + cr.h + 2, text: c.data.reason };
  }
  ctx.font = font(THEME.fontSizeNormal);
  text(ctx, truncateText(`${hull.icon} ${tpl.name}`, editX - px - 6, fits(ctx)), px, r.y + 15, roles.primary, font(THEME.fontSizeNormal));
  ctx.font = font(THEME.fontSizeSmall);
  const line2 = `${getName(hull, 'ship')} · ${t('shipyardConsole.modCount', b.mods.length)} · ⚡${stats.speed.toFixed(1)} 📦${stats.cargo}t 🎯${Math.round(stats.range)} ⚖${stats.totalMass}t`;
  text(ctx, truncateText(line2, r.w - 2 * CONSOLE_KIT.ROW_PAD_X, fits(ctx)), px, r.y + 29, roles.dim);
  text(ctx, truncateText(b.reason, r.w - 2 * CONSOLE_KIT.ROW_PAD_X, fits(ctx)), px, r.y + 42,
    b.warn ? roles.alert : (b.canClick ? roles.primary : roles.dim));
}

function drawHullRow(ctx, row, r, roles) {
  const hull = HULLS[row.id];
  const px = r.x + CONSOLE_KIT.ROW_PAD_X;
  const right = `${row.slots} · ${row.mass}t`;
  ctx.font = font(THEME.fontSizeSmall);
  const rw = ctx.measureText(right).width;
  text(ctx, right, r.x + r.w - CONSOLE_KIT.ROW_PAD_X, r.y + 13, roles.dim, font(THEME.fontSizeSmall), 'right');
  ctx.font = font(THEME.fontSizeNormal);
  text(ctx, truncateText(`${row.icon} ${getName(hull, 'ship')}`, r.w - rw - 2 * CONSOLE_KIT.ROW_PAD_X - 6, fits(ctx)), px, r.y + 13,
    roles.primary, font(THEME.fontSizeNormal));
  const locks = [];
  if (row.techLocked) locks.push(`🔒 ${t('fleet.requiresTech', techName(row.techId))}`);
  if (row.orbitalOnly) locks.push(`🛰 ${t('fleet.requiresOrbitalShipyard')}`);
  if (locks.length) {
    ctx.font = font(THEME.fontSizeTiny ?? THEME.fontSizeSmall - 1);
    text(ctx, truncateText(locks.join(' · '), r.w - 2 * CONSOLE_KIT.ROW_PAD_X, fits(ctx)), px, r.y + 26, roles.dim, ctx.font);
  }
}

// ── (3) Bohater: hologram + etykiety ról ────────────────────────────────────────────────────────────────────────────────

function drawHero(ov, ctx, hero, roles, ed, w) {
  drawZoneFrame(ctx, hero, roles);
  const r = insetRect(hero, SHIPYARD_CONSOLE.HERO_PAD);
  const hullId = ed?._selectedHullId ?? null;
  const hull = hullId ? HULLS[hullId] : null;
  if (!hull) {
    text(ctx, t('shipyardConsole.pickHull'), hero.x + hero.w / 2, hero.y + hero.h / 2, roles.dim, font(THEME.fontSizeMedium), 'center');
    return;
  }
  const mods = fittedModules(ed._slotAssignments);
  const tgt = buildTarget({ hullId, slotAssignments: ed._slotAssignments, editingId: ed._editingTemplateId, templates: w.templates });
  const tplName = tgt.index >= 0 ? w.templates[tgt.index]?.name : null;
  const head = [tplName ?? t('shipyardConsole.newDesign'), getName(hull, 'ship'), tgt.reason === 'modified' ? t('shipyardConsole.modified') : null]
    .filter(Boolean).join(' · ');
  // czipy widoku (prawy górny róg) — przed nazwą, żeby nazwa wiedziała, ile miejsca zostaje
  const view = ov._holoView === 'plan' ? 'plan' : '3q';
  ctx.font = font(THEME.fontSizeSmall);
  const chips = [{ id: '3q', label: t('shipyardConsole.view3d') }, { id: 'plan', label: t('shipyardConsole.viewPlan') }];
  const chipW = chips.reduce((s, c) => s + Math.ceil(ctx.measureText(chipLabel(c.label)).width) + 2 * CONSOLE_KIT.CHIP_PAD_X, 0) + CONSOLE_KIT.CHIP_GAP;
  const hov = ov._hoverZone?.type === 'holo_view' ? ov._hoverZone.data?.mode : null;
  let cx = r.x + r.w - chipW;
  for (const c of chips) {
    const lbl = chipLabel(c.label);
    const cw = Math.ceil(ctx.measureText(lbl).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
    const rc = { x: cx, y: r.y, w: cw, h: CONSOLE_KIT.CHIP_H };
    const on = c.id === view;
    if (hov === c.id && !on) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rc.x, rc.y, rc.w, rc.h); ctx.globalAlpha = 1; }
    text(ctx, lbl, rc.x + CONSOLE_KIT.CHIP_PAD_X, rc.y + 13, on ? roles.primary : roles.dim, font(THEME.fontSizeSmall));
    if (on) { ctx.save(); ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rc.x + 4, rc.y + rc.h - 0.5); ctx.lineTo(rc.x + rc.w - 4, rc.y + rc.h - 0.5); ctx.stroke(); ctx.restore(); }
    ov._addHit(rc.x, rc.y, rc.w, rc.h, 'holo_view', { mode: c.id });
    cx += cw + CONSOLE_KIT.CHIP_GAP;
  }
  ctx.font = font(THEME.fontSizeMedium, true);
  text(ctx, truncateText(head.toUpperCase(), r.w - chipW - 12, fits(ctx)), r.x, r.y + 13, roles.primary, ctx.font);

  const holoRect = { x: r.x, y: r.y + 26, w: r.w, h: Math.max(0, r.h - 26) };
  ov.heroHoloRect = holoRect;
  const holo = ov._ensureHologram?.();
  if (!holo) return;
  // K1c-B (uwaga A): bez auto-obrotu — statyczne 3/4, poza z myszy trzymana przez gospodarza (podmiana modelu jej nie zmienia)
  holo.setModel(designModelKey(hullId, mods));
  holo.setMode(view);
  holo.setSpin?.(false);
  holo.setPose?.(ov._holoPose);
  const state = { stacks: roleStacks(mods, SHIP_MODULES), view, roles };
  // K1c-B (§10.1): osobna kanwa pod UI — UI czyści prostokąt, warstwa maluje tło, przyciemnienie, hologram i etykiety
  const layerRect = ov._syncHeroLayer?.(ctx, holoRect, state);
  if (layerRect) { ov.heroHoloRect = layerRect; return; }
  ov.lastAnchors = paintHeroContent(ctx, holoRect, holo, state, { scrim: 0 });
}

// ── K1c-B: treść bohatera (wspólna dla warstwy hologramu i ścieżki w #ui-canvas) ──────────────────────────────────────────

/** Krycie zasłony konsoli, jaką UIManager maluje pod zakładką (warstwa pod UI musi ją powtórzyć w swoim prostokącie). */
export function heroScrimAlpha() {
  const u = window.KOSMOS?.uiManager;
  if (!u?.isConsoleSceneActive?.()) return 0;
  return consoleScrimAlpha(CONSOLE_SCREEN_SPECS.shipyard, CONSOLE_GLASS);
}

/** Etykieta modułu w liście roli («Laser ×6»). */
const moduleItemText = (it) => { const m = SHIP_MODULES[it.id]; const n = m ? getName(m) : it.id; return it.count > 1 ? `${n} ×${it.count}` : n; };

/**
 * Maluje tło (zasłona konsoli `scrim`), lokalne przyciemnienie (`HOLO_TUNING.heroDim` — miękka elipsa), hologram i etykiety ról
 * POZA obrysem kadłuba (widok 3/4; plan — układ K1b na widoku z boku). Zwraca wynik `drawDesignAnchors`.
 */
export function paintHeroContent(ctx, rect, holo, state, { scrim = 0 } = {}) {
  ctx.save();
  if (scrim > 0) { ctx.globalAlpha = scrim; ctx.fillStyle = THEME.bgPrimary; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
  const dim = Number(HOLO_TUNING.heroDim) || 0;
  if (dim > 0 && typeof ctx.createRadialGradient === 'function') {
    // elipsa: gradient w okręgu jednostkowym, skalowany do prostokąta (pełne przyciemnienie w środku, zero na krawędzi)
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.scale(rect.w / 2, rect.h / 2);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, THEME.bgPrimary); g.addColorStop(0.55, THEME.bgPrimary); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = dim; ctx.fillStyle = g;
    ctx.fillRect(-1, -1, 2, 2);
  }
  ctx.restore();
  holo.draw(ctx, rect);
  return drawDesignAnchors(ctx, holo, rect, state.stacks, {
    roles: state.roles, font: font(THEME.fontSizeSmall), smallFont: font(THEME.fontSizeTiny ?? THEME.fontSizeSmall - 1),
    itemText: moduleItemText, halo: applyConsoleHalo,
    hullBox: state.view === 'plan' ? undefined : (holo.projectHullBox?.(rect, ctx) ?? null),
  });
}

// ── (4) Inspektor: sloty + picker (przewijane), staty z deltą, akcje ───────────────────────────────────────────────────

function statRows(hull, mods, delta) {
  const s = calcShipStats(hull, mods);
  const { cost, commodityCost } = calcShipCost(hull, mods);
  const D = delta?.stats ?? {};
  const au = t('shipyardConsole.unit.au'), tn = t('shipyardConsole.unit.t'), pop = t('shipyardConsole.unit.pop');
  // K1c-B (uwaga B): STAŁY zestaw wierszy (`STAT_ROW_KEYS`) — brak wartości = «—», delta pusta bez najechania; najechanie
  // modułu zmienia wyłącznie teksty (układ: `inspectorStatLayout`).
  const pct = (v) => `${((v > 0 ? v : 0) * 100).toFixed(0)}%`;
  const num = (v) => `${Math.round(v > 0 ? v : 0)}`;
  const p100 = (v) => (Number.isFinite(v) ? v * 100 : undefined);
  const raw = delta?.raw ?? {};
  const mod = raw.damage != null ? { key: t('shipyardConsole.stat.moduleDamage'), val: `${raw.damage}` }
    : raw.strikeDamage != null ? { key: t('shipyardConsole.stat.moduleDamage'), val: `${raw.strikeDamage}` }
      : raw.shieldHP != null ? { key: t('shipyardConsole.stat.moduleShield'), val: `${raw.shieldHP} (+${raw.shieldRegen ?? 0})` }
        : { key: t('shipyardConsole.stat.module'), val: '—' };
  const costTxt = Object.entries(cost).filter(([, q]) => q > 0).map(([k, q]) => `${RESOURCE_ICONS[k] ?? k}${q}`).join(' ');
  const comTxt = Object.entries(commodityCost).filter(([, q]) => q > 0).map(([k, q]) => `${COMMODITIES[k]?.icon ?? ''}${q}`).join(' ');
  const dc = delta ? [...Object.entries(delta.cost), ...Object.entries(delta.commodity)]
    .map(([k, q]) => `${q > 0 ? '+' : '−'}${Math.abs(q)}${RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? k}`).join(' ') : '';
  const rows = {
    cargo: { key: t('shipyardConsole.stat.cargo'), val: `${Math.round(s.cargo)}`, unit: tn, d: fmtDelta(D.cargo), good: D.cargo > 0 },
    fuel: { key: t('shipyardConsole.stat.fuel'), val: `${s.fuelCapacity.toFixed(0)} · ${s.fuelType}`, unit: '', d: fmtDelta(D.fuelCapacity), good: D.fuelCapacity > 0 },
    warp: { key: t('shipyardConsole.stat.warp'), val: s.warpFuelCapacity > 0 ? `${s.warpFuelCapacity.toFixed(0)} · ${s.warpSpeedLY} ${t('shipyardConsole.unit.ly')}` : '—', unit: '', d: fmtDelta(D.warpFuelCapacity), good: D.warpFuelCapacity > 0 },
    mass: { key: t('shipyardConsole.stat.mass'), val: `${s.totalMass.toFixed(0)}`, unit: tn, d: fmtDelta(D.totalMass), good: D.totalMass < 0 },
    hpArmor: { key: t('shipyardConsole.stat.hpArmor'), val: `${Math.round(s.hp)} / ${Math.round(s.armor)}`, unit: '', dPair: [fmtDelta(D.hp), fmtDelta(D.armor)], good: (D.hp ?? 0) + (D.armor ?? 0) > 0 },
    survivalDiscovery: { key: `${t('shipyardConsole.stat.survival')} / ${t('shipyardConsole.stat.discovery')}`, val: `${pct(s.survivalBonus)} / ${pct(s.discoveryBonus)}`, unit: '',
      dPair: [fmtDelta(p100(D.survivalBonus)), fmtDelta(p100(D.discoveryBonus))], good: (D.survivalBonus ?? 0) + (D.discoveryBonus ?? 0) > 0 },
    colonistsTroops: { key: `${t('shipyardConsole.stat.colonists')} / ${t('shipyardConsole.stat.troops')}`, val: `${num(s.colonistCapacity)} / ${num(s.troopCapacity)}`, unit: '',
      dPair: [fmtDelta(D.colonistCapacity), fmtDelta(D.troopCapacity)], good: (D.colonistCapacity ?? 0) + (D.troopCapacity ?? 0) > 0 },
    module: { ...mod, unit: '', d: '', hot: mod.val !== '—' },
    crew: { key: t('shipyardConsole.stat.crew'), val: `${(hull.crewCost ?? 0).toFixed(1)}`, unit: pop, d: '' },
    upkeep: { key: t('shipyardConsole.stat.upkeep'), val: `${hull.upkeepCredits ?? 0}`, unit: t('shipyardConsole.unit.krYear'), d: '' },
    buildTime: { key: t('shipyardConsole.stat.buildTime'), val: `${hull.buildTime ?? 0}`, unit: t('shipyardConsole.unit.years'), d: '' },
    cost: { key: t('shipyardConsole.stat.cost'), text: costTxt || '—' },
    commodities: { key: t('shipyardConsole.stat.commodities'), text: comTxt || '—' },
    costDelta: { key: '', text: dc },
  };
  return { s, rows, D };
}

function drawInspector(ov, ctx, iz, roles, w, ed, hz) {
  const S = SHIPYARD_CONSOLE;
  const hullId = ed?._selectedHullId ?? null;
  const hull = hullId ? HULLS[hullId] : null;
  const mods = hull ? fittedModules(ed._slotAssignments) : [];
  const active = hull && ed._activeSlotIndex >= 0 && ed._activeSlotIndex < hull.slots.length ? ed._activeSlotIndex : -1;
  const hoverMod = hz?.type === 'pick_module' ? hz.data?.moduleId : null;
  const delta = hull && active >= 0 && hoverMod ? designDelta({ hull, slotAssignments: ed._slotAssignments, slotIndex: active,
    moduleId: hoverMod, calcShipStats, calcShipCost, modules: SHIP_MODULES }) : null;

  // ── blok dolny (staty + akcje) — K1c-B: układ STAŁY (`inspectorStatLayout`), niezależny od treści i od najechania ──
  const st = hull ? statRows(hull, mods, delta) : null;
  const instrH = THEME.fontSizeSmall + 8 + (THEME.fontSizeInstrument ?? 32) + 4 + THEME.fontSizeSmall;
  const reasons = actionReasons(w, ed, hull, mods);
  const lay = inspectorStatLayout(iz, { eyebrowH: CONSOLE_KIT.EYEBROW_H, instrH, kvH: CONSOLE_KIT.KV_H, chipH: CONSOLE_KIT.CHIP_H,
    reasonH: S.REASON_H, deltaW: S.DELTA_W });
  ov.lastStatLayout = hull ? lay : null;
  const by = hull ? lay.top : iz.y + iz.h - (CONSOLE_KIT.CHIP_H + 6 + ACTION_REASON_LINES * S.REASON_H);

  // ── góra: sloty + picker (przewijane) ──
  const th = drawZoneRule(ctx, iz, hull ? `${t('unitDesign.slots')} · ${mods.length}/${hull.slots.length}` : t('unitDesign.slots'), roles);
  const top = { x: iz.x, y: iz.y + th + 2, w: iz.w, h: Math.max(0, by - 8 - (iz.y + th + 2)) };
  ov._consoleScrollRects.inspector = top;
  if (!hull) {
    text(ctx, t('shipyardConsole.reason.noHull'), top.x + 8, top.y + 16, roles.dim);
  } else {
    const hitsBefore = ov._hitZones.length;
    ctx.save();
    ctx.beginPath(); ctx.rect(top.x, top.y, top.w, top.h); ctx.clip();
    let y = top.y - (ov._inspScroll ?? 0);
    const y0 = y;
    y = drawSlots(ov, ctx, top, y, roles, ed, hull, hz);
    if (active >= 0) y = drawPicker(ov, ctx, top, y + 6, roles, ed, hull, active, hz);
    ctx.restore();
    pruneZones(ov._hitZones, hitsBefore, top.y, top.y + top.h);
    const contentH = y - y0 + 8;
    ov._inspScroll = clampScroll(ov._inspScroll ?? 0, contentH, top.h);
  }

  // ── staty: każdy wiersz w swoim stałym prostokącie, delta w stałej kolumnie (cyfry tabelaryczne) ──
  if (st) {
    const hdr = delta ? t('shipyardConsole.deltaFor', getName(SHIP_MODULES[hoverMod] ?? { namePL: hoverMod, nameEN: hoverMod })) : t('unitDesign.statsPreview');
    drawEyebrow(ctx, lay.eyebrow.x, lay.eyebrow.y, lay.eyebrow.w, hdr, roles, { tone: delta ? 'primary' : 'dim' });
    const tone = (v, good) => (v ? (good ? 'primary' : 'alert') : 'dim');
    const [iS, iR] = lay.instruments;
    drawInstrument(ctx, iS.x, iS.y, roles, { label: t('shipyardConsole.stat.speed'), value: st.s.speed.toFixed(2), unit: t('shipyardConsole.unit.auYear'),
      delta: fmtDelta(st.D.speed, 2), deltaTone: tone(st.D.speed, st.D.speed > 0) });
    drawInstrument(ctx, iR.x, iR.y, roles, { label: t('shipyardConsole.stat.range'), value: st.s.range.toFixed(0), unit: t('shipyardConsole.unit.au'),
      delta: fmtDelta(st.D.range), deltaTone: tone(st.D.range, st.D.range > 0) });
    for (const L of lay.rows) {
      const r = st.rows[L.key];
      if (r.text !== undefined) {
        // koszt / towary / delta kosztu: etykieta po lewej, tekst do prawej krawędzi (przez kolumnę delty)
        ctx.font = font(THEME.fontSizeSmall);
        const kw = r.key ? ctx.measureText(r.key).width + 8 : 0;
        if (r.key) text(ctx, r.key, L.x, L.y + 12, roles.dim);
        if (r.text) text(ctx, truncateText(r.text, L.w + L.delta.w - kw, fits(ctx)), L.delta.x + L.delta.w, L.y + 12,
          L.key === 'costDelta' ? roles.alert : roles.primary, font(THEME.fontSizeSmall), 'right');
        continue;
      }
      drawKvRow(ctx, L.x, L.y, L.w, r.key, r.val, roles, { unit: r.unit, tone: 'primary' });
      if (r.d || r.dPair) {
        ctx.save(); ctx.font = font(THEME.fontSizeSmall); ctx.fillStyle = r.good ? roles.primary : roles.alert; ctx.textBaseline = 'middle';
        if (r.d) drawTabular(ctx, truncateText(r.d, L.delta.w - 4, fits(ctx)), L.delta.x + L.delta.w, L.y + L.h / 2, 'right');
        // pary (np. Koloniści / Desant): druga zmiana do prawej krawędzi kolumny delty (jak każdy wiersz), pierwsza do jej połowy
        const sub = statDeltaSubSlots(L.delta);
        (r.dPair ?? []).forEach((d, k) => { if (d) drawTabular(ctx, truncateText(d, sub[k].w - 2, fits(ctx)), sub[k].x + sub[k].w, L.y + L.h / 2, 'right'); });
        ctx.restore();
      }
    }
  }
  drawActions(ov, ctx, iz, hull ? lay.actions.y : by, roles, w, ed, hull, mods, reasons, hz);
}

function drawSlots(ov, ctx, top, y, roles, ed, hull, hz) {
  const S = SHIPYARD_CONSOLE;
  const hoverSlot = hz?.type === 'select_slot' || hz?.type === 'clear_slot' ? hz.data?.index : null;
  for (let i = 0; i < hull.slots.length; i++) {
    const slotDef = hull.slots[i];
    const modId = ed._slotAssignments[i];
    const mod = modId ? SHIP_MODULES[modId] : null;
    const r = { x: top.x, y, w: top.w - 4, h: S.SLOT_H };
    if (hoverSlot === i) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
    if (ed._activeSlotIndex === i) drawSelectBrackets(ctx, r, roles);
    const isP = slotDef.type === 'propulsion';
    text(ctx, isP ? 'P' : 'U', r.x + 6, y + 14, isP ? roles.alert : roles.primary, font(THEME.fontSizeSmall, true));
    if (mod) {
      text(ctx, truncateText(`${mod.icon} ${getName(mod)}`, r.w - 52, fits(ctx)), r.x + 22, y + 14, roles.primary, font(THEME.fontSizeSmall));
      text(ctx, '✕', r.x + r.w - 12, y + 14, roles.alert, font(THEME.fontSizeSmall, true), 'center');
      ov._addHit(r.x + r.w - 22, y, 22, S.SLOT_H, 'clear_slot', { index: i });
    } else {
      text(ctx, `${isP ? t('unitDesign.propulsionSlot') : t('unitDesign.utilitySlot')}…`, r.x + 22, y + 14, roles.dim, font(THEME.fontSizeSmall));
    }
    ov._addHit(r.x, y, r.w - 22, S.SLOT_H, 'select_slot', { index: i });
    y += S.SLOT_H;
  }
  return y;
}

function drawPicker(ov, ctx, top, y, roles, ed, hull, active, hz) {
  const S = SHIPYARD_CONSOLE;
  const isP = hull.slots[active].type === 'propulsion';
  y += drawEyebrow(ctx, top.x, y, top.w - 4, `${isP ? t('unitDesign.propulsionSlot') : t('unitDesign.utilitySlot')} — ${t('unitDesign.pickModule')}`, roles, { tone: 'primary' });
  const groups = {};
  for (const m of Object.values(SHIP_MODULES)) {
    if (isP ? m.slotType !== 'propulsion' : !UTILITY_SLOT_TYPES.has(m.slotType)) continue;
    (groups[m.slotType] ??= []).push(m);
  }
  const techSys = window.KOSMOS?.techSystem;
  const hoverMod = hz?.type === 'pick_module' ? hz.data?.moduleId : null;
  for (const [cat, mods] of Object.entries(groups)) {
    text(ctx, `${MODULE_CATEGORY_ICONS[cat] ?? ''} ${t(categoryLabelKey(cat))}`.toUpperCase(), top.x + 4, y + 12, roles.dim, font(THEME.fontSizeTiny ?? 9, true));
    y += S.CAT_H;
    for (const mod of mods) {
      const locked = mod.requires && !techSys?.isResearched(mod.requires);
      const r = { x: top.x + 8, y, w: top.w - 12, h: S.MOD_H };
      if (!locked && hoverMod === mod.id) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
      if (locked) {
        text(ctx, truncateText(`🔒 ${mod.icon} ${getName(mod)}`, r.w - 8, fits(ctx)), r.x + 4, y + 14, roles.dim, font(THEME.fontSizeTiny ?? 9));
      } else {
        const sum = ed._moduleStatSummary?.(mod) ?? '';
        ctx.font = font(THEME.fontSizeTiny ?? 9);
        const sw = sum ? ctx.measureText(sum).width : 0;
        text(ctx, sum, r.x + r.w - 4, y + 14, roles.dim, ctx.font, 'right');
        ctx.font = font(THEME.fontSizeSmall);
        text(ctx, truncateText(`${mod.icon} ${getName(mod)}`, r.w - sw - 14, fits(ctx)), r.x + 4, y + 14, roles.primary, ctx.font);
        ov._addHit(r.x, y, r.w, S.MOD_H, 'pick_module', { moduleId: mod.id });
      }
      y += S.MOD_H;
    }
  }
  return y;
}

/** Powody pod czipami akcji (kolejność: bramka → cel budowy → stan szablonu → brak napędu). */
function actionReasons(w, ed, hull, mods) {
  const out = [];
  if (!hull) return out;
  const tgt = buildTarget({ hullId: ed._selectedHullId, slotAssignments: ed._slotAssignments, editingId: ed._editingTemplateId, templates: w.templates });
  if (w.gate) out.push({ s: gateText(w.gate), alert: true });
  else if (tgt.reason) out.push({ s: t(`shipyardConsole.reason.${tgt.reason}`), alert: false });
  else {
    const b = tplBuild(w, tgt.tpl);
    if (b.state !== 'build') out.push({ s: b.reason, alert: b.warn });
  }
  if (!mods.some((id) => SHIP_MODULES[id]?.slotType === 'propulsion')) out.push({ s: `⚠ ${t('unitDesign.needEngine')}`, alert: true });
  return out;
}

function drawActions(ov, ctx, iz, y, roles, w, ed, hull, mods, reasons, hz) {
  const hasEngine = mods.some((id) => SHIP_MODULES[id]?.slotType === 'propulsion');
  const tgt = hull ? buildTarget({ hullId: ed._selectedHullId, slotAssignments: ed._slotAssignments, editingId: ed._editingTemplateId, templates: w.templates }) : null;
  const b = tgt?.tpl && !w.gate ? tplBuild(w, tgt.tpl) : null;
  const canBuild = !!b?.canClick;
  const chips = [
    { id: 'build', label: b?.canQueue && !b?.canBuildNow ? t('shipyardConsole.queue') : t('shipyardConsole.build'), state: canBuild ? 'normal' : 'disabled' },
    { id: 'save', label: t('unitDesign.saveTemplate'), state: hull && hasEngine ? 'normal' : 'disabled' },
    { id: 'clear', label: t('unitDesign.clear'), state: hull ? 'normal' : 'disabled' },
  ];
  const hov = hz?.type === 'build_template' ? 'build' : hz?.type === 'save_template' ? 'save' : hz?.type === 'clear_design' ? 'clear' : null;
  const res = drawChipRow(ctx, iz.x, y, iz.w, chips, roles, { hoverId: hov });
  for (const c of res.zones) {
    if (c.id === 'build') ov._addHit(c.x, c.y, c.w, c.h, 'build_template', { templateId: tgt.tpl.id, hullId: tgt.tpl.hullId, modules: b.mods, enabled: true });
    else if (c.id === 'save') ov._addHit(c.x, c.y, c.w, c.h, 'save_template', { label: t('unitDesign.saveTemplate') });
    else if (c.id === 'clear') ov._addHit(c.x, c.y, c.w, c.h, 'clear_design', { label: t('unitDesign.clear') });
  }
  let ry = y + res.h + 14;
  ctx.font = font(THEME.fontSizeSmall);
  for (const r of reasons.slice(0, ACTION_REASON_LINES)) { text(ctx, truncateText(r.s, iz.w, fits(ctx)), iz.x, ry, r.alert ? roles.alert : roles.dim); ry += SHIPYARD_CONSOLE.REASON_H; }
}

// ── (5) Pas: budowy · oczekujące · rezerwa ──────────────────────────────────────────────────────────────────────────────

function stripColumns(sz) {
  const gap = 12, cols = SHIPYARD_CONSOLE.STRIP_COLS;
  const avail = sz.w - gap * (cols.length - 1);
  let x = sz.x;
  return cols.map((f, i) => {
    const w = i === cols.length - 1 ? sz.x + sz.w - x : Math.floor(avail * f);
    const r = { x, y: sz.y, w, h: sz.h };
    x += w + gap;
    return r;
  });
}

/** Kolumna pasa: głowica + przewijane wiersze; `rows(ctx, y, body)` rysuje i zwraca dolną krawędź treści. */
function stripColumn(ov, ctx, col, key, label, right, roles, rows) {
  // etykieta przycięta tak, by zostało miejsce na wartość z prawej (rachunek rezerwy, sloty)
  ctx.font = font(THEME.fontSizeSmall);
  const rw = right ? ctx.measureText(right).width + 10 : 0;
  const h = drawZoneRule(ctx, col, truncateText(String(label).toUpperCase(), col.w - rw, fits(ctx)), roles);
  if (right) text(ctx, right, col.x + col.w, col.y + CONSOLE_KIT.EYEBROW_H - 4, roles.dim, font(THEME.fontSizeSmall), 'right');
  const body = { x: col.x, y: col.y + h + 2, w: col.w, h: Math.max(0, col.h - h - 2) };
  ov._consoleScrollRects[key] = body;
  ov._stripScroll ??= {};
  const hitsBefore = ov._hitZones.length;
  ctx.save();
  ctx.beginPath(); ctx.rect(body.x, body.y, body.w, body.h); ctx.clip();
  const y0 = body.y - (ov._stripScroll[key] ?? 0);
  const yEnd = rows(y0, body);
  ctx.restore();
  pruneZones(ov._hitZones, hitsBefore, body.y, body.y + body.h);
  ov._stripScroll[key] = clampScroll(ov._stripScroll[key] ?? 0, yEnd - y0, body.h);
  return body;
}

function drawStrip(ov, ctx, sz, roles, w, hz) {
  if (!sz) return;
  const S = SHIPYARD_CONSOLE;
  const [cA, cB, cC] = stripColumns(sz);
  const small = font(THEME.fontSizeSmall), tiny = font(THEME.fontSizeTiny ?? THEME.fontSizeSmall - 1);

  // A — aktywne budowy + Surge
  const usedSlots = w.queues.length || 1;
  const speedBonus = Math.max(1, Math.floor(w.shipyardLevel / usedSlots));
  const slots = w.gate ? '' : t('fleet.shipyardSlotsShort', w.queues.length, w.shipyardLevel) + (speedBonus > 1 ? ` ×${speedBonus}⚡` : '');
  stripColumn(ov, ctx, cA, 'builds', t('shipyardConsole.builds'), slots, roles, (y, body) => {
    if (w.gate) { ctx.font = small; wrapText(ctx, gateText(w.gate), body.w - 4, 3).forEach((l, i) => text(ctx, l, body.x + 2, y + 14 + i * 13, roles.alert, small)); return y + 44; }
    if (!w.queues.length) { text(ctx, t('shipyardConsole.noBuilds'), body.x + 2, y + 14, roles.dim, small); return y + 20; }
    w.queues.forEach((q, qi) => {
      const { icon, name, def } = shipName(q.shipId);
      const frac = q.buildTime > 0 ? Math.min(1, q.progress / q.buildTime) : 0;
      ctx.font = small;
      text(ctx, `${Math.round(frac * 100)}%`, body.x + body.w - 4, y + 13, roles.primary, small, 'right');
      text(ctx, truncateText(`${icon} ${name}`, body.w - 44, fits(ctx)), body.x + 2, y + 13, roles.primary, small);
      drawBar(ctx, body.x + 2, y + 18, body.w - 6, frac, roles);
      const maxSurge = def?.maxSurge ?? 1, surgeCount = q.surgeCount ?? 0, maxed = surgeCount >= maxSurge;
      const freePop = w.col?.civSystem?.freePops ?? 0, kr = w.col?.credits ?? 0;
      const canSurge = !maxed && freePop >= 0.5 && kr >= 500;
      const label = maxed ? t('fleet.surgeMax') : t('shipyardConsole.surge', surgeCount, maxSurge);
      const hov = hz?.type === 'surge_ship' && hz.data?.queueIndex === qi ? 'surge' : null;
      const res = drawChipRow(ctx, body.x + 2, y + 23, body.w - 4, [{ id: 'surge', label, state: canSurge ? 'normal' : 'disabled' }], roles, { hoverId: hov });
      for (const c of res.zones) ov._addHit(c.x, c.y, c.w, c.h, 'surge_ship', { planetId: w.activePid, queueIndex: qi });
      y += S.STRIP_ROW_H;
    });
    return y;
  });

  // B — oczekujące zamówienia (anuluj + podpowiedź braków)
  const pending = w.gate ? [] : (w.col?.pendingShipOrders ?? []);
  ov._pendingColRect = cB;
  stripColumn(ov, ctx, cB, 'pending', `⏳ ${t('fleet.pendingOrders')} (${pending.length})`, '', roles, (y, body) => {
    if (!pending.length) { text(ctx, w.gate ? '—' : t('shipyardConsole.none'), body.x + 2, y + 14, roles.dim, small); return y + 20; }
    for (const order of pending) {
      const { icon, name } = shipName(order.shipId);
      const miss = [];
      for (const [k, need] of Object.entries(order.cost ?? {})) {
        const have = w.inv[k] ?? 0;
        if (have < need) miss.push(`${RESOURCE_ICONS[k] ?? COMMODITIES[k]?.icon ?? ''}${Math.floor(have)}/${need}`);
      }
      const cxW = Math.ceil((ctx.font = small, ctx.measureText(chipLabel('x')).width)) + 2 * CONSOLE_KIT.CHIP_PAD_X;
      const cx = body.x + body.w - cxW - 2;
      const hovX = hz?.type === 'cancel_pending_ship' && hz.data?.orderId === order.id;
      if (hovX) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.alert; ctx.fillRect(cx, y + 2, cxW, CONSOLE_KIT.CHIP_H); ctx.globalAlpha = 1; }
      text(ctx, chipLabel('x'), cx + CONSOLE_KIT.CHIP_PAD_X, y + 15, roles.alert, small);
      ov._addHit(cx, y, cxW, S.STRIP_ROW_H - 4, 'cancel_pending_ship', { planetId: w.activePid, orderId: order.id });
      text(ctx, truncateText(`${icon} ${name}`, cx - body.x - 8, fits(ctx)), body.x + 2, y + 14, roles.primary, small);
      ctx.font = tiny;
      if (miss.length) text(ctx, truncateText(miss.slice(0, 4).join('  '), cx - body.x - 8, fits(ctx)), body.x + 2, y + 30, roles.alert, tiny);
      ov._addHit(body.x, y, cx - body.x - 2, S.STRIP_ROW_H - 4, 'pending_ship_hover', { order });
      y += S.STRIP_ROW_H - 4;
    }
    return y;
  });

  // C — rezerwa (kadłuby bez załogi) + Rozmieść
  const vMgr = w.K?.vesselManager;
  const rows = [];
  if (vMgr?.getAllVessels) for (const v of vMgr.getAllVessels()) {
    if (v.isWreck || isEnemyVessel(v)) continue;
    if ((v.serviceState ?? 'active') === 'active') continue;
    const dock = v.position?.dockedAt ?? null;
    if (dock !== w.activePid && v.homeColonyId !== w.activePid && v.colonyId !== w.activePid) continue;
    rows.push(v);
  }
  let bill = 0;
  for (const v of rows) bill += vMgr?.getVesselUpkeepCredits?.(v) ?? 0;
  const arrears = vMgr?.fleetInArrears?.() ?? false;
  stripColumn(ov, ctx, cC, 'reserve', `📦 ${t('fleet.reserveHeader')}`, rows.length ? t('fleet.reserveBill', rows.length, Math.round(bill)) : '', roles, (y, body) => {
    ctx.font = small;
    if (arrears && rows.length) {
      for (const l of wrapText(ctx, `⚠ ${t('fleet.deployBlockedArrears')}`, body.w - 4, 3)) { text(ctx, l, body.x + 2, y + 12, roles.alert, small); y += 13; }
      y += 4;
    }
    if (!rows.length) {
      wrapText(ctx, t('fleet.reserveEmpty'), body.w - 4, 3).forEach((l, i) => text(ctx, l, body.x + 2, y + 14 + i * 13, roles.dim, small));
      return y + 44;
    }
    for (const v of rows) {
      const { icon, def } = shipName(v.shipId);
      const mobilizing = (v.serviceState ?? 'active') === 'mobilizing';
      const btnLabel = `⚓ ${t('fleet.deployAction')}`;
      ctx.font = small;
      const bw = Math.ceil(ctx.measureText(chipLabel(btnLabel)).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
      const bx = body.x + body.w - bw - 2;
      text(ctx, truncateText(`${icon} ${v.name ?? v.shipId}`, bx - body.x - 8, fits(ctx)), body.x + 2, y + 14, roles.primary, small);
      if (mobilizing) {
        const prog = Math.max(0, Math.min(1, (v.mobilizeProgress ?? 0) / 1.0));
        drawBar(ctx, bx, y + 8, bw, prog, roles);
        text(ctx, v.mobilizeTarget === 'stored' ? t('fleet.withdrawing') : t('fleet.mobilizing'), bx, y + 22, roles.dim, tiny);
      } else if (!arrears) {
        const hov = hz?.type === 'deploy_vessel' && hz.data?.vesselId === v.id ? 'dep' : null;
        const res = drawChipRow(ctx, bx, y + 3, bw + 2, [{ id: 'dep', label: btnLabel }], roles, { hoverId: hov });
        for (const c of res.zones) ov._addHit(c.x, c.y, c.w, c.h, 'deploy_vessel', { vesselId: v.id });
      } else {
        drawChipRow(ctx, bx, y + 3, bw + 2, [{ id: 'dep', label: btnLabel, state: 'disabled' }], roles);
      }
      const crew = def?.crewCost ?? 0;
      const up = Math.round(vMgr.getVesselUpkeepCredits?.(v) ?? 0);
      ctx.font = tiny;
      wrapText(ctx, t('fleet.reserveRowInfo', crew.toFixed(1), up), (mobilizing ? bx - body.x - 8 : body.w - 4), 2).forEach((l, i) => text(ctx, l, body.x + 2, y + 28 + i * 11, roles.dim, tiny));
      y += S.STRIP_ROW_H + 4;
    }
    return y;
  });
}

/** Kółko myszy: przewija tę przewijaną część konsoli, nad którą jest kursor (prostokąty z ostatniej klatki). */
export function shipyardConsoleScroll(ov, delta, x, y) {
  const f = ov.consoleZones?.frame;
  if (!f || !inRect(f, x, y)) return false;
  const R = ov._consoleScrollRects ?? {};
  const step = delta * 0.5;
  if (inRect(R.designs, x, y)) ov._designsScroll = Math.max(0, (ov._designsScroll ?? 0) + step);
  else if (inRect(R.inspector, x, y)) ov._inspScroll = Math.max(0, (ov._inspScroll ?? 0) + step);
  else for (const k of ['builds', 'pending', 'reserve']) {
    if (inRect(R[k], x, y)) { ov._stripScroll ??= {}; ov._stripScroll[k] = Math.max(0, (ov._stripScroll[k] ?? 0) + step); }
  }
  return true;
}

