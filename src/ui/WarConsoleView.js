// WarConsoleView — Wojny na zestawie konsoli (ARC KONSOLE K2, docs/design/CONSOLES_PLAN.md §1.2; FEATURES.consoleDiplomacy).
//
// Wołane przez `WarOverlay.draw`, gdy `isKitScreen('war')`. Szablon 4-strefowy (D-K-1):
//  (1) nagłówek — WOJNY + czipy grupy [ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ] + [ x ];
//  (2) lista — wojny (dzisiejsza kolejność: aktywne, potem od najnowszej): przeciwnik, status, wyczerpanie obu stron, lata wojny;
//  (3) bohater — przeciąganie liny wyczerpania (ty kontra oni) z dzisiejszymi liczbami albo — przy negocjacjach — stół pokoju
//      (ŻĄDAM | OFERUJĘ, sufit, ważność warunków, reparacje); przełącznik [ PRZEBIEG WOJNY ] [ STÓŁ POKOJU ] (aktywna wojna);
//  (4) inspektor — casus belli, ostatnie bitwy, [ ZAPROPONUJ POKÓJ ] z dzisiejszą regułą (blokada po odmowie — powód w podpowiedzi).
// Finding 735: konsola NIE rysuje «WYMUŚ STARCIE / DESANT (debug)» — te same funkcje są pod `KOSMOS.debug.war.*`.
// Stół pokoju czyta TE SAME metody overlayu (`_ensureTable`, `_ensureEval`, `_selected`, `_reparations`, `_fmtVal`) i dokłada
// strefy dzisiejszych typów (`peace_toggle`, `reparations_toggle`, `peace_clear`). Geometria — `consoleZones`; kolory — role.

import { THEME } from '../config/ThemeConfig.js';
import { t, getName, getDesc } from '../i18n/i18n.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { CASUS_BELLI } from '../data/CasusBelliData.js';
import { REPARATIONS_YEARS } from '../data/OpinionModifierData.js';
import { clampScroll, scrollThumb, pruneZones } from './InfoPanelLayoutLogic.js';
import { consoleZones, consoleClockRect, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawActionChip,
  drawConsoleTooltip, drawList, chipLabel, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import { truncateText } from './HudLabelLogic.js';
import { intelDossier, systemMapPoints } from './EmpireListLogic.js';
import { drawEmpireMiniMap } from './ConsoleEmpireMap.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { warEntries, warOpponent, warRowView, warExhaustion, warYears, tugOfWar, warHeroMode, peaceActionView } from './WarConsoleLogic.js';

const WV = Object.freeze({
  HERO_INSET: 18,
  ROW_H: 46,          // wiersz listy wojen (dwie linie + paski)
  PAD_X: 10,
  TABLE_ROW_H: 18,    // wiersz stołu pokoju
  TUG_H: 6,           // lina
  TITLE_LINES: 2,     // nazwa przeciwnika w bohaterze — zawijana do 2 linii (dalej skrót)
  MAP_MIN_H: 120,     // mini-mapa w dolnej części bohatera tylko, gdy zostaje tyle wysokości
  LINE_H: 16,
});
const MARK_RECAP = '↩';
const MARK_LOCKED = '🔒';

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fits = (ctx) => (s) => ctx.measureText(s).width;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
function wrap(ctx, s, x, y, maxW, lineH, color) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  let line = '', cy = y;
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > maxW && line) { text(ctx, line, x, cy, color); cy += lineH; line = wd; } else line = test;
  }
  if (line) { text(ctx, line, x, cy, color); cy += lineH; }
  return cy;
}

export function drawWarConsole(ov, ctx, W, H) {
  const roles = consoleRoles(THEME);
  const K = window.KOSMOS;
  const ws = K?.warSystem;
  const reg = K?.empireRegistry;
  const spec = { ...(CONSOLE_SCREEN_SPECS.war ?? {}), stripH: 0, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  ov._consoleTooltip = null;
  const hz = ov._hoverZone;

  // (1) Nagłówek
  const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
  const grp = getNavGroup('war');
  const chips = (grp?.members ?? ['war']).map((id) => {
    const tab = CIV_TABS.find((tb) => tb.id === id);
    return { id, label: tab ? t(tab.labelKey) : id, active: id === 'war' };
  });
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('warConsole.title'), chips, hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
    else ov._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
  }

  // (2) Lista wojen
  const now = K?.timeSystem?.gameTime ?? 0;
  const wars = ws ? warEntries(ws.listAll()) : [];
  drawWarList(ov, ctx, z, roles, wars, reg, now, hz);

  // (3) Bohater + (4) inspektor
  drawZoneFrame(ctx, z.hero, roles);
  const war = ov._selectedId ? ws?.getWar(ov._selectedId) : null;
  if (!war) {
    drawZoneRule(ctx, z.inspector, '', roles);
    ctx.save();
    ctx.textBaseline = 'middle';
    const cx = z.hero.x + z.hero.w / 2, cy = z.hero.y + z.hero.h / 2;
    if (wars.length === 0) {
      text(ctx, t('warOverlay.noActiveWars'), cx, cy - 10, roles.dim, F(THEME.fontSizeMedium), 'center');
      text(ctx, t('warOverlay.declareHint'), cx, cy + 12, roles.dim, F(THEME.fontSizeSmall), 'center');
    } else {
      text(ctx, t('warOverlay.selectWar'), cx, cy, roles.dim, F(THEME.fontSizeMedium), 'center');
    }
    ctx.restore();
  } else {
    const empireId = warOpponent(war);
    const emp = reg?.get(empireId);
    const termsOnTable = ov._selected.size > 0 || ov._reparations;
    const mode = warHeroMode(war, ov._heroMode, termsOnTable);
    const hr = insetRect(z.hero, WV.HERO_INSET);
    const top = drawHeroModeChips(ov, ctx, hr, war, mode, roles, hz);
    if (mode === 'table') drawPeaceTable(ov, ctx, { ...hr, y: top, h: hr.y + hr.h - top }, war, empireId, roles, hz);
    else drawTug(ctx, { ...hr, y: top, h: hr.y + hr.h - top }, war, emp, now, roles, K, empireId);
    drawInspector(ov, ctx, z.inspector, war, empireId, roles, hz, K);
  }
  if (ov._consoleTooltip) drawConsoleTooltip(ctx, ov._consoleTooltip, z.frame, roles);
  // tło-absorber NA KOŃCU (first-match) — dzisiejszy typ `peace_bg` (świadomy no-op)
  ov._addHit(z.frame.x, z.frame.y, z.frame.w, z.frame.h, 'peace_bg');
}

function drawWarList(ov, ctx, z, roles, wars, reg, now, hz) {
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('warConsole.wars'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  if (wars.length === 0) {
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const cx = listRect.x + listRect.w / 2;
    text(ctx, t('warOverlay.noActiveWars'), cx, listRect.y + 34, roles.dim, F(THEME.fontSizeSmall), 'center');
    text(ctx, t('warOverlay.declareHint'), cx, listRect.y + 52, roles.dim, F(THEME.fontSizeSmall), 'center');
    ctx.restore();
    return;
  }
  const rows = wars.map((war) => {
    const emp = reg?.get(warOpponent(war));
    return warRowView(war, { emp, arch: emp ? ARCHETYPES[emp.archetype] : null, now });
  });
  const renderRow = (c, v, r) => {
    const PX = WV.PAD_X, cy1 = r.y + 13, cy2 = r.y + 30;
    c.textBaseline = 'middle';
    c.fillStyle = v.archColor ?? roles.dim;
    c.beginPath(); c.arc(r.x + PX, cy1, 4, 0, Math.PI * 2); c.fill();
    c.font = F(THEME.fontSizeSmall);
    const st = t(v.statusKey);
    const stW = c.measureText(st).width;
    text(c, st, r.x + r.w - PX, cy1, v.active ? roles.alert : roles.dim, null, 'right');
    c.font = F(THEME.fontSizeNormal, true);
    text(c, truncateText(v.name, r.w - 2 * PX - 18 - stW, fits(c)), r.x + PX + 10, cy1, v.active ? roles.primary : roles.dim);
    // wyczerpanie: ty | oni (mini-paski) + lata wojny
    c.font = F(THEME.fontSizeSmall);
    const yrs = t('warConsole.yearsAtWar', v.years.toFixed(1));
    const yW = c.measureText(yrs).width;
    text(c, yrs, r.x + r.w - PX, cy2, roles.dim, null, 'right');
    const bw = Math.max(10, Math.floor((r.w - 2 * PX - 10 - yW - 16) / 2));
    drawBar(c, r.x + PX + 10, cy2 - 1, bw, v.mine / 100, roles, { tone: 'primary', h: 3 });
    drawBar(c, r.x + PX + 10 + bw + 8, cy2 - 1, bw, v.theirs / 100, roles, { tone: 'alert', h: 3 });
  };
  const hoverId = hz?.type === 'select' ? hz.data?.warId : null;
  const res = drawList(ctx, listRect, rows, roles, { selectedId: ov._selectedId, hoverId, scroll: ov._scrollLeft, rowH: WV.ROW_H, renderRow });
  ov._scrollLeft = res.scroll;
  for (const r of res.zones) ov._addHit(r.x, r.y, r.w, r.h, 'select', { warId: r.id });
}

/** Przełącznik trybu bohatera (tylko aktywna wojna). Zwraca górę treści bohatera. */
function drawHeroModeChips(ov, ctx, r, war, mode, roles, hz) {
  if (!war.active) return r.y;
  const K = CONSOLE_KIT;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  const items = [{ id: 'status', label: t('warConsole.course') }, { id: 'table', label: t('peaceTable.title') }];
  let x = r.x + r.w;
  const cy = r.y + K.CHIP_H / 2;
  for (const it of [...items].reverse()) {
    const txt = chipLabel(it.label);
    const w = Math.ceil(ctx.measureText(txt).width) + 2 * K.CHIP_PAD_X;
    x -= w;
    const on = it.id === mode;
    const rr = { x, y: r.y, w, h: K.CHIP_H };
    if (!on && hz?.type === 'hero_mode' && hz.data?.mode === it.id) {
      ctx.globalAlpha = K.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1;
    }
    text(ctx, txt, x + K.CHIP_PAD_X, cy, on ? roles.primary : roles.dim);
    if (on) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(rr.x + K.CHIP_PAD_X, rr.y + rr.h - 0.5); ctx.lineTo(rr.x + rr.w - K.CHIP_PAD_X, rr.y + rr.h - 0.5); ctx.stroke(); }
    ov._addHit(rr.x, rr.y, rr.w, rr.h, 'hero_mode', { mode: it.id });
    x -= K.HEADER_CHIP_GAP;
  }
  ctx.restore();
  return r.y + K.CHIP_H + 8;
}

/** Nazwa zawijana po słowach do `maxLines` linii; ostatnia linia skracana, gdy tekst się nie mieści. */
function wrapLines(ctx, s, maxW, maxLines) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width <= maxW || !line) { line = test; continue; }
    if (lines.length === maxLines - 1) { line = words.slice(i - line.split(' ').length).join(' '); break; }   // reszta → ostatnia linia
    lines.push(line); line = words[i];
  }
  if (line) lines.push(line);
  if (lines.length) lines[lines.length - 1] = truncateText(lines[lines.length - 1], maxW, fits(ctx));
  return lines;
}

/**
 * Przebieg wojny: nazwa przeciwnika (nagłówek mówi już WOJNY), status + lata, instrumenty wyczerpania (ty | oni), lina,
 * dzisiejsze liczby (rok, czas, bitwy); niżej mini-mapa K0b-1 — znane układy przeciwnika kontra twoje (ta sama mgła co Wywiad).
 */
function drawTug(ctx, r, war, emp, now, roles, K = null, empireId = null) {
  const ex = warExhaustion(war);
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16); ctx.clip();
  ctx.textBaseline = 'alphabetic';
  let y = r.y;
  y += drawEyebrow(ctx, r.x, y, r.w, t('warConsole.course'), roles) + 6;
  const big = THEME.fontSizeInstrument ?? 2 * THEME.fontSizeLarge;
  ctx.font = F(big, true);
  for (const ln of wrapLines(ctx, emp?.name ?? '???', r.w, WV.TITLE_LINES)) {
    text(ctx, ln, r.x, y + big, war.active ? roles.primary : roles.dim);
    y += big + 6;
  }
  y += 8;
  ctx.font = F(THEME.fontSizeNormal, true);
  const st = `[ ${t(war.active ? 'warOverlay.statusActive' : 'warOverlay.statusEnded')} ]`;
  text(ctx, st, r.x, y + THEME.fontSizeNormal, war.active ? roles.alert : roles.dim);
  text(ctx, t('warConsole.yearsAtWar', warYears(war, now).toFixed(1)), r.x + ctx.measureText(st).width + 14, y + THEME.fontSizeNormal,
    roles.dim, F(THEME.fontSizeSmall));
  y += THEME.fontSizeNormal + 22;
  // instrumenty: ty | oni
  const gap = 28, cw = Math.floor((r.w - gap) / 2);
  const toneOf = (v) => (v >= 70 ? 'alert' : v >= 40 ? 'dim' : 'primary');
  const i1 = drawInstrument(ctx, r.x, y, roles, { label: `${t('warOverlay.exhaustionHeader')} · ${t('warConsole.you')}`,
    value: String(Math.round(ex.mine)), unit: '/ 100', tone: toneOf(ex.mine) });
  const i2 = drawInstrument(ctx, r.x + cw + gap, y, roles, { label: `${t('warOverlay.exhaustionHeader')} · ${t('warConsole.them')}`,
    value: String(Math.round(ex.theirs)), unit: '/ 100', tone: toneOf(ex.theirs) });
  y += Math.max(i1.h, i2.h) + 18;
  // lina: środek = równowaga; znacznik przesuwa się w stronę strony z przewagą (mniej wyczerpanej)
  const tug = tugOfWar(ex.mine, ex.theirs);
  const pos = 0.5 - tug.offset * 0.5;
  const tone = tug.edge === 'you' ? 'primary' : tug.edge === 'them' ? 'alert' : 'dim';
  drawBar(ctx, r.x, y, r.w, 0, roles, { h: WV.TUG_H });
  ctx.fillStyle = roles[tone];
  const a = Math.min(0.5, pos), b = Math.max(0.5, pos);
  ctx.fillRect(Math.round(r.x + r.w * a), y, Math.max(1, Math.round(r.w * (b - a))), WV.TUG_H);
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  const mid = Math.round(r.x + r.w / 2) + 0.5;
  ctx.beginPath(); ctx.moveTo(mid, y - 4); ctx.lineTo(mid, y + WV.TUG_H + 4); ctx.stroke();
  ctx.strokeStyle = roles[tone]; ctx.lineWidth = 2;
  const mx = Math.round(r.x + r.w * pos);
  ctx.beginPath(); ctx.moveTo(mx, y - 7); ctx.lineTo(mx, y + WV.TUG_H + 7); ctx.stroke();
  y += WV.TUG_H + 22;
  ctx.font = F(THEME.fontSizeSmall);
  text(ctx, t('warConsole.you').toUpperCase(), r.x, y, roles.primary);
  text(ctx, t(tug.edge === 'you' ? 'warConsole.edgeYou' : tug.edge === 'them' ? 'warConsole.edgeThem' : 'warConsole.edgeEven'),
    r.x + r.w / 2, y, roles[tone], F(THEME.fontSizeSmall, true), 'center');
  text(ctx, t('warConsole.them').toUpperCase(), r.x + r.w, y, roles.alert, F(THEME.fontSizeSmall), 'right');
  y += 22;
  // dzisiejsze liczby panelu
  const kw = Math.min(r.w, 420);
  y += drawKvRow(ctx, r.x, y, kw, t('warConsole.declared'), (war.startYear ?? 0).toFixed(1), roles);
  y += drawKvRow(ctx, r.x, y, kw, t('warConsole.duration'), warYears(war, now).toFixed(1), roles, { unit: t('warConsole.yearsUnit') });
  y += drawKvRow(ctx, r.x, y, kw, t('warConsole.battles'), String(war.battles?.length ?? 0), roles);
  y += 18;
  // mini-mapa: WYŁĄCZNIE znane układy przeciwnika z rekordu wywiadu (dossier, ta sama bramka co Wywiad) + układy gracza
  const mapRect = { x: r.x, y, w: r.w, h: r.y + r.h - y };
  if (K && emp && mapRect.h >= WV.MAP_MIN_H) {
    const level = K.intelSystem?.getLevel?.(empireId) ?? 'unknown';
    const rec = K.gameState?.get('intel')?.[empireId] ?? { level };
    const galaxySys = (sid) => K.galaxyData?.systems?.find((q) => q.id === sid) ?? null;
    const d = intelDossier({ rec: { ...rec, level }, emp, systemName: (sid) => galaxySys(sid)?.name ?? sid });
    const mineIds = new Set((K.colonyManager?.getPlayerColonies?.() ?? []).map((c) => c.systemId ?? 'sys_home'));
    const homeId = K.galaxyData?.systems?.find((q) => q?.isHome === true)?.id ?? HOME_SYSTEM_ID;
    drawEmpireMiniMap(ctx, mapRect, systemMapPoints({ known: d.systems, mineIds, posOf: galaxySys, homeId }), roles);
  }
  ctx.restore();
}

/** Stół pokoju (WP-4 C1 + WP-R) — te same dane i strefy co dziś; przewijany w obrębie bohatera. */
function drawPeaceTable(ov, ctx, r, war, empireId, roles, hz) {
  const table = ov._ensureTable(war, empireId);
  const bodyTop = r.y, bodyH = Math.max(0, r.h);
  const zoneStart = ov._hitZones.length;
  const scroll = ov._contentHRight != null ? clampScroll(ov._scrollRight, ov._contentHRight, bodyH) : ov._scrollRight;
  ov._scrollRight = scroll;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x - 8, bodyTop, r.w + 16, bodyH); ctx.clip();
  ctx.textBaseline = 'middle';
  let y = bodyTop - scroll;
  y += drawEyebrow(ctx, r.x, y, r.w, t('peaceTable.title'), roles) + 4;
  const gap = 24, colW = Math.floor((r.w - gap) / 2);
  const lx = r.x, rx = r.x + colW + gap;
  ctx.font = F(THEME.fontSizeSmall, true);
  text(ctx, t('peaceTable.demand'), lx, y + 8, roles.dim);
  text(ctx, t('peaceTable.offer'), rx, y + 8, roles.dim);
  y += WV.LINE_H + 4;
  const n = Math.max(table.demand.length, table.offer.length);
  if (n === 0) {
    text(ctx, t('peaceTable.empty'), lx, y + 8, roles.dim, F(THEME.fontSizeSmall));
    y += WV.LINE_H;
  } else {
    let anyRecap = false, anyLocked = false;
    for (let i = 0; i < n; i++) {
      const ry = y + i * WV.TABLE_ROW_H;
      if (tableRow(ov, ctx, table.demand[i], lx, ry, colW, empireId, false, roles, hz)) anyRecap = true;
      if (tableRow(ov, ctx, table.offer[i], rx, ry, colW, empireId, true, roles, hz)) anyRecap = true;
      if (table.demand[i]?.capital || table.offer[i]?.capital) anyLocked = true;
    }
    y += n * WV.TABLE_ROW_H + 6;
    ctx.font = F(THEME.fontSizeSmall);
    if (anyRecap) { text(ctx, `${MARK_RECAP} ${t('peaceTable.recaptured')}`, lx, y + 7, roles.dim); y += 14; }
    if (anyLocked) { text(ctx, `${MARK_LOCKED} ${t('peaceTable.capitalLocked')}`, lx, y + 7, roles.dim); y += 14; }
    y += 6;
    // żądanie vs sufit (lewa) + wartość oferty (prawa) — sumy jak dziś
    const demandSum = table.demand.filter((q) => q.countsToCeiling && ov._selected.has(q.bodyId)).reduce((s, q) => s + (q.devValue ?? 0), 0);
    const offerSum = table.offer.filter((q) => ov._selected.has(q.bodyId)).reduce((s, q) => s + (q.devValue ?? 0), 0);
    const over = table.ceiling != null && demandSum > table.ceiling + 1e-9;
    const ceilFrac = table.ceiling ? Math.min(1, demandSum / table.ceiling) : 0;
    text(ctx, t('peaceTable.ceiling', ov._fmtVal(demandSum), ov._fmtVal(table.ceiling)), lx, y + 7, over ? roles.alert : roles.primary);
    text(ctx, t('peaceTable.devValue', ov._fmtVal(offerSum)), rx, y + 7, roles.primary);
    y += 16;
    drawBar(ctx, lx, y, colW, ceilFrac, roles, { tone: over ? 'alert' : 'primary' });
    y += 10;
    const ev = ov._ensureEval(war, empireId);
    if (ev?.blocked) { text(ctx, `✗ ${t(ev.reasonKey ?? 'diploRefusal.unknownReason')}`, lx, y + 7, roles.alert); y += 16; }
    else if (over) { text(ctx, `✗ ${t('peaceTable.ceilingExceeded')}`, lx, y + 7, roles.alert); y += 16; }
  }
  // reparacje (przełącznik binarny, poza sufitem — D-WPR-4) + wyczyść / podpowiedź
  y += 6;
  ctx.font = F(THEME.fontSizeSmall);
  const repLabel = ov._reparations ? t('peaceTable.reparations', String(REPARATIONS_YEARS)) : t('peaceTable.reparationsOff');
  const repW = Math.ceil(ctx.measureText(repLabel).width) + 6;
  if (hz?.type === 'reparations_toggle') { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(lx - 2, y, repW, 16); ctx.globalAlpha = 1; }
  text(ctx, repLabel, lx, y + 8, ov._reparations ? roles.primary : roles.dim);
  ov._addHit(lx - 2, y, repW, 16, 'reparations_toggle');
  if (ov._reparations) text(ctx, truncateText(t('peaceTable.reparationsHint'), colW, fits(ctx)), rx, y + 8, roles.dim);
  y += 20;
  if (ov._selected.size > 0 || ov._reparations) {
    const label = chipLabel(`✕ ${t('peaceTable.clear')}`);
    const cw = Math.ceil(ctx.measureText(label).width) + 6;
    if (hz?.type === 'peace_clear') { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(lx - 2, y, cw, 16); ctx.globalAlpha = 1; }
    text(ctx, label, lx, y + 8, roles.primary);
    ov._addHit(lx - 2, y, cw, 16, 'peace_clear');
  } else {
    text(ctx, t('peaceTable.hint'), lx, y + 8, roles.dim);
  }
  y += 22;
  const contentH = y + scroll - bodyTop;
  ctx.restore();
  ov._contentHRight = contentH;
  ov._scrollRight = clampScroll(scroll, contentH, bodyH);
  pruneZones(ov._hitZones, zoneStart, bodyTop, bodyTop + bodyH);
  const thumb = scrollThumb(ov._scrollRight, contentH, bodyH, bodyTop);
  if (thumb) { ctx.save(); ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(r.x + r.w + 6, thumb.y, CONSOLE_KIT.SCROLLBAR_W, thumb.h); ctx.restore(); }
  ov._consoleTableRect = { x: r.x, y: bodyTop, w: r.w, h: bodyH };
}

/** Wiersz stołu: [✓] nazwa ↩ 🔒 … wartość; strefa `peace_toggle` tylko dla klikalnych (ciało domowe zablokowane — jak dziś). */
function tableRow(ov, ctx, row, x, y, colW, empireId, isOffer, roles, hz) {
  if (!row) return false;
  const locked = row.capital === true;
  const sel = ov._selected.has(row.bodyId);
  ctx.font = F(THEME.fontSizeSmall);
  if (!locked && hz?.type === 'peace_toggle' && hz.data?.bodyId === row.bodyId) {
    ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(x - 2, y, colW + 4, WV.TABLE_ROW_H - 2); ctx.globalAlpha = 1;
  }
  const box = locked ? '·' : (sel ? '✓' : ' ');
  const marks = (row.recaptured ? ' ' + MARK_RECAP : '') + (locked ? ' ' + MARK_LOCKED : '');
  const val = ov._fmtVal(row.devValue);
  const valW = ctx.measureText(val).width;
  const name = truncateText(String(row.name ?? row.bodyId), colW - valW - 50, fits(ctx));
  text(ctx, `[${box}] ${name}${marks}`, x, y + 8, locked ? roles.dim : sel ? roles.primary : roles.foreign);
  text(ctx, val, x + colW, y + 8, row.recaptured ? roles.primary : roles.dim, null, 'right');
  if (!locked) ov._addHit(x, y, colW, WV.TABLE_ROW_H - 2, 'peace_toggle', { bodyId: row.bodyId, isOffer, empireId });
  return row.recaptured === true;
}

function drawInspector(ov, ctx, iz, war, empireId, roles, hz, K) {
  const x = iz.x, w = iz.w, KIT = CONSOLE_KIT;
  const cdYears = K?.diplomacySystem?.getRefusalYearsLeft?.(empireId, 'offer_peace') ?? 0;
  const action = peaceActionView(war, cdYears, t);
  const actH = action ? KIT.EYEBROW_H + 2 + KIT.CHIP_H + KIT.CHIP_GAP : 0;
  const actY = iz.y + iz.h - actH;
  ctx.save();
  ctx.beginPath(); ctx.rect(iz.x, iz.y, iz.w, Math.max(0, actY - 8 - iz.y)); ctx.clip();
  ctx.textBaseline = 'middle';
  let y = iz.y + drawZoneRule(ctx, iz, t('warConsole.file'), roles) + 6;
  // casus belli (Finding 725 — nagłówek przez t())
  const cb = CASUS_BELLI[war.casusBelli] ?? CASUS_BELLI.border_incident;
  y += drawEyebrow(ctx, x, y, w, t('warOverlay.casusBelli'), roles) + 2;
  text(ctx, truncateText(getName(cb), w, fits(ctx)), x, y + 8, roles.primary, F(THEME.fontSizeNormal));
  y += 18;
  ctx.font = F(THEME.fontSizeSmall);
  y = wrap(ctx, getDesc(cb), x, y + 7, w, 14, roles.dim) - 7;
  y += 4;
  y += drawKvRow(ctx, x, y, w, t('warConsole.declared'), (war.startYear ?? 0).toFixed(1), roles);
  y += 12;
  // ostatnie bitwy (5, od najnowszej) — jak dziś
  y += drawEyebrow(ctx, x, y, w, t('warOverlay.battlesHeader', war.battles?.length ?? 0), roles) + 2;
  const battles = (war.battles ?? []).slice(-5).reverse();
  ctx.font = F(THEME.fontSizeSmall);
  if (!battles.length) y = wrap(ctx, t('warOverlay.noBattlesYet'), x, y + 8, w, 14, roles.dim) - 6;
  for (const id of battles) {
    const b = K?.gameState?.get(`battles.${id}`);
    if (!b) continue;
    const winner = b.winner === 'A' ? t('warOverlay.sideAlien') : b.winner === 'B' ? t('warOverlay.player') : t('warOverlay.sideDraw');
    const tone = b.winner === 'B' ? 'primary' : b.winner === 'A' ? 'alert' : 'dim';
    y += drawKvRow(ctx, x, y, w, t('warOverlay.winnerLine', winner), (b.year ?? 0).toFixed(0), roles, { tone });
    text(ctx, truncateText(t('warOverlay.battleLosses', b.lossesA, b.lossesB, b.turns), w, fits(ctx)), x, y + 6, roles.dim, F(THEME.fontSizeSmall));
    y += 16;
  }
  ctx.restore();
  // [ ZAPROPONUJ POKÓJ ] — dzisiejsza reguła; blokada po odmowie — strefa podpowiedzi (bez skutku)
  if (action) {
    const ay = actY + drawEyebrow(ctx, x, actY, w, t('diplo.console.actions'), roles) + 2;
    const hover = action.enabled ? hz?.type === 'offer_peace' : hz?.type === 'action_blocked';
    const r = drawActionChip(ctx, x, ay, w, roles, { label: action.label, enabled: action.enabled, hover });
    if (action.enabled) ov._addHit(r.x, r.y, r.w, r.h, 'offer_peace', action.data);
    else {
      ov._addHit(r.x, r.y, r.w, r.h, 'action_blocked', { action: 'offer_peace', reason: action.reason });
      if (hover) ov._consoleTooltip = { x: r.x, y: r.y + r.h + 2, text: action.reason };
    }
  }
}
