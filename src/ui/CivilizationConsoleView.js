// CivilizationConsoleView — Cywilizacja i Sfera Dysona na zestawie konsoli (ARC KONSOLE K5, docs/design/CONSOLES_PLAN.md §1.2, §19;
// na stałe od KZ — flaga zdjęta).
//
// Wołane przez `CivilizationOverlay.draw` / `DysonOverlay.draw`, gdy `isKitScreen('civilization' | 'dyson')`. Szablon 4-strefowy:
//  Cywilizacja — (1) nagłówek z czipami grupy; (2) lista Imperium / Frakcje / Historia (dzisiejsze kolonie ze strefą `goto_colony`);
//   (3) bohater: portret lidera + gniazdo emblematu (obraz barwiony rolą primary albo nazwa imperium — nigdy pusta rama) + 4 duże
//   instrumenty (POP, prosperity, Kr/rok, handel — te same liczby co dzisiejsze karty); (4) inspektor wybranej pozycji; pas = oś
//   kroniki, powtórzenia zgrupowane z licznikiem.
//  Sfera Dysona — lista faz → segmentów (`selectSegment`), bohater = pierścień 20 segmentów w 4 fazach (zbudowany / bieżący /
//   zablokowany, same role) z bieżącą fazą i postępem całości, inspektor = koszt vs magazyn planety domowej + [ DOSTARCZ ]
//   (`deliverMax`) i [ DOSTARCZ 10 % ] (`deliverPercent`) — wyłączone z powodem i18n, gdy silnik by odmówił; pas = ścieżka końca gry.
// Typy stref dzisiejszych ekranów zostają (`close`, `goto_colony`, `selectSegment`, `deliverMax`, `deliverPercent`); nowe: `tab`,
// `civ_item`. Geometria — `consoleZones`; kolory — role (`consoleRoles`).

import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale, getName } from '../i18n/i18n.js';
import { LEADERS } from '../data/LeaderData.js';
import { TECHS } from '../data/TechData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { DYSON_PHASES, DYSON_SEGMENTS, SEGMENT_TO_PHASE, getDysonVisualStage } from '../data/DysonData.js';
import { BUILDING_SLIDER_SHIFTS, TECH_SLIDER_SHIFTS, ZONE_MODIFIERS } from '../systems/FactionSystem.js';
import { RESEARCH_PER_SEGMENT } from '../systems/DysonSystem.js';
import { consoleZones, consoleClockRect, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawActionChip,
  drawList, drawSelectBrackets, drawTabular, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS } from './CivPanelDrawer.js';
import { truncateText } from './HudLabelLogic.js';
import { drawHeroDim, drawScrolledInspector, resName, fmtAmt } from './EconomyConsoleView.js';
import { civGroupChips, civListRows, civItemKind, historyGroups, factionView, emblemSlot, EMBLEM_PATH, FACTION_NAME_KEY,
  FACTION_DEMAND_KEY, MOD_LABEL_KEY, segmentState, phaseState, currentPhase, overallProgress, segmentCostRows, deliverGate,
  endgamePath, dysonListRows, ringArcs, phaseTech, colonyTableRows } from './CivilizationConsoleLogic.js';

const CV = Object.freeze({
  HERO_INSET: 18,
  PORTRAIT_MAX_W: 240,   // portret 4:5 w bohaterze
  BLOCK_GAP: 40,         // portret / tożsamość → pasmo instrumentów
  EMBLEM: 96,            // bok emblematu
  INSTR_H: 74,           // pasmo instrumentów na dole bohatera
  LINE_H: 15,
  STRIP_CHIP_GAP: 18,
  TABLE_ROW_H: 32,       // wiersz tabeli «Kolonie i placówki» (nazwa + typ, pod nimi liczby)
  STRIP_MIN_W: 70,       // najwęższa (przycięta) grupa na osi kroniki
  RING_FRAC: 0.34,       // promień pierścienia / min(w, h) bohatera
  RING_THICK: 0.15,      // grubość łuku / promień
  LOCKED_ALPHA: 0.35,
});
const ROMAN = ['I', 'II', 'III', 'IV'];

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}
function wrapLines(ctx, s, maxW) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean);
  const out = [];
  let line = '';
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(test).width > maxW && line) { out.push(line); line = wd; } else line = test;
  }
  if (line) out.push(line);
  return out;
}
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const en = () => getLocale() === 'en';
const techName = (id) => (TECHS[id] ? getName(TECHS[id], 'tech') : t('civConsole.unknownTech'));
const bldName = (id) => (BUILDINGS[id] ? getName(BUILDINGS[id], 'building') : t('civConsole.unknownBuilding'));
const pct = (mult) => { const p = Math.round((mult - 1) * 100); return `${p > 0 ? '+' : ''}${p}%`; };

// ── Obrazy: portrety i emblemat (leniwy cache; import bezpieczny pod node) ──────────────────────────────────────────

const _imgCache = new Map();
function getImage(path) {
  if (typeof Image === 'undefined' || !path) return null;
  let img = _imgCache.get(path);
  if (img) return img;
  img = new Image();
  img.onerror = () => { img.failed = true; };
  img.src = path;
  _imgCache.set(path, img);
  return img;
}
function drawImageCover(ctx, img, dx, dy, dw, dh) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return;
  const scale = Math.max(dw / iw, dh / ih);
  const sw = dw / scale, sh = dh / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, dx, dy, dw, dh);
}
// Emblemat barwiony rolą primary: biały znak → kolor roli (offscreen, cache per kolor)
const _tintCache = new Map();
function tintedEmblem(img, color, size) {
  if (typeof document === 'undefined') return null;
  const key = `${color}|${size}`;
  let c = _tintCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, size, size);
  _tintCache.set(key, c);
  return c;
}

// ── Rama wspólna ─────────────────────────────────────────────────────────────────────────────────────────────────────

function civFrame(ov, ctx, W, H, page, titleKey) {
  const roles = consoleRoles(THEME);
  const spec = { ...(CONSOLE_SCREEN_SPECS[page] ?? {}), clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  const hz = ov._hoverZone;
  const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t(titleKey), chips: civGroupChips(page, t), hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
    else ov._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
  }
  return { z, roles, hz };
}

// Inspektor: wiersze rysowane przez `rows` z kursorem y; zwraca wysokość treści
function kv(ctx, c, k, v, roles, tone = 'primary') {
  drawKvRow(ctx, c.x, c.y, c.w, k, v, roles, { tone });
  c.y += CONSOLE_KIT.KV_H + 2;
}
function eyebrow(ctx, c, label, roles) {
  c.y += 6;
  drawEyebrow(ctx, c.x, c.y, c.w, label, roles);
  c.y += CONSOLE_KIT.EYEBROW_H + 2;
}
function para(ctx, c, s, color, font = F(THEME.fontSizeSmall)) {
  ctx.font = font;
  for (const ln of wrapLines(ctx, s, c.w)) { text(ctx, ln, c.x, c.y + 11, color); c.y += CV.LINE_H; }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// CYWILIZACJA
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Dane konsoli Cywilizacji: dzisiejsze `_gatherData()` + kronika zgrupowana + wiersze listy. */
export function civConsoleData(ov) {
  const K = window.KOSMOS;
  const d = ov._gatherData();
  const leader = d.leaderInfo?.leaderDef ?? null;
  const leaderName = leader ? (en() ? (leader.nameEN || leader.namePL) : leader.namePL) : null;
  const groups = historyGroups(d.history, en() ? 'en' : 'pl');
  const rows = civListRows({ perColony: d.perColony, leaderName, factions: d.factionInfo, groups,
    activePlanetId: K?.colonyManager?.activePlanetId ?? null }, t);
  const krYearById = Object.fromEntries((d.colonies ?? []).map((c) => [c.planetId, c.creditsPerYear ?? 0]));
  return { ...d, leader, leaderName, groups, rows, colonyTable: colonyTableRows(d.perColony, krYearById) };
}

export function drawCivilizationConsole(ov, ctx, W, H) {
  const { z, roles, hz } = civFrame(ov, ctx, W, H, 'civilization', 'civOverlay.header');
  const d = civConsoleData(ov);
  // wybór: domyślnie przegląd imperium; zniknięta pozycja (np. utracona kolonia) → przegląd
  if (!ov._kitSel || !d.rows.some((r) => r.id === ov._kitSel)) ov._kitSel = 'empire';
  const sel = ov._kitSel;

  // (2) Lista
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('civConsole.listTitle'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  const hoverId = hz?.type === 'civ_item' ? hz.data?.id : hz?.type === 'goto_colony' ? `col:${hz.data?.planetId}` : null;
  const renderRow = (c, r, rr, { sel: s, hov }) => {
    const cy = rr.y + rr.h / 2;
    c.font = F(THEME.fontSizeNormal);
    let vw = 0;
    if (r.value != null && r.value !== '') {
      c.fillStyle = s ? roles.primary : roles.dim;
      vw = drawTabular(c, r.value, rr.x + rr.w - CONSOLE_KIT.ROW_PAD_X, cy, 'right') + 8;
    }
    const mark = r.active ? '● ' : '';
    c.fillStyle = r.dimmed && !s ? roles.dim : roles.primary;
    c.globalAlpha = s || hov ? 1 : 0.85;
    c.fillText(fit(c, mark + r.label, rr.w - 2 * CONSOLE_KIT.ROW_PAD_X - vw), rr.x + CONSOLE_KIT.ROW_PAD_X, cy);
    c.globalAlpha = 1;
  };
  const res = drawList(ctx, listRect, d.rows, roles, { selectedId: sel, hoverId, scroll: ov._kitScrollList ?? 0, renderRow });
  ov._kitScrollList = res.scroll;
  const byId = new Map(d.rows.filter((r) => !r.group).map((r) => [r.id, r]));
  for (const zz of res.zones) {
    const r = byId.get(zz.id);
    if (r?.planetId) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'goto_colony', { planetId: r.planetId });
    else if (zz.id !== 'hist:') ov._addHit(zz.x, zz.y, zz.w, zz.h, 'civ_item', { id: zz.id });
  }

  // (3) Bohater
  drawZoneFrame(ctx, z.hero, roles);
  drawCivHero(ctx, insetRect(z.hero, CV.HERO_INSET), d, roles);

  // (4) Inspektor
  drawCivInspector(ov, ctx, z.inspector, d, sel, roles);

  // Pas — oś kroniki
  if (z.strip) drawHistoryStrip(ov, ctx, z.strip, d.groups, sel, roles, hz);
}

function drawCivHero(ctx, r, d, roles) {
  const K = window.KOSMOS;
  // Portret 4:5 po lewej; blok (portret + tożsamość, pod nim pasmo instrumentów) wyśrodkowany w pionie bohatera
  const PH = Math.max(0, Math.min(r.h - CV.INSTR_H - CV.BLOCK_GAP, Math.round(CV.PORTRAIT_MAX_W * 1.25)));
  const PW = Math.round(PH * 0.8);
  const blockH = PH + CV.BLOCK_GAP + CV.INSTR_H;
  const py = r.y + Math.max(0, Math.round((r.h - blockH) / 2));
  const instrTop = py + PH + CV.BLOCK_GAP;
  const topH = PH;
  const px = r.x;
  const leader = d.leader;
  if (leader && PW > 20) {
    const img = getImage(leader.portrait);
    if (img && img.complete && img.naturalWidth > 0) drawImageCover(ctx, img, px, py, PW, PH);
    else {
      const name = d.leaderName ?? '';
      const ini = name.split(/\s+/).map((s) => s[0] ?? '').slice(0, 2).join('').toUpperCase();
      ctx.save(); ctx.textBaseline = 'middle';
      text(ctx, ini, px + PW / 2, py + PH / 2, roles.primary, F(Math.round(PW * 0.34), true), 'center');
      ctx.restore();
    }
  }
  // Kolumna tożsamości: emblemat (albo nazwa imperium w jego miejscu), lider
  const tx = px + (leader && PW > 20 ? PW + 20 : 0);
  const tw = Math.max(0, r.x + r.w - tx);
  const civName = K?.civName || t('civConsole.empireFallback');
  const img = getImage(EMBLEM_PATH);
  let ty = py;
  if (emblemSlot(img) === 'image') {
    const E = Math.min(CV.EMBLEM, topH * 0.5, tw);
    const tinted = tintedEmblem(img, roles.primary, Math.round(E * 2));
    if (tinted) ctx.drawImage(tinted, tx, ty, E, E);
    ctx.font = F(THEME.fontSizeLarge, true);
    const nx = tx + E + 14;
    for (const ln of wrapLines(ctx, civName.toUpperCase(), Math.max(40, r.x + r.w - nx)).slice(0, 2)) {
      text(ctx, ln, nx, ty + 22, roles.primary); ty += THEME.fontSizeLarge + 6;
    }
    ty = py + E + 12;
  } else {
    // brak pliku → nazwa imperium dużym krojem na miejscu emblematu (nigdy pusta rama)
    const big = THEME.fontSizeInstrument ?? 32;
    ctx.font = F(big, true);
    for (const ln of wrapLines(ctx, civName.toUpperCase(), tw).slice(0, 2)) { text(ctx, ln, tx, ty + big, roles.primary); ty += big + 6; }
    ty += 8;
  }
  if (leader) {
    const title = en() ? (leader.titleEN || leader.titlePL) : leader.titlePL;
    const arch = en() ? (leader.archetypeEN || leader.archetype) : leader.archetype;
    drawEyebrow(ctx, tx, ty, Math.min(tw, 360), t('civOverlay.leader'), roles); ty += CONSOLE_KIT.EYEBROW_H + 4;
    ctx.font = F(THEME.fontSizeMedium, true);
    text(ctx, fit(ctx, d.leaderName, tw), tx, ty + 12, roles.primary); ty += 18;
    ctx.font = F(THEME.fontSizeSmall);
    if (title) { text(ctx, fit(ctx, title, tw), tx, ty + 11, roles.dim); ty += CV.LINE_H; }
    if (arch) { text(ctx, fit(ctx, `◈ ${arch}`, tw), tx, ty + 11, roles.dim); ty += CV.LINE_H; }
  } else {
    ctx.font = F(THEME.fontSizeSmall);
    text(ctx, t('civConsole.noLeader'), tx, ty + 11, roles.dim);
  }

  // 4 duże instrumenty (te same liczby co dzisiejsze karty) — przyciemnienie bohatera pod liczbami
  const band = { x: r.x, y: instrTop, w: r.w, h: CV.INSTR_H };
  drawHeroDim(ctx, { x: band.x - 10, y: band.y - 14, w: band.w + 20, h: band.h + 20 });
  const net = d.netCreditsPerYear;
  const cells = [
    { label: t('civOverlay.cardTotalPop'), value: d.totalPop.toFixed(1), unit: d.totalMaxPop > 0 ? `/ ${d.totalMaxPop.toFixed(0)}` : '' },
    { label: t('civOverlay.cardAvgProsperity'), value: d.avgProsperity.toFixed(0), tone: d.avgProsperity < 40 ? 'alert' : 'primary' },
    { label: t('civOverlay.cardKrIncome'), value: `${net >= 0 ? '+' : ''}${net.toFixed(0)}`, tone: net < 0 ? 'alert' : 'primary' },
    { label: t('civOverlay.cardTrade'), value: String(d.tradeConnections), unit: t('civOverlay.connections') },
  ];
  const cw = band.w / cells.length;
  cells.forEach((c, i) => drawInstrument(ctx, band.x + i * cw, band.y, roles, { label: c.label, value: c.value, unit: c.unit ?? '', tone: c.tone ?? 'primary' }));
}

function drawCivInspector(ov, ctx, iz, d, sel, roles) {
  const kind = civItemKind(sel);
  drawScrolledInspector(ov, ctx, iz, roles, t('civConsole.inspTitle'), (x, y0, w, vis) => {
    const c = { x, y: y0, w };
    if (kind === 'empire') { inspEmpire(ctx, c, d, roles); inspColonyTable(ov, ctx, c, d, roles, vis); }
    else if (kind === 'leader') inspLeader(ctx, c, d, roles);
    else if (kind === 'colony') inspColony(ctx, c, d, sel.slice(4), roles);
    else if (kind === 'faction') inspFaction(ctx, c, d, sel.slice(4), roles);
    else if (kind === 'history') inspHistory(ctx, c, d, sel.slice(5), roles);
    return c.y - y0 + 8;
  });
}

function bonusLines(ctx, c, leader, roles) {
  for (const b of leader?.bonuses ?? []) para(ctx, c, `+ ${en() ? (b.descEN || b.descPL) : b.descPL}`, roles.primary);
  for (const m of leader?.maluses ?? []) para(ctx, c, `− ${en() ? (m.descEN || m.descPL) : m.descPL}`, roles.alert);
}

function inspEmpire(ctx, c, d, roles) {
  ctx.font = F(THEME.fontSizeMedium, true);
  text(ctx, fit(ctx, (window.KOSMOS?.civName || t('civConsole.empireFallback')).toUpperCase(), c.w), c.x, c.y + 13, roles.primary);
  c.y += 22;
  kv(ctx, c, t('civOverlay.colonies'), `${d.fullColonies.length} (+${d.outposts.length} ${t('civOverlay.outposts')})`, roles);
  kv(ctx, c, t('civOverlay.totalShips'), String(d.vessels.length), roles);
  kv(ctx, c, t('civOverlay.totalPop'), d.totalMaxPop > 0 ? `${d.totalPop.toFixed(1)} / ${d.totalMaxPop.toFixed(0)}` : d.totalPop.toFixed(1), roles);
  kv(ctx, c, t('civOverlay.avgProsperity'), d.avgProsperity.toFixed(1), roles, d.avgProsperity < 40 ? 'alert' : 'primary');
  kv(ctx, c, t('civOverlay.avgLoyalty'), `${d.avgLoyalty.toFixed(0)}%`, roles, d.avgLoyalty <= 30 ? 'alert' : 'primary');
  kv(ctx, c, t('civOverlay.civAge'), `${d.civAge} ${t('civOverlay.yearsShort')}`, roles);
  kv(ctx, c, t('civOverlay.trade'), `${d.tradeConnections} ${t('civOverlay.connections')}`, roles);
  eyebrow(ctx, c, t('civConsole.empireBonuses'), roles);
  if (d.leader) bonusLines(ctx, c, d.leader, roles);
  const fi = d.factionInfo;
  if (fi && !fi.locked) {
    const mods = Object.entries(ZONE_MODIFIERS[fi.zone] ?? {});
    para(ctx, c, `${t('civOverlay.zone')}: ${t(`civOverlay.zone_${fi.zone}`)}`, roles.dim);
    for (const [stat, mult] of mods) para(ctx, c, `${t(MOD_LABEL_KEY[stat] ?? 'civConsole.modOther')} ${pct(mult)}`, mult < 1 ? roles.alert : roles.primary);
    if (mods.length === 0) para(ctx, c, t('civConsole.zoneNoMods'), roles.dim);
  }
  if (!d.leader && !(fi && !fi.locked)) para(ctx, c, t('civConsole.noBonuses'), roles.dim);
}

// «Kolonie i placówki» pod premiami imperium: wiersz = kolonia / placówka; klik = ta sama strefa i handler co kolonia na liście
// (`goto_colony`: przełącz aktywną kolonię + jej inspektor). Strefy tylko dla wierszy w pasie widoku (przewijanie inspektora).
function inspColonyTable(ov, ctx, c, d, roles, vis) {
  eyebrow(ctx, c, t('civConsole.colonyTable'), roles);
  const cols = [
    { k: 'civConsole.colPop', f: 0.40 }, { k: 'civConsole.colProsp', f: 0.54 }, { k: 'civConsole.colKrYear', f: 0.72 },
    { k: 'civConsole.colShips', f: 0.86 }, { k: 'civConsole.colBuildings', f: 1.0 },
  ];
  ctx.font = F(THEME.fontSizeSmall);
  text(ctx, t('civConsole.colName'), c.x, c.y + 11, roles.dim);
  for (const col of cols) text(ctx, t(col.k), c.x + c.w * col.f, c.y + 11, roles.dim, null, 'right');
  c.y += CV.LINE_H + 2;
  const hz = ov._hoverZone;
  const active = window.KOSMOS?.colonyManager?.activePlanetId;
  for (const r of d.colonyTable) {
    const top = c.y, h = CV.TABLE_ROW_H;
    const hov = hz?.type === 'goto_colony' && hz.data?.planetId === r.planetId;
    if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(c.x, top, c.w, h); ctx.globalAlpha = 1; }
    const tone = r.kind === 'outpost' ? roles.dim : roles.primary;
    ctx.font = F(THEME.fontSizeNormal);
    const typ = t(r.kind === 'outpost' ? 'civConsole.typeOutpost' : 'civConsole.typeColony');
    ctx.font = F(THEME.fontSizeSmall);
    const tw = ctx.measureText(typ).width;
    text(ctx, typ, c.x + c.w, top + 12, roles.dim, null, 'right');
    ctx.font = F(THEME.fontSizeNormal);
    text(ctx, fit(ctx, `${r.planetId === active ? '● ' : ''}${r.name}`, c.w - tw - 10), c.x, top + 12, tone);
    ctx.font = F(THEME.fontSizeSmall);
    ctx.fillStyle = tone;
    const vals = [r.pop == null ? '—' : r.pop.toFixed(1), r.prosperity == null ? '—' : r.prosperity.toFixed(0),
      `${r.krYear >= 0 ? '+' : ''}${r.krYear.toFixed(0)}`, String(r.ships), String(r.buildings)];
    vals.forEach((v, i) => drawTabular(ctx, v, c.x + c.w * cols[i].f, top + 27, 'right'));
    if (vis(top) && vis(top + h - CONSOLE_KIT.KV_H)) ov._addHit(c.x, top, c.w, h, 'goto_colony', { planetId: r.planetId });
    c.y += h + 2;
  }
}

function inspLeader(ctx, c, d, roles) {
  const L = d.leader;
  if (!L) { para(ctx, c, t('civConsole.noLeader'), roles.dim); return; }
  ctx.font = F(THEME.fontSizeMedium, true);
  for (const ln of wrapLines(ctx, d.leaderName, c.w).slice(0, 2)) { text(ctx, ln, c.x, c.y + 13, roles.primary); c.y += 18; }
  const title = en() ? (L.titleEN || L.titlePL) : L.titlePL;
  const arch = en() ? (L.archetypeEN || L.archetype) : L.archetype;
  const quote = en() ? (L.quoteEN || L.quote) : L.quote;
  if (title) para(ctx, c, title, roles.dim);
  if (arch) para(ctx, c, `◈ ${arch}`, roles.dim);
  if (quote) { c.y += 4; para(ctx, c, `„${quote}”`, roles.dim, `italic ${THEME.fontSizeSmall}px ${THEME.fontFamily}`); }
  eyebrow(ctx, c, t('civConsole.leaderTraits'), roles);
  bonusLines(ctx, c, L, roles);
  const fid = d.leaderInfo?.activeFaction;
  kv(ctx, c, t('civOverlay.faction'), fid && FACTION_NAME_KEY[fid] ? t(FACTION_NAME_KEY[fid]) : t('civOverlay.factionUnknown'), roles);
}

function inspColony(ctx, c, d, planetId, roles) {
  const col = d.perColony.find((p) => String(p.planetId) === String(planetId));
  if (!col) return;
  const active = window.KOSMOS?.colonyManager?.activePlanetId === col.planetId;
  ctx.font = F(THEME.fontSizeMedium, true);
  text(ctx, fit(ctx, col.name, c.w), c.x, c.y + 13, roles.primary); c.y += 20;
  para(ctx, c, active ? t('civConsole.colonyActive') : t('civConsole.colonySwitchHint'), active ? roles.primary : roles.dim);
  if (col.isOutpost) para(ctx, c, t('civConsole.outpostNote'), roles.dim);
  c.y += 4;
  kv(ctx, c, t('civOverlay.totalPop'), col.isOutpost ? '—' : col.maxPop > 0 ? `${col.pop.toFixed(1)} / ${col.maxPop}` : col.pop.toFixed(1), roles);
  if (!col.isOutpost) {
    kv(ctx, c, t('civOverlay.cardAvgProsperity'), col.prosperity.toFixed(0), roles, col.prosperity < 40 ? 'alert' : 'primary');
    drawBar(ctx, c.x, c.y, c.w, col.prosperity / 100, roles, { tone: col.prosperity < 40 ? 'alert' : 'primary' }); c.y += 8;
    kv(ctx, c, t('civConsole.loyalty'), `${Math.round(col.loyalty)}%`, roles, col.loyalty <= 30 ? 'alert' : 'primary');
  }
  kv(ctx, c, t('civOverlay.credits'), col.credits.toFixed(0), roles);
  kv(ctx, c, t('civOverlay.colFleet'), String(col.fleetCount), roles);
  kv(ctx, c, t('civConsole.buildings'), String(col.buildings), roles);
}

function inspFaction(ctx, c, d, fid, roles) {
  const fi = d.factionInfo;
  const v = factionView(fid, fi, { buildingShifts: BUILDING_SLIDER_SHIFTS, techShifts: TECH_SLIDER_SHIFTS, zoneModifiers: ZONE_MODIFIERS });
  ctx.font = F(THEME.fontSizeMedium, true);
  text(ctx, fit(ctx, t(FACTION_NAME_KEY[fid]), c.w), c.x, c.y + 13, roles.primary); c.y += 22;
  if (v.locked) {
    para(ctx, c, t('civConsole.factionsLocked'), roles.alert);
    eyebrow(ctx, c, t('civConsole.demands'), roles);
    para(ctx, c, t(FACTION_DEMAND_KEY[fid]), roles.dim);
    factionPushersEffects(ctx, c, v, roles, true);
    return;
  }
  const ih = drawInstrument(ctx, c.x, c.y, roles, { label: t('civConsole.support'), value: `${Math.round(v.support)}`, unit: '%' });
  c.y += ih.h + 2;
  drawBar(ctx, c.x, c.y, c.w, v.support / 100, roles); c.y += 10;
  para(ctx, c, v.dominant ? t('civConsole.dominant', t(`civOverlay.zone_${v.zone}`)) : t('civConsole.notDominant', t(`civOverlay.zone_${v.zone}`)), roles.dim);
  kv(ctx, c, t('civOverlay.tension'), `${Math.round(v.tension)}%`, roles, v.tension > 50 ? 'alert' : 'primary');
  drawBar(ctx, c.x, c.y, c.w, v.tension / 100, roles, { tone: v.tension > 50 ? 'alert' : 'primary' }); c.y += 8;
  eyebrow(ctx, c, t('civConsole.demands'), roles);
  para(ctx, c, t(FACTION_DEMAND_KEY[fid]), roles.primary);
  factionPushersEffects(ctx, c, v, roles, false);
}

function factionPushersEffects(ctx, c, v, roles, locked) {
  if (v.pushers.length) {
    c.y += 2;
    para(ctx, c, t('civConsole.strengthenedBy'), roles.dim);
    for (const p of v.pushers) {
      const name = p.kind === 'tech' ? techName(p.id) : bldName(p.id);
      kv(ctx, c, fit(ctx, name, c.w - 60), `${Math.abs(p.shift)}`, roles, locked ? 'dim' : 'primary');
    }
  }
  eyebrow(ctx, c, t('civConsole.effects'), roles);
  for (const e of v.effects) {
    para(ctx, c, `${t(`civOverlay.zone_${e.zone}`)}${e.active ? ` · ${t('civConsole.now')}` : ''}`, e.active ? roles.primary : roles.dim);
    if (e.mods.length === 0) para(ctx, c, `  ${t('civConsole.zoneNoMods')}`, roles.dim);
    for (const m of e.mods) para(ctx, c, `  ${t(MOD_LABEL_KEY[m.stat] ?? 'civConsole.modOther')} ${pct(m.mult)}`, e.active ? (m.mult < 1 ? roles.alert : roles.primary) : roles.dim);
  }
}

function inspHistory(ctx, c, d, key, roles) {
  const g = d.groups.find((x) => x.key === key);
  if (!g) return;
  ctx.font = F(THEME.fontSizeMedium, true);
  for (const ln of wrapLines(ctx, `${g.icon ?? '•'} ${g.name}`, c.w).slice(0, 3)) { text(ctx, ln, c.x, c.y + 13, roles.primary); c.y += 18; }
  c.y += 4;
  kv(ctx, c, t('civConsole.histCount'), `×${g.count}`, roles);
  kv(ctx, c, t('civConsole.histYears'), g.firstYear === g.lastYear ? String(g.lastYear) : `${g.firstYear}–${g.lastYear}`, roles);
  if (g.loyaltyPerm) kv(ctx, c, t('civConsole.histLoyalty'), `${g.loyaltyPerm > 0 ? '+' : ''}${g.loyaltyPerm}`, roles, g.loyaltyPerm < 0 ? 'alert' : 'primary');
  if (g.identityValue) kv(ctx, c, t('civConsole.histIdentity'), `${g.identityValue > 0 ? '+' : ''}${g.identityValue}`, roles);
  if (g.colonies.length) { eyebrow(ctx, c, t('civConsole.histColonies'), roles); para(ctx, c, g.colonies.join(' · '), roles.primary); }
}

// Pas: oś kroniki — grupy w kolejności lat (najnowsze z prawej); kółko przewija w lewo (starsze)
function drawHistoryStrip(ov, ctx, sr, groups, sel, roles, hz) {
  const lh = drawZoneRule(ctx, sr, t('civConsole.stripHistory', groups.reduce((s, g) => s + g.count, 0), groups.length), roles);
  const r = { x: sr.x, y: sr.y + lh + 4, w: sr.w, h: Math.max(0, sr.h - lh - 4) };
  ov._consoleStripRect = r;
  if (groups.length === 0) { ctx.font = F(THEME.fontSizeSmall); text(ctx, t('civOverlay.historyEmpty'), r.x, r.y + 20, roles.dim); return; }
  const chrono = [...groups].sort((a, b) => (a.lastYear - b.lastYear) || a.key.localeCompare(b.key));
  const maxOff = Math.max(0, chrono.length - 1);
  const off = Math.max(0, Math.min(maxOff, Math.round(ov._kitStripOff ?? 0)));
  ov._kitStripOff = off;
  const axisY = r.y + 20;
  ctx.save();
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(r.x, axisY + 0.5); ctx.lineTo(r.x + r.w, axisY + 0.5); ctx.stroke();
  ctx.font = F(THEME.fontSizeSmall);
  // od prawej: najnowsza grupa (minus przesunięcie) przy prawej krawędzi
  let xr = r.x + r.w;
  let hidden = 0;
  const hoverId = hz?.type === 'civ_item' ? hz.data?.id : null;
  for (let i = chrono.length - 1 - off; i >= 0; i--) {
    const g = chrono[i];
    const label = `${g.icon ?? '•'} ${g.name}${g.count > 1 ? ` ×${g.count}` : ''}`;
    const yrs = g.count > 1 && g.firstYear !== g.lastYear ? `${g.firstYear}–${g.lastYear}` : String(g.lastYear);
    let w = Math.min(220, Math.max(ctx.measureText(label).width, ctx.measureText(yrs).width) + 8);
    const hiddenW = ctx.measureText(t('civConsole.stripOlder', i + 1)).width + 12;
    // reszta miejsca (bez napisu o starszych, gdy to pierwsza grupa) — przycięta etykieta zamiast przerwy w osi
    const room = xr - r.x - (i > 0 ? hiddenW : 0);
    if (w > room) { if (room < CV.STRIP_MIN_W) { hidden = i + 1; break; } w = room; }
    const x0 = xr - w;
    const id = `hist:${g.key}`;
    const s = id === sel, hov = id === hoverId;
    const box = { x: x0, y: r.y, w, h: Math.min(r.h, 52) };
    if (hov && !s) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.globalAlpha = 1; }
    ctx.fillStyle = s ? roles.primary : roles.dim;
    ctx.fillRect(x0 + 3, axisY - 4, 1, 9);
    ctx.fillStyle = s || hov ? roles.primary : roles.dim;
    drawTabular(ctx, yrs, x0 + 3, r.y + 12, 'left');
    ctx.fillStyle = roles.primary;
    ctx.globalAlpha = s || hov ? 1 : 0.85;
    ctx.fillText(fit(ctx, label, w - 4), x0 + 3, axisY + 18);
    ctx.globalAlpha = 1;
    if (s) drawSelectBrackets(ctx, box, roles);
    ov._addHit(box.x, box.y, box.w, box.h, 'civ_item', { id });
    xr = x0 - CV.STRIP_CHIP_GAP;
  }
  if (hidden > 0) { ctx.fillStyle = roles.dim; ctx.fillText(t('civConsole.stripOlder', hidden), r.x, axisY + 18); }
  if (off > 0) { ctx.fillStyle = roles.dim; ctx.textAlign = 'right'; ctx.fillText(t('civConsole.stripNewer', off), r.x + r.w, r.y + r.h - 4); ctx.textAlign = 'left'; }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SFERA DYSONA
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Dane konsoli Dysona: stan silnika, mnożnik kosztu, magazyn planety domowej, technologie. */
export function dysonConsoleData(ov) {
  const K = window.KOSMOS;
  const sys = K?.dysonSystem;
  const st = sys?.getState?.() ?? ov._state ?? null;
  const tSys = K?.techSystem;
  const isResearched = (id) => !!tSys?.isResearched?.(id);
  const hp = K?.homePlanet;
  const homeCol = hp ? K?.colonyManager?.getColony?.(hp.id) : null;
  const resSys = homeCol?.resourceSystem ?? K?.resourceSystem ?? null;
  const stockOf = (res) => resSys?.getAmount?.(res) ?? 0;
  const costMult = sys?.getCostMultiplier?.() ?? 1;
  return { K, sys, st, isResearched, stockOf, costMult, homeName: homeCol?.name ?? hp?.name ?? null };
}

/** Wybrany segment do pokazania: wybór gracza, inaczej pierwszy bieżący (otwarty) segment, inaczej 1. */
export function dysonShownSegment(ov, st, isResearched) {
  if (ov._selectedSeg != null && DYSON_SEGMENTS[ov._selectedSeg]) return Number(ov._selectedSeg);
  for (const p of DYSON_PHASES) for (const s of p.segments) if (segmentState(s, st, isResearched) === 'current') return s;
  return 1;
}

export function drawDysonConsole(ov, ctx, W, H) {
  const { z, roles, hz } = civFrame(ov, ctx, W, H, 'dyson', 'dyson.header');
  const D = dysonConsoleData(ov);
  const segId = dysonShownSegment(ov, D.st, D.isResearched);

  // (2) Lista faz → segmentów
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('dyson.constructionHeader'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  const rows = dysonListRows(D.st, t, en() ? 'en' : 'pl', D.isResearched);
  const hoverId = hz?.type === 'selectSegment' ? hz.data?.segmentId : null;
  const res = drawList(ctx, listRect, rows, roles, { selectedId: segId, hoverId, scroll: ov._kitScrollList ?? 0 });
  ov._kitScrollList = res.scroll;
  for (const zz of res.zones) ov._addHit(zz.x, zz.y, zz.w, zz.h, 'selectSegment', { segmentId: zz.id });

  // (3) Bohater — pierścień
  drawZoneFrame(ctx, z.hero, roles);
  drawDysonRing(ov, ctx, insetRect(z.hero, CV.HERO_INSET), D, segId, roles, hoverId);

  // (4) Inspektor
  drawDysonInspector(ov, ctx, z.inspector, D, segId, roles, hz);

  // Pas — ścieżka końca gry
  if (z.strip) drawEndgameStrip(ctx, z.strip, D, roles);
}

function drawDysonRing(ov, ctx, r, D, segId, roles, hoverId) {
  const st = D.st;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2 + 8;
  const R = Math.max(30, Math.min(r.w, r.h) * CV.RING_FRAC);
  const T = Math.max(6, R * CV.RING_THICK);
  const arcs = ringArcs();
  // przyciemnienie pod liczbami w środku
  drawHeroDim(ctx, { x: cx - R, y: cy - R, w: 2 * R, h: 2 * R });
  ctx.save();
  ctx.lineCap = 'butt';
  for (const a of arcs) {
    const state = segmentState(a.segId, st, D.isResearched);
    const prog = Math.max(0, Math.min(1, Number(st?.segments?.[a.segId]?.progress) || 0));
    ctx.lineWidth = T;
    if (state === 'built') {
      ctx.globalAlpha = 1; ctx.strokeStyle = roles.primary;
      ctx.beginPath(); ctx.arc(cx, cy, R, a.a0, a.a1); ctx.stroke();
    } else if (state === 'current') {
      ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.strokeStyle = roles.primary;
      ctx.beginPath(); ctx.arc(cx, cy, R, a.a0, a.a1); ctx.stroke();
      if (prog > 0) {
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(cx, cy, R, a.a0, a.a0 + (a.a1 - a.a0) * prog); ctx.stroke();
      }
    } else {
      ctx.globalAlpha = CV.LOCKED_ALPHA; ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, R + T / 2, a.a0, a.a1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, R - T / 2, a.a0, a.a1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const mx = cx + Math.cos(a.mid) * R, my = cy + Math.sin(a.mid) * R;
    const hs = Math.round(T / 2 + 5);
    const box = { x: Math.round(mx - hs), y: Math.round(my - hs), w: 2 * hs, h: 2 * hs };
    if (a.segId === segId) drawSelectBrackets(ctx, box, roles);
    else if (a.segId === hoverId) {
      ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(box.x, box.y, box.w, box.h); ctx.globalAlpha = 1;
    }
    ov._addHit(box.x, box.y, box.w, box.h, 'selectSegment', { segmentId: a.segId });
  }
  // etykiety faz na zewnątrz pierścienia
  ctx.font = F(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  DYSON_PHASES.forEach((p, pi) => {
    const pa = arcs.filter((a) => a.phaseIdx === pi);
    const mid = (pa[0].a0 + pa[pa.length - 1].a1) / 2;
    const lx = cx + Math.cos(mid) * (R + T / 2 + 16), ly = cy + Math.sin(mid) * (R + T / 2 + 16);
    const ps = phaseState(p, st);
    const align = Math.cos(mid) > 0.2 ? 'left' : Math.cos(mid) < -0.2 ? 'right' : 'center';
    text(ctx, `${ROMAN[pi]} · ${en() ? p.nameEN : p.namePL}`, lx, ly, ps === 'locked' ? roles.dim : roles.primary, null, align);
  });
  ctx.restore();

  // środek: segmenty X / 20 + postęp dostaw
  const op = overallProgress(st);
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  const big = THEME.fontSizeInstrument ?? 32;
  text(ctx, t('dyson.segmentsHeader'), cx, cy - big / 2 - 6, roles.dim, F(THEME.fontSizeSmall), 'center');
  ctx.font = F(big); ctx.fillStyle = roles.primary;
  drawTabular(ctx, `${op.built} / ${op.total}`, cx, cy + big / 2 - 4, 'center');
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
  drawTabular(ctx, t('civConsole.dyOverall', Math.round(op.frac * 100)), cx, cy + big / 2 + 14, 'center');
  ctx.restore();

  // lewy górny róg: bieżąca faza jako instrument; prawy górny: etap gwiazdy
  const cp = currentPhase(st);
  drawInstrument(ctx, r.x, r.y, roles, { label: t('civConsole.dyCurrentPhase'), value: cp ? `${ROMAN[cp.index]} / IV` : '—',
    tone: cp ? 'primary' : 'dim' });
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall);
  const pname = cp ? (en() ? cp.phase.nameEN : cp.phase.namePL) : (st?.active ? '' : t('civConsole.dyNotStarted'));
  text(ctx, fit(ctx, pname, r.w / 3), r.x, r.y + THEME.fontSizeSmall + big + 22, roles.dim);
  const stage = getDysonVisualStage(op.built);
  text(ctx, `${t('dyson.stage')} ${stage} / 4`, r.x + r.w, r.y + THEME.fontSizeSmall, roles.dim, null, 'right');
  for (const [i, ln] of wrapLines(ctx, t(`dyson.stage${stage}`), Math.min(260, r.w / 3)).slice(0, 3).entries()) {
    text(ctx, ln, r.x + r.w, r.y + THEME.fontSizeSmall + 16 + i * 14, roles.dim, null, 'right');
  }
  if (!st?.active) {
    for (const [i, ln] of wrapLines(ctx, t('dyson.notUnlocked'), r.w * 0.8).entries()) {
      text(ctx, ln, cx, r.y + r.h - 30 + i * 14, roles.alert, null, 'center');
    }
  }
  ctx.restore();
}

function drawDysonInspector(ov, ctx, iz, D, segId, roles, hz) {
  const st = D.st;
  const def = DYSON_SEGMENTS[segId];
  const phase = DYSON_PHASES.find((p) => p.id === SEGMENT_TO_PHASE[segId]);
  const state = segmentState(segId, st, D.isResearched);
  const seg = st?.segments?.[segId];
  drawScrolledInspector(ov, ctx, iz, roles, t('civConsole.dySegment'), (x, y0, w, vis) => {
    const c = { x, y: y0, w };
    ctx.font = F(THEME.fontSizeMedium, true);
    for (const ln of wrapLines(ctx, `${segId}. ${en() ? def.nameEN : def.namePL}`, w).slice(0, 2)) { text(ctx, ln, x, c.y + 13, roles.primary); c.y += 18; }
    const pi = DYSON_PHASES.indexOf(phase);
    para(ctx, c, `${t(`civConsole.phaseN${pi + 1}`)} · ${en() ? phase.nameEN : phase.namePL}`, roles.dim);
    para(ctx, c, t(`civConsole.segState_${state}`), state === 'locked' ? roles.alert : roles.primary);
    const prog = Math.max(0, Math.min(1, Number(seg?.progress) || 0));
    kv(ctx, c, t('civConsole.dyProgress'), `${Math.round((seg?.completed ? 1 : prog) * 100)}%`, roles);
    drawBar(ctx, x, c.y, w, seg?.completed ? 1 : prog, roles); c.y += 8;

    // Koszt vs magazyn planety domowej
    eyebrow(ctx, c, t('civConsole.dyCostTitle', D.homeName ?? t('civConsole.homeUnknown')), roles);
    const costRows = segmentCostRows(segId, st, D.costMult, D.stockOf);
    ctx.font = F(THEME.fontSizeSmall);
    text(ctx, t('civConsole.dyColRes'), x, c.y + 11, roles.dim);
    text(ctx, t('civConsole.dyColNeed'), x + w * 0.68, c.y + 11, roles.dim, null, 'right');
    text(ctx, t('civConsole.dyColStock'), x + w, c.y + 11, roles.dim, null, 'right');
    c.y += CV.LINE_H;
    for (const cr of costRows) {
      const done = cr.remaining <= 0;
      const tone = done ? roles.dim : cr.short ? roles.alert : roles.primary;
      ctx.font = F(THEME.fontSizeNormal);
      text(ctx, fit(ctx, `${done ? '✓ ' : ''}${resName(cr.res)}`, w * 0.42), x, c.y + 12, tone);
      ctx.fillStyle = tone;
      drawTabular(ctx, `${fmtAmt(cr.delivered)} / ${fmtAmt(cr.need)}`, x + w * 0.68, c.y + 12, 'right');
      drawTabular(ctx, fmtAmt(cr.stock), x + w, c.y + 12, 'right');
      c.y += CONSOLE_KIT.KV_H + 2;
    }
    if (D.costMult < 1) para(ctx, c, t('civConsole.dyFabricator', bldName('orbital_fabricator'), Math.round((1 - D.costMult) * 100)), roles.dim);

    // Działania
    c.y += 6;
    if (seg?.completed) {
      para(ctx, c, `✓ ${t('dyson.segmentComplete')}`, roles.primary);
    } else {
      const can = D.sys?.canDeliver?.(segId) ?? { ok: false, reason: 'notUnlocked' };
      const gate = deliverGate(segId, can, costRows);
      const cw1 = Math.min(150, w / 2 - 4);
      const hov = (type) => hz?.type === type && hz.data?.segmentId === segId;
      const r1 = drawActionChip(ctx, x, c.y, cw1, roles, { label: t('civConsole.dyDeliver'), enabled: gate.ok, hover: hov('deliverMax') });
      const r2 = drawActionChip(ctx, x + cw1 + 8, c.y, cw1, roles, { label: t('civConsole.dyDeliverPct'), enabled: gate.ok, hover: hov('deliverPercent') });
      if (gate.ok && vis(c.y)) {
        ov._addHit(r1.x, r1.y, r1.w, r1.h, 'deliverMax', { segmentId: segId });
        ov._addHit(r2.x, r2.y, r2.w, r2.h, 'deliverPercent', { segmentId: segId, percent: 0.10 });
      }
      c.y += CONSOLE_KIT.CHIP_H + 4;
      if (gate.ok) para(ctx, c, t('civConsole.dyDeliverHint'), roles.dim);
      else {
        const tech = gate.reason === 'phaseNotUnlocked' ? techName(phaseTech(phase)) : gate.tech ? techName(gate.tech) : '';
        para(ctx, c, t(gate.reasonKey, tech), roles.alert);
      }
    }

    // Bonus badań
    eyebrow(ctx, c, t('civConsole.dyResearch'), roles);
    kv(ctx, c, t('civConsole.dyPerSegment'), `+${RESEARCH_PER_SEGMENT} ${t('civConsole.perYearResearch')}`, roles);
    kv(ctx, c, t('civConsole.dyResearchNow'), `+${st?.researchBonus ?? 0} ${t('civConsole.perYearResearch')}`, roles);

    // Powiązane technologie i budynki
    eyebrow(ctx, c, t('civConsole.dyRelated'), roles);
    const techs = [phaseTech(phase)];
    if (def.requiresTech && !techs.includes(def.requiresTech)) techs.push(def.requiresTech);
    if (!techs.includes('jump_gate_construction')) techs.push('jump_gate_construction');
    for (const id of techs) {
      const ok = D.isResearched(id);
      kv(ctx, c, fit(ctx, techName(id), w - 90), ok ? t('civConsole.researched') : t('civConsole.notResearched'), roles, ok ? 'primary' : 'dim');
    }
    const lvl = (id) => window.KOSMOS?.buildingSystem?._getBuildingLevel?.(id) ?? 0;
    for (const id of ['dyson_command', 'orbital_fabricator', 'stellar_collector_relay']) {
      const L = lvl(id);
      kv(ctx, c, fit(ctx, bldName(id), w - 90), L > 0 ? t('civConsole.bldLevel', L) : t('civConsole.notBuilt'), roles, L > 0 ? 'primary' : 'dim');
    }
    para(ctx, c, t('civConsole.dyFabricatorRule', bldName('orbital_fabricator')), roles.dim);
    return c.y - y0 + 8;
  });
}

// Pas: Faza I → II → III → IV → Brama Skoku → decyzja końcowa; bieżący krok w nawiasach z «tu jesteś»
function drawEndgameStrip(ctx, sr, D, roles) {
  const lh = drawZoneRule(ctx, sr, t('civConsole.stripEndgame'), roles);
  const r = { x: sr.x, y: sr.y + lh + 4, w: sr.w, h: Math.max(0, sr.h - lh - 4) };
  const steps = endgamePath(D.st, D.isResearched('jump_gate_construction'));
  const arrowW = 18;
  const cw = (r.w - arrowW * (steps.length - 1)) / steps.length;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  steps.forEach((s, i) => {
    const x = r.x + i * (cw + arrowW);
    const box = { x, y: r.y, w: cw, h: Math.min(r.h, 64) };
    const col = s.status === 'todo' ? roles.dim : roles.primary;
    let l1, l2, l3;
    if (s.kind === 'phase') {
      const pi = DYSON_PHASES.indexOf(s.phase);
      l1 = t(`civConsole.phaseN${pi + 1}`); l2 = en() ? s.phase.nameEN : s.phase.namePL; l3 = `${s.built} / ${s.total}`;
    } else if (s.kind === 'tech') {
      l1 = t('civConsole.techStep'); l2 = techName('jump_gate_construction'); l3 = s.done ? t('civConsole.researched') : t('civConsole.notResearched');
    } else { l1 = t('civConsole.endingStepShort'); l2 = t('civConsole.endingStep'); l3 = s.done ? t('civConsole.endingReached') : t('civConsole.endingRule'); }
    ctx.font = F(THEME.fontSizeSmall);
    if (s.status === 'current') text(ctx, t('civConsole.youAreHere'), x + 6, box.y + 12, roles.primary);
    else if (s.status === 'done') text(ctx, '✓', x + 6, box.y + 12, roles.primary);
    ctx.font = F(THEME.fontSizeNormal, s.status === 'current');
    text(ctx, fit(ctx, l1, cw - 12), x + 6, box.y + 28, col);
    ctx.font = F(THEME.fontSizeSmall);
    text(ctx, fit(ctx, l2, cw - 12), x + 6, box.y + 43, col);
    ctx.fillStyle = s.status === 'todo' ? roles.dim : roles.primary;
    drawTabular(ctx, fit(ctx, l3, cw - 12), x + 6, box.y + 57, 'left');
    if (s.status === 'current') drawSelectBrackets(ctx, box, roles);
    if (i < steps.length - 1) text(ctx, '→', x + cw + arrowW / 2, box.y + 30, roles.dim, F(THEME.fontSizeNormal), 'center');
  });
  ctx.restore();
}
