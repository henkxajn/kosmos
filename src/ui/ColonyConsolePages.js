// ColonyConsolePages — strony osadzone w konsoli Kolonii w idiomie zestawu konsol (ARC COLONY SPHERE CS-8c, plan §3.17).
//
// Załoga / Populacja / Stacja (inspektor), okno rekrutacji, pickery stacji (moduł / statek) i szuflada grupy jednostek —
// dotąd dzisiejszy wygląd okna kolonii osadzony w konsoli (D-CS-28 punkty 2 i 9, tymczasowe). Te same dane, te same
// sterowniki i te same typy stref trafień co dzisiejsze zakładki (handlery `ColonyOverlay._onHit` / `_handleDraftClick` /
// `_handleStationPickerClick` bez zmian); element niedostępny = wyłączony z powodem (`cReason`: podpowiedź + komunikat).
// Kolory wyłącznie przez role konsoli (`primary` / `dim` / `alert`), bez emoji. Modele wierszy — `ColonyConsolePagesLogic`.
// Okno płaskiej kolonii (dzisiejszy ekran) nie woła tego pliku.

import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale, getName } from '../i18n/i18n.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { CULTURAL_TRAITS } from '../data/MilestonesData.js';
import { STATIONS } from '../data/StationData.js';
import { TECHS } from '../data/TechData.js';
import { STATION_MODULES, stationModuleCost } from '../data/StationModuleData.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipCost } from '../data/ShipModulesData.js';
import { UNIT_ARCHETYPES, checkArchetypeUnlocked, GROUND_UNIT_CAP_EXEMPT } from '../data/unitArchetypes.js';
import { HUMANITY_UNITS } from '../data/factions/humanity.js';
import { GROUND_ABILITIES } from '../data/groundAbilities.js';
import EntityManager from '../core/EntityManager.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import { samePos } from '../map/TileGraph.js';
import { classifyStationDepot } from './StationPanelLogic.js';
import { drawEyebrow, drawKvRow, drawBar, drawActionChip, drawZoneFrame, drawSelectBrackets, drawConsoleBackground, CONSOLE_KIT } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';
import { COLONY_PAGES, pageScrollKey, crewRowsOf, crewSummaryOf, growthTipLines, satisfactionTipLines, targetTipLines, strataTipLines,
  populationPageOf, stationBuildOf, stationManageOf, modulePickerRowsOf, shipPickerRowsOf, recruitStateOf, groupDrawerOf,
  windowNextToInspector, drawerRect } from './ColonyConsolePagesLogic.js';

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const isEn = () => getLocale() === 'en';
const KOS = () => (typeof window !== 'undefined' ? window.KOSMOS : null);
const LINE = 15;

/** Tekst z `{key,args}` / `{text}` / napisu; argumenty-obiekty tłumaczone rekurencyjnie. */
export function trLine(x) {
  if (x == null) return '';
  if (typeof x === 'string' || typeof x === 'number') return String(x);
  if (x.text != null) return String(x.text);
  return t(x.key, ...(x.args ?? []).map((a) => (a && typeof a === 'object') ? trLine(a) : a));
}
const tipOf = (lines) => (lines ?? []).map((l) => ({ text: trLine(l), tone: l.tone ?? 'primary', bold: !!l.bold, wrap: !!l.wrap }));

function resLabel(id) {
  const c = COMMODITIES[id];
  if (c) return getName(c, 'commodity');
  const r = ALL_RESOURCES[id];
  if (r) return isEn() ? (r.nameEN ?? r.namePL ?? id) : (r.namePL ?? id);
  return id;
}
const techName = (id) => (TECHS[id] ? getName(TECHS[id], 'tech') : String(id ?? '?'));
/** Powód z modelu → tekst: identyfikator technologii → nazwa, lista towarów → nazwy (nigdy surowe id). */
function reasonText(key, args = []) {
  if (!key) return null;
  const a = args.map((v, i) => (Array.isArray(v) ? v.map(resLabel).join(', ') : (i === 0 && /reason\.tech$|reasonTech$/.test(key)) ? techName(v) : v));
  return t(key, ...a);
}
const defName = (def, fallback = '?') => (def ? (isEn() ? (def.nameEN ?? def.namePL) : def.namePL) ?? def.id ?? fallback : fallback);
const hov = (ov, x, y) => { const hz = ov._hoverZone; return !!hz && hz.x === x && hz.y === y; };

function wrapWords(ctx, text, maxW) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const out = []; let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Linia tekstu małym fontem w roli `tone`; zwraca wysokość. */
function note(ctx, x, y, w, text, roles, { tone = 'dim', size = THEME.fontSizeSmall, indent = 0, bold = false } = {}) {
  ctx.save();
  ctx.font = F(size, bold); ctx.fillStyle = roles[tone] ?? roles.primary; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(fit(ctx, text, w - indent), x + indent, y + LINE / 2);
  ctx.restore();
  return LINE;
}

/** Strefa: włączona → typ/dane; wyłączona → strefa powodu (`cReason`). `vis` — filtr pasma przewijania. */
function zoneOf(ov, r, { type, data = {}, enabled = true, reason = null }, vis = null) {
  if (vis && !vis(r.y, r.h)) return;
  if (enabled) ov._addHit(r.x, r.y, r.w, r.h, type, data);
  else ov._addHit(r.x, r.y, r.w, r.h, 'cReason', { tip: reason ?? '' });
}

/** „[ x ]” po prawej wiersza (anuluj / rozbierz): alert gdy włączone, dim gdy nie. Zwraca prostokąt. */
function rowX(ov, ctx, xr, y, h, roles, spec, vis) {
  const r = { x: xr - 30, y, w: 30, h };
  ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
  const on = spec.enabled !== false;
  if (hov(ov, r.x, r.y) && on) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.alert; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
  ctx.fillStyle = on ? roles.alert : roles.dim;
  ctx.fillText('[ x ]', r.x + r.w, r.y + r.h / 2);
  ctx.restore();
  zoneOf(ov, r, spec, vis);
  return r;
}

/** Stepper „[-] wartość [+]” (zestaw konsol): przyciski z dzisiejszymi strefami albo strefą powodu, środek opcjonalnie strefą. */
function stepper(ov, ctx, x, y, w, roles, { value, tone = 'primary', minus, plus, mid = null, dim = false, vis = null }) {
  const h = CONSOLE_KIT.CHIP_H, bw = 22;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  for (const [bx, glyph, b] of [[x, '-', minus], [x + w - bw, '+', plus]]) {
    const r = { x: bx, y, w: bw, h };
    if (hov(ov, r.x, r.y) && b.enabled) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
    ctx.fillStyle = b.enabled && !dim ? roles.primary : roles.dim;
    ctx.fillText(`[${glyph}]`, bx + bw / 2, y + h / 2);
    zoneOf(ov, r, b, vis);
  }
  ctx.fillStyle = dim ? roles.dim : (roles[tone] ?? roles.primary);
  ctx.fillText(fit(ctx, value, w - 2 * bw - 2), x + w / 2, y + h / 2);
  ctx.restore();
  if (mid && (!vis || vis(y, h))) ov._addHit(x + bw, y, w - 2 * bw, h, mid.type, mid.data ?? {});
}

/** Wiersz paska: klucz … wartość + pasek 2 px pod spodem. Zwraca wysokość. */
function barRow(ctx, x, y, w, label, value, frac, tone, roles) {
  drawKvRow(ctx, x, y, w, label, value, roles, { tone });
  drawBar(ctx, x, y + CONSOLE_KIT.KV_H - 1, w, frac, roles, { tone });
  return CONSOLE_KIT.KV_H + 5;
}

// ── Podpowiedź wielowierszowa ───────────────────────────────────────────────────────────────────────────────────────

/** Podpowiedź z kilku linii (dzisiejsze podpowiedzi HTML Załogi): tło motywu, ramka 1 px dim, linie w swoich rolach. */
export function drawTipLines(ctx, lines, anchor, frame, roles) {
  if (!lines?.length) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  const maxW = 340, pad = 6, lh = 15;
  const rows = [];
  for (const l of lines) {
    ctx.font = F(THEME.fontSizeSmall, l.bold);
    const parts = l.wrap ? wrapWords(ctx, l.text, maxW) : [l.text];
    for (const p of parts) rows.push({ ...l, text: p, w: Math.min(maxW, ctx.measureText(p).width) });
  }
  const w = Math.ceil(Math.max(...rows.map((r) => r.w))) + 2 * pad, h = rows.length * lh + 2 * pad - 2;
  const x = Math.max(frame.x, Math.min(anchor.x, frame.x + frame.w - w));
  const y = anchor.y + h > frame.y + frame.h ? Math.max(frame.y, anchor.y - h - (anchor.above ?? 22)) : anchor.y;
  ctx.globalAlpha = 0.95; ctx.fillStyle = THEME.bgPrimary; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  rows.forEach((r, i) => {
    ctx.font = F(THEME.fontSizeSmall, r.bold); ctx.fillStyle = roles[r.tone] ?? roles.primary;
    ctx.fillText(fit(ctx, r.text, maxW), x + pad, y + pad + i * lh + lh / 2 - 1);
  });
  ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ZAŁOGA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Budynki zatrudniające warstwę → `[[nazwa, liczba]]` (jak dzisiejszy `_strataBuildingsTooltip`). */
function strataBuildings(colony, strataType) {
  const counts = {};
  for (const [, entry] of colony?.buildingSystem?._active ?? []) {
    const b = entry.building;
    if (!b || (b.jobs ?? 0) <= 0 || (b.popType ?? 'laborer') !== strataType) continue;
    counts[b.id] = (counts[b.id] ?? 0) + 1;
  }
  return Object.entries(counts).map(([id, n]) => [defName(BUILDINGS[id], id), n]);
}

/**
 * Strona Załogi: rekrutacja, tabela warstw (płaca, cel udziału, obsada, droidy) w przewijanym paśmie i przypięte
 * podsumowanie u dołu. Strefy: `draft_open`, `targetMinus/Plus`, `targetState`, `droidRemove/Install`, `strataRow`, `wfInfo`.
 */
export function drawCrewPage(ov, ctx, rect, roles, colony, ordersOk, H) {
  const civ = colony?.civSystem;
  if (!civ?.getWorkforceBreakdown) { note(ctx, rect.x, rect.y, rect.w, t('colonyPages.noCiv'), roles); return; }
  const P = COLONY_PAGES, K = CONSOLE_KIT;
  const rows = crewRowsOf(civ.getWorkforceBreakdown(), { ordersOk, stateOf: (ty) => civ.getTargetState?.(ty), previewOf: (ty) => civ.getTargetHeadcountPreview?.(ty) });
  const body = { x: rect.x, y: rect.y, w: rect.w, h: Math.max(0, rect.h - P.CREW_SUMMARY_H - 4) };
  H.scrolled(ov, ctx, body, pageScrollKey('workforce'), roles, (x, y0, w, vis) => {
    let y = y0;
    const hasBarracks = (KOS()?.colonyManager?._getBarracksLevel?.(colony) ?? 0) > 0;
    y += H.actionChip(ov, ctx, x, y, w, roles, { label: t('groundPanel.draftBtn'), type: 'draft_open', data: { hasBarracks: true },
      enabled: hasBarracks, reason: t('groundPanel.needBarracks'), vis });
    y += 2;
    y += drawEyebrow(ctx, x, y, w, t('colonyPages.crew.strata'), roles);
    const stepX = x + w - P.CREW_STEP_W, wageR = stepX - 8;
    ctx.save(); ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.textAlign = 'right'; ctx.fillText(t('workforce.colWage').toUpperCase(), wageR, y + 6);
    ctx.textAlign = 'center'; ctx.fillText(t('workforce.colTarget').toUpperCase(), stepX + P.CREW_STEP_W / 2, y + 6);
    ctx.restore();
    y += 14;
    for (const r of rows) {
      const name = isEn() ? r.nameEN : r.namePL;
      if (!r.active) {
        drawKvRow(ctx, x, y, w, name, '—', roles, { tone: 'dim' });
        y += K.KV_H;
        continue;
      }
      const y1 = y, y2 = y + 17;
      // linia 1: nazwa · płaca · cel udziału [-] nn%≈P [+]
      ctx.save(); ctx.textBaseline = 'middle';
      ctx.font = F(THEME.fontSizeNormal); ctx.fillStyle = r.foreign ? roles.dim : roles.primary; ctx.textAlign = 'left';
      ctx.fillText(fit(ctx, name, wageR - x - 40), x, y1 + K.CHIP_H / 2);
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles[r.wageTone]; ctx.textAlign = 'right';
      ctx.fillText(r.wage, wageR, y1 + K.CHIP_H / 2);
      ctx.restore();
      const tgtTip = { tip: t('workforce.targetTooltip'), tipTone: 'dim' };
      stepper(ov, ctx, stepX, y1, P.CREW_STEP_W, roles, { value: r.shareText, tone: r.shareTone, dim: r.foreign, vis,
        minus: { type: 'targetMinus', data: { type: r.type, ...tgtTip }, enabled: r.targetMinus.enabled, reason: r.targetMinus.reasonKey ? t(r.targetMinus.reasonKey) : null },
        plus:  { type: 'targetPlus',  data: { type: r.type, ...tgtTip }, enabled: r.targetPlus.enabled,  reason: r.targetPlus.reasonKey ? t(r.targetPlus.reasonKey) : null },
        mid: r.stateTip ? { type: 'targetState', data: { tipLines: tipOf(targetTipLines(r.state, r.preview)) } } : null });
      // linia 2: obsada (pasek + liczby) · droidy [-] D n [+]
      const barW = Math.max(24, wageR - x - 70);
      drawBar(ctx, x, y2 + K.CHIP_H / 2 - 1, barW, r.staffing, roles, { tone: r.staffTone });
      note(ctx, x + barW + 6, y2 + (K.CHIP_H - LINE) / 2, wageR - x - barW - 6, r.capText, roles, { tone: r.saturated ? 'alert' : 'dim' });
      const drTip = { tip: t('workforce.droidTooltip'), tipTone: 'dim' };
      stepper(ov, ctx, stepX, y2, P.CREW_STEP_W, roles, { value: t('colonyPages.crew.droids', r.droids), tone: r.droids > 0 ? 'primary' : 'dim', dim: r.foreign, vis,
        minus: { type: 'droidRemove',  data: { type: r.type, ...drTip }, enabled: r.droidMinus.enabled, reason: r.droidMinus.reasonKey ? t(r.droidMinus.reasonKey) : null },
        plus:  { type: 'droidInstall', data: { type: r.type, ...drTip }, enabled: r.droidPlus.enabled,  reason: r.droidPlus.reasonKey ? t(r.droidPlus.reasonKey) : null } });
      // nazwa → budynki tej warstwy (podpowiedź)
      if (vis(y1, P.CREW_ROW_H)) ov._addHit(x, y1, wageR - x - 40, K.CHIP_H, 'strataRow', { type: r.type, tipLines: tipOf(strataTipLines(name, strataBuildings(colony, r.type))) });
      y += P.CREW_ROW_H + 2;
    }
    return y;
  });
  drawCrewSummary(ov, ctx, { x: rect.x, y: rect.y + rect.h - P.CREW_SUMMARY_H, w: rect.w - 6 }, roles, colony, civ);
}

function drawCrewSummary(ov, ctx, r, roles, colony, civ) {
  const K = KOS();
  const pros = K?.prosperitySystem;
  const income = (K?.colonyManager?.calculateTaxIncome?.(colony) ?? 0) + (colony?.creditsPerYear ?? 0);
  const rows = crewSummaryOf({
    humans: civ.humans ?? civ.population ?? 0, unemployed: civ.unemployed ?? 0, satisfaction: civ.satisfaction ?? 50,
    prosperity: pros && K?.civSystem === civ ? { cur: pros.prosperity ?? 50, tgt: pros.targetProsperity ?? 50 } : null,
    growth: civ.getAnnualGrowth?.() ?? 0, income, wages: civ.getTotalLaborCost?.() ?? 0,
  });
  let y = r.y;
  y += drawEyebrow(ctx, r.x, y, r.w, t('colonyPages.crew.summary'), roles);
  const half = Math.floor((r.w - 12) / 2);
  const narrow = rows.filter((q) => !q.wide), wide = rows.filter((q) => q.wide);
  narrow.forEach((q, i) => {
    const cx = r.x + (i % 2) * (half + 12), cy = y + Math.floor(i / 2) * CONSOLE_KIT.KV_H;
    drawKvRow(ctx, cx, cy, half, t(q.labelKey), q.value, roles, { tone: q.tone, unit: q.unitKey ? `/${t(q.unitKey)}` : '' });
    if (q.tip) {
      const lines = q.tip === 'growth' ? growthTipLines(civ.getGrowthBreakdown?.()) : satisfactionTipLines(civ.getSatisfactionBreakdown?.());
      ov._addHit(cx, cy, half, CONSOLE_KIT.KV_H, 'wfInfo', { tipLines: tipOf(lines) });
    }
  });
  y += Math.ceil(narrow.length / 2) * CONSOLE_KIT.KV_H;
  for (const q of wide) {
    drawKvRow(ctx, r.x, y, r.w, t(q.labelKey), q.value, roles, { tone: q.tone, unit: `${q.unit ?? ''}/${t(q.unitKey)}` });
    y += CONSOLE_KIT.KV_H;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// POPULACJA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Migawka strony Populacji — te same odczyty co dzisiejsza `_drawPopulationTab`. */
function populationSnapshot(ov, colony) {
  const civ = colony?.civSystem ?? null, rs = colony?.resourceSystem ?? null, ps = colony?.prosperitySystem ?? null, bs = colony?.buildingSystem ?? null;
  const en = isEn();
  const traits = (civ?.identity?.traits ?? []).map((id) => {
    const tr = CULTURAL_TRAITS[id];
    return { name: tr ? (en ? tr.nameEN : tr.namePL) : id, effect: tr ? (en ? tr.effectEN : tr.effectPL) : '' };
  });
  const events = [];
  if (civ?.isUnrest) events.push({ nameKey: 'popPanel.crisisUnrest', descKey: 'popPanel.crisisUnrestDesc' });
  if (civ?.isFamine) events.push({ nameKey: 'popPanel.crisisFamine', descKey: 'popPanel.crisisFamineDesc' });
  if (rs?.energy?.brownout) events.push({ nameKey: 'popPanel.crisisBrownout', descKey: 'popPanel.crisisBrownoutDesc' });
  const needs = (ov._calcPopNeeds?.(civ, rs, civ?.population ?? 0) ?? []).map((n) => ({ name: n.name, ratio: n.ratio, penalty: n.penalty, pooled: !!n.pooled }));
  let epoch = null, goods = [];
  if (ps) {
    const ep = ps._getCurrentEpoch?.() ?? { unlockedGoods: [], key: 'early' };   // ⚠ mutuje epochScore — czytać PO tym wywołaniu (jak dziś)
    const names = { early: 'epoch.early', developing: 'epoch.developing', advanced: 'epoch.advanced', cosmic: 'epoch.space' };
    epoch = { nameKey: names[ep.key] ?? 'epoch.early', score: Math.round(ps.epochScore ?? 0) };
    goods = ['basic_supplies', 'civilian_goods', 'neurostimulants'].filter((id) => COMMODITIES[id]).map((id) => ({
      name: getName(COMMODITIES[id], 'commodity'), unlocked: !!ep.unlockedGoods?.includes(id),
      demand: ps.getDemand?.(id) ?? 0, production: ps.getProduction?.(id) ?? 0, sat: ps.getSatisfaction?.(id) ?? 0 }));
  }
  const strata = (civ?.getStrataBreakdown?.() ?? []).filter((s) => s.count > 0).map((s) => ({ name: en ? s.nameEN : s.namePL, satisfaction: s.satisfaction ?? 0 }));
  let housing = null;
  if (bs?._active) {
    housing = [];
    for (const [, entry] of bs._active) {
      const b = entry.building, h = entry.housing ?? 0;
      if (b && h > 0) housing.push({ name: getName(b, 'building'), level: entry.level ?? 1, housing: h });
    }
  }
  return { loyalty: civ?.loyalty ?? 80, identity: civ?.identity?.score ?? 0, traits, events, needs, layers: ps?.getLayerScores?.() ?? {},
    growthMult: ps?.getGrowthMultiplier?.() ?? 1.0, epoch, goods, strata, housing };
}

/** Strona Populacji (tylko odczyt): stabilność, potrzeby, dobrobyt, konsumpcja, grupy społeczne, zakwaterowanie. */
export function drawPopulationPage(ov, ctx, rect, roles, colony, H) {
  if (!colony?.civSystem) { note(ctx, rect.x, rect.y, rect.w, t('colonyPages.noCiv'), roles); return; }
  const sections = populationPageOf(populationSnapshot(ov, colony));
  H.scrolled(ov, ctx, rect, pageScrollKey('populacja'), roles, (x, y0, w) => {
    let y = y0;
    for (const s of sections) {
      y += drawEyebrow(ctx, x, y, w, t(s.titleKey), roles);
      for (const r of s.rows) {
        const label = r.label ?? (r.labelKey ? t(r.labelKey) : '');
        if (r.kind === 'bar') y += barRow(ctx, x, y, w, label, r.value, r.frac, r.tone, roles);
        else if (r.kind === 'kv') {
          const v = r.value ?? (r.valueKey ? t(r.valueKey, ...(r.valueArgs ?? [])) : '');
          if (r.total) { ctx.save(); ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y + 1.5); ctx.lineTo(x + w, y + 1.5); ctx.stroke(); ctx.restore(); y += 4; }
          drawKvRow(ctx, x, y, w, label, v, roles, { tone: r.tone ?? 'primary' });
          y += CONSOLE_KIT.KV_H;
        } else if (r.kind === 'sub') y += note(ctx, x, y + 2, w, label.toUpperCase(), roles, { size: THEME.fontSizeSmall - 1 }) + 2;
        else y += note(ctx, x, y, w, trLine(r), roles, { tone: r.tone ?? 'dim', indent: r.indent ?? 0 });
      }
      y += 6;
    }
    return y;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// STACJA
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const STATION_HEADER_H = 24;

/**
 * Strona Stacji (przełącznik nagłówka konsoli): stacja grupy istnieje → zarządzanie (nazwa przypięta, moduły, stocznia,
 * depot), zlecenie w kolejce → wiersz z anulowaniem u wystawcy, brak → formularz budowy. Strefy dzisiejsze
 * (`station_mgmt_*`, `station_cancel_order`, `station_pick_target`, `station_build`); przy otwartym pickerze strefy strony
 * nie powstają (jak dziś — picker jest oknem modalnym).
 */
export function drawStationPage(ov, ctx, rect, roles, colony, H) {
  if (!colony) return;
  const gs = ov._resolveStationGroupState(colony);
  const live = !(ov._stationPickerOpen || ov._stationShipPickerOpen);
  if (gs.state === 'exists') return drawStationManage(ov, ctx, rect, roles, gs.station, live, H);
  if (gs.state === 'pending') {
    const o = gs.order;
    const nm = o?.targetName ?? EntityManager.get(gs.targetBodyId)?.name ?? gs.targetBodyId ?? '?';
    return H.scrolled(ov, ctx, rect, pageScrollKey('stacja'), roles, (x, y0, w, vis) => {
      let y = y0;
      y += note(ctx, x, y, w, t('colonyPages.station.groupOf', nm), roles);
      y += drawEyebrow(ctx, x, y, w, t('station.pending'), roles);
      drawKvRow(ctx, x, y, w - 36, o?.targetName ?? o?.targetBodyId ?? '?', t('colonyPages.station.queued'), roles, { tone: 'dim' });
      if (live) rowX(ov, ctx, x + w, y, CONSOLE_KIT.KV_H, roles, { type: 'station_cancel_order', data: { orderId: o?.id, planetId: gs.issuerColonyId, tip: t('colonyPages.tip.cancelStation'), tipTone: 'alert' } }, vis);
      return y + CONSOLE_KIT.KV_H + 4;
    });
  }
  // stan „build”: cele (planeta + księżyce), koszt, budowa
  const targets = [];
  if (colony.planet) targets.push(colony.planet);
  for (const m of EntityManager.getByType('moon').filter((q) => q.parentPlanetId === colony.planetId)) targets.push(m);
  const def = STATIONS.orbital_station;
  const res = colony.resourceSystem;
  const cost = [...Object.entries(def.cost ?? {}), ...Object.entries(def.commodityCost ?? {})]
    .map(([id, need]) => ({ id, name: resLabel(id), need, have: res?.getAmount?.(id) ?? res?.inventory?.get?.(id) ?? 0 }));
  const m = stationBuildOf({ targets, selectedId: ov._stationTargetId, cost, canAfford: ov._canAfford(colony, def) });
  ov._stationTargetId = m.selectedId;
  H.scrolled(ov, ctx, rect, pageScrollKey('stacja'), roles, (x, y0, w, vis) => {
    let y = y0;
    y += drawEyebrow(ctx, x, y, w, t('station.target'), roles);
    for (const b of m.targets) {
      const r = { x, y, w, h: CONSOLE_KIT.ROW_H };
      if (m.pickable && hov(ov, r.x, r.y) && !b.sel) { ctx.save(); ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore(); }
      drawKvRow(ctx, x + 6, y + 1, w - 12, b.name, t(b.moon ? 'colonyPages.station.moon' : 'colonyPages.station.planet'), roles, { tone: b.sel ? 'primary' : 'dim' });
      if (b.sel && m.pickable) drawSelectBrackets(ctx, r, roles);
      if (m.pickable) zoneOf(ov, r, { type: 'station_pick_target', data: { bodyId: b.id } }, vis);
      y += CONSOLE_KIT.ROW_H + 2;
    }
    y += 4;
    y += drawEyebrow(ctx, x, y, w, t('station.cost'), roles);
    for (const c of m.cost) { drawKvRow(ctx, x, y, w, c.name, `${c.have} / ${c.need}`, roles, { tone: c.tone }); y += CONSOLE_KIT.KV_H; }
    y += 6;
    y += H.actionChip(ov, ctx, x, y, w, roles, { label: t('station.build'), type: 'station_build', data: {}, enabled: true, vis });
    y += note(ctx, x, y, w, t(m.noteKey), roles);
    return y + 4;
  });
}

function drawStationManage(ov, ctx, rect, roles, station, live, H) {
  ov._selectedStationId = station.id;
  const m = stationManageOf(station, { moduleDef: (ty) => STATION_MODULES[ty] ?? null, maxModules: STATIONS[station.stationType]?.maxModules ?? 8 });
  // nazwa przypięta nad przewijaniem + [ ZMIEŃ NAZWĘ ] (dzisiejsza strefa `station_mgmt_rename`)
  ctx.save(); ctx.textBaseline = 'middle';
  const chipTxt = t('colonyPages.station.rename');
  ctx.font = F(THEME.fontSizeSmall);
  const cw = Math.ceil(ctx.measureText(`[ ${chipTxt.toUpperCase()} ]`).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
  ctx.fillText(fit(ctx, (station.name ?? station.id).toUpperCase(), rect.w - cw - 14), rect.x, rect.y + 9);
  ctx.restore();
  const cr = { x: rect.x + rect.w - cw - 6, y: rect.y, w: cw };
  drawActionChip(ctx, cr.x, cr.y, cr.w, roles, { label: chipTxt, enabled: live, hover: hov(ov, cr.x, cr.y) });
  if (live) ov._addHit(cr.x, cr.y, cr.w, CONSOLE_KIT.CHIP_H, 'station_mgmt_rename', {});
  const body = { x: rect.x, y: rect.y + STATION_HEADER_H, w: rect.w, h: Math.max(0, rect.h - STATION_HEADER_H) };
  H.scrolled(ov, ctx, body, pageScrollKey('stacja'), roles, (x, y0, w, vis) => {
    let y = y0;
    const vz = live ? vis : () => false;   // picker otwarty → bez stref strony
    for (const s of m.stats) { drawKvRow(ctx, x, y, w, t(s.labelKey), s.value ?? t(s.valueKey), roles, { tone: s.tone }); y += CONSOLE_KIT.KV_H; }
    if (m.noCrewHint) y += note(ctx, x, y, w, t('station.mgmt.noCrewHint'), roles, { tone: 'alert' });
    y += 4;
    y += drawEyebrow(ctx, x, y, w, `${t('station.mgmt.slots')} ${m.slotsUsed}/${m.maxModules}`, roles);
    for (const mod of m.modules) {
      const nm = `${defName(STATION_MODULES[mod.moduleType], mod.moduleType)}${mod.level ? ` Lv${mod.level}` : ''}`;
      drawKvRow(ctx, x, y + 1, w - 36, nm, t(mod.status.key), roles, { tone: mod.dim ? 'dim' : mod.status.tone });
      rowX(ov, ctx, x + w, y, CONSOLE_KIT.KV_H + 2, roles, mod.demolish.blocked
        ? { type: 'station_mgmt_demolish_blocked', data: { tip: t('station.mgmt.demolishBlocked'), tipTone: 'alert' }, enabled: true }
        : { type: 'station_mgmt_demolish', data: { moduleId: mod.id, moduleType: mod.moduleType, tip: t('colonyPages.tip.demolishModule'), tipTone: 'alert' } }, vz);
      y += CONSOLE_KIT.KV_H + 2;
    }
    for (const o of m.pending) {
      drawKvRow(ctx, x, y + 1, w - 36, defName(STATION_MODULES[o.moduleType], o.moduleType), o.building ? `${Math.round(o.frac * 100)}%` : t('colonyPages.station.waiting'), roles, { tone: o.building ? 'primary' : 'dim' });
      if (o.building) drawBar(ctx, x, y + CONSOLE_KIT.KV_H, w - 36, o.frac, roles);
      rowX(ov, ctx, x + w, y, CONSOLE_KIT.KV_H + 2, roles, { type: 'station_mgmt_cancelmodule', data: { orderId: o.id, tip: t('colonyPages.tip.cancelModule'), tipTone: 'alert' } }, vz);
      y += CONSOLE_KIT.KV_H + 4;
    }
    y += 2;
    const add = m.addModule;
    y += H.actionChip(ov, ctx, x, y, w, roles, { label: t('station.mgmt.addModule'), type: 'station_mgmt_addslot', data: {}, enabled: add.enabled,
      reason: reasonText(add.reasonKey, add.reasonArgs), vis: vz });
    if (m.shipyard) {
      y += 4;
      y += drawEyebrow(ctx, x, y, w, t('station.mgmt.shipQueue'), roles);
      y += H.actionChip(ov, ctx, x, y, w, roles, { label: t('station.mgmt.buildShip'), type: 'station_mgmt_addship', data: {}, enabled: true, vis: vz });
      if (!m.shipQueue.length) y += note(ctx, x, y, w, t('station.mgmt.shipQueueEmpty'), roles);
      for (const q of m.shipQueue) {
        drawKvRow(ctx, x, y + 1, w - 36, defName(SHIPS[q.shipId] ?? HULLS[q.shipId], q.shipId), `${Math.round(q.frac * 100)}%`, roles);
        drawBar(ctx, x, y + CONSOLE_KIT.KV_H, w - 36, q.frac, roles);
        rowX(ov, ctx, x + w, y, CONSOLE_KIT.KV_H + 2, roles, { type: 'station_mgmt_cancelship', data: { index: q.index, tip: t('colonyPages.tip.cancelShip'), tipTone: 'alert' } }, vz);
        y += CONSOLE_KIT.KV_H + 4;
      }
    } else {
      y += note(ctx, x, y, w, t('colonyPages.station.noShipyard'), roles);
    }
    // depot (tylko odczyt) — pula układu / magazyn kolonii macierzystej / własny depot (jak dziś)
    y += 4;
    y += drawEyebrow(ctx, x, y, w, t('station.depot'), roles);
    const mother = resolveHomeColony(station);
    if (mother) {
      const snap = KOS()?.systemPoolService?.getPoolSnapshot?.(mother.planetId);
      if (snap) {
        y += note(ctx, x, y, w, t('station.systemPool'), roles, { tone: 'primary' });
        y += note(ctx, x, y, w, snap.byBody.map((b) => b.colony.name ?? b.colony.planetId).join(', '), roles, { indent: 8 });
        for (const [id, amt] of [...snap.total].filter(([, v]) => v > 0).slice(0, 10)) { drawKvRow(ctx, x + 8, y, w - 8, resLabel(id), String(Math.round(amt)), roles); y += CONSOLE_KIT.KV_H; }
      } else {
        y += note(ctx, x, y, w, t('station.sharedStorage'), roles);
        y += note(ctx, x, y, w, mother.name ?? mother.planetId, roles, { tone: 'primary', indent: 8 });
      }
    } else {
      if (station.depotDetached) y += note(ctx, x, y, w, t('station.cutOffFromSupply'), roles, { tone: 'alert' });
      const depot = classifyStationDepot([...(station.depot?.inventory ?? [])]);
      if (!depot.resources.length && !depot.commodities.length) y += note(ctx, x, y, w, t('station.depotEmpty'), roles);
      for (const [label, list] of [[t('station.resources'), depot.resources], [t('station.commodities'), depot.commodities]]) {
        if (!list.length) continue;
        y += note(ctx, x, y, w, label.toUpperCase(), roles, { size: THEME.fontSizeSmall - 1 });
        for (const [id, amt] of list) { drawKvRow(ctx, x + 8, y, w - 8, resLabel(id), String(Math.round(amt)), roles); y += CONSOLE_KIT.KV_H; }
      }
    }
    return y + 4;
  });
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// OKNA OBOK STREFY INSPEKTORA (modalne: rekrutacja, pickery stacji)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Rama okna: przygaszenie konsoli, tło motywu, nawiasy primary, tytuł + „[ x ]”. Zwraca prostokąt treści. */
function windowFrame(ov, ctx, win, frame, roles, title, closeType) {
  ctx.save();
  ctx.globalAlpha = 0.35; ctx.fillStyle = THEME.bgPrimary; ctx.fillRect(frame.x, frame.y, frame.w, frame.h); ctx.globalAlpha = 1;
  ctx.restore();
  drawConsoleBackground(ctx, win);
  drawZoneFrame(ctx, win, roles, { tone: 'primary' });
  ctx.save();
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary; ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, String(title).toUpperCase(), win.w - 50), win.x + 8, win.y + 12);
  const cl = { x: win.x + win.w - 34, y: win.y + 2, w: 30, h: 20 };
  const hv = hov(ov, cl.x, cl.y);
  ctx.font = F(THEME.fontSizeSmall); ctx.textAlign = 'right';
  ctx.fillStyle = hv ? roles.alert : roles.dim;
  ctx.fillText('[ x ]', cl.x + cl.w - 2, cl.y + cl.h / 2);
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(win.x + 6, win.y + 24.5); ctx.lineTo(win.x + win.w - 6, win.y + 24.5); ctx.stroke();
  ctx.restore();
  ov._addHit(cl.x, cl.y, cl.w, cl.h, closeType, {});
  return { x: win.x + 8, y: win.y + 30, w: win.w - 16, h: win.h - 36 };
}

/** Przewijane pasmo okna (clip → strefy przycięte do pasma → pasek 2 px). `body(y0)` rysuje i zwraca koniec treści. */
function windowScroll(ov, ctx, r, scroll, roles, body) {
  const hitStart = ov._hitZones.length;
  ctx.save(); ctx.beginPath(); ctx.rect(r.x - 2, r.y, r.w + 4, r.h); ctx.clip();
  const end = body(r.y - scroll);
  ctx.restore();
  const contentH = Math.max(0, end - (r.y - scroll));
  ov._pruneHitsOutside(hitStart, r.y, r.y + r.h);
  const th = scrollThumb(scroll, contentH, r.h, r.y);
  if (th) {
    ctx.save();
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(r.x + r.w + 2, r.y, CONSOLE_KIT.SCROLLBAR_W, r.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(r.x + r.w + 2, th.y, CONSOLE_KIT.SCROLLBAR_W, th.h);
    ctx.restore();
  }
  return contentH;
}

/** Koszt w jednej-dwóch liniach: „nazwa ma/potrzeba”, brak w roli alert. Zwraca wysokość. */
function costLines(ctx, x, y, w, parts, roles, maxLines = 2) {
  ctx.save(); ctx.font = F(THEME.fontSizeSmall - 1); ctx.textBaseline = 'middle';
  let cx = x, line = 0;
  for (const p of parts) {
    const txt = `${resLabel(p.id)} ${Math.floor(p.have)}/${p.need}`;
    const tw = ctx.measureText(txt).width;
    if (cx > x && cx + tw > x + w) { line++; cx = x; if (line >= maxLines) break; }
    ctx.fillStyle = p.short ? roles.alert : roles.dim;
    ctx.fillText(txt, cx, y + line * 13 + 6);
    cx += tw + 10;
  }
  ctx.restore();
  return (Math.min(line, maxLines - 1) + 1) * 13;
}

/** Picker modułu / statku stacji jako okno obok inspektora. Strefy `station_mgmt_*` jak dziś + `cReason` dla wyłączonych. */
export function drawStationPickerWindow(ov, ctx, zones, roles) {
  const station = ov._getSelectedStation?.();
  if (!station) { ov._stationPickerOpen = false; ov._stationShipPickerOpen = false; return; }
  const ship = !!ov._stationShipPickerOpen;
  const techOk = (tech) => KOS()?.techSystem?.isResearched?.(tech) ?? false;
  const haveOf = (id) => station.depot?.getAmount?.(id) ?? 0;
  const rows = ship
    ? shipPickerRowsOf(KOS()?.unitDesigns ?? [], { hullOf: (id) => HULLS[id] ?? SHIPS[id] ?? null,
      costOf: (hull, mods) => { const c = calcShipCost(hull, mods); return { ...c.cost, ...c.commodityCost }; }, techOk, haveOf })
    : modulePickerRowsOf(Object.keys(STATION_MODULES), station, { moduleDef: (ty) => STATION_MODULES[ty] ?? null, costOf: (ty) => stationModuleCost(ty),
      techOk, maxModules: STATIONS[station.stationType]?.maxModules ?? 8, haveOf });
  const ROW = 48;
  const win = windowNextToInspector(zones, 36 + Math.max(1, rows.length) * ROW + 8);
  if (!win) return;
  const c = windowFrame(ov, ctx, win, zones.frame ?? win, roles, t(ship ? 'station.mgmt.shipPicker' : 'station.mgmt.picker'),
    ship ? 'station_mgmt_shippicker_close' : 'station_mgmt_picker_close');
  if (!rows.length) note(ctx, c.x, c.y, c.w, t('station.mgmt.noDesigns'), roles);
  const contentH = rows.length * ROW;
  const scroll = clampScroll(ov._stationShipPickerScroll ?? 0, contentH, c.h);
  ov._stationShipPickerScroll = scroll;
  windowScroll(ov, ctx, c, scroll, roles, (y0) => {
    let y = y0;
    for (const r of rows) {
      const chipW = 74, tx = c.w - chipW - 8;
      const name = ship ? (r.name ?? defName(HULLS[r.hullId] ?? SHIPS[r.hullId], r.hullId)) : defName(STATION_MODULES[r.type], r.type);
      ctx.save(); ctx.textBaseline = 'middle';
      ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = r.locked ? roles.dim : roles.primary;
      ctx.fillText(fit(ctx, name, tx - 4), c.x, y + 9);
      ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim;
      const sub = ship ? t('colonyPages.picker.shipSub', defName(HULLS[r.hullId] ?? SHIPS[r.hullId], r.hullId), r.modCount)
        : t('colonyPages.picker.moduleSub', `${r.energy >= 0 ? '+' : ''}${r.energy}`, r.crew);
      ctx.fillText(fit(ctx, sub, tx - 4), c.x, y + 22);
      ctx.restore();
      costLines(ctx, c.x, y + 28, tx - 4, r.cost, roles, 1);
      const cr = { x: c.x + c.w - chipW, y: y + 2, w: chipW, h: CONSOLE_KIT.CHIP_H };
      drawActionChip(ctx, cr.x, cr.y, cr.w, roles, { label: t('station.mgmt.build'), enabled: r.canBuild, hover: hov(ov, cr.x, cr.y) });
      const data = ship ? { hullId: r.hullId, modules: r.modules, name: r.name } : { moduleType: r.type };
      zoneOf(ov, cr, { type: ship ? 'station_mgmt_buildship' : 'station_mgmt_build', data, enabled: r.canBuild, reason: reasonText(r.reasonKey, r.reasonArgs) });
      ctx.save(); ctx.strokeStyle = roles.dim; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(c.x, y + ROW - 2.5); ctx.lineTo(c.x + c.w, y + ROW - 2.5); ctx.stroke(); ctx.restore();
      y += ROW;
    }
    return y;
  });
  ov._addHit(win.x, win.y, win.w, win.h, ship ? 'station_mgmt_shippicker_bg' : 'station_mgmt_picker_bg', {});
}

function archName(archId) {
  const own = HUMANITY_UNITS[archId]?.name;
  if (own) return own;
  const k = `unit.${archId}.name`, v = t(k);
  return v !== k ? v : t('groundPanel.unnamedArchetype');
}
/** Miniatura modelu archetypu z cache panelu rekrutacji (gotowa — obraz; inaczej null i odświeżenie, gdy się wczytuje). */
function unitArt(ov, archId) {
  const img = ov._draftPanel?._ensureSprite?.(archId) ?? null;
  const st = img?._kosmosAsset;
  if ((st === 'glb' || st === 'png') && img.complete !== false) return img;
  if (img?.complete && img.naturalWidth > 0 && !st) return img;
  if (st === 'loading' && KOS()?.uiManager) KOS().uiManager._dirty = true;
  return null;
}

/**
 * Okno rekrutacji obok inspektora: kafle archetypów (`ground:select_tile`), opis i statystyki wybranego, koszt, koszary,
 * czip rekrutacji (`ground:recruit`) albo powód. Stan wyboru i wynik rozkazu — dzisiejszy `GroundUnitPanel` (scoped do
 * oglądanej kolonii); przewijanie opisu — jego `_scrollRight` (kółko w `handleScroll` jak dziś).
 */
export function drawRecruitWindow(ov, ctx, zones, roles, colony) {
  const panel = ov._draftPanel;
  if (!panel) return;
  const K = KOS(), colMgr = K?.colonyManager;
  const win = windowNextToInspector(zones, (zones.hero?.h ?? 600));
  if (!win) return;
  const c = windowFrame(ov, ctx, win, zones.frame ?? win, roles, t('groundPanel.title'), 'draft_close');
  let y = c.y;
  y += note(ctx, c.x, y, c.w, `${colony?.name ?? '—'} · ${Math.floor(colony?.civSystem?.population ?? 0)} POP`, roles);
  // kafle archetypów
  const barracksLv = colMgr?._getBarracksLevel?.(colony) ?? 0;
  const archs = Object.keys(UNIT_ARCHETYPES);
  const cols = Math.min(4, archs.length), gap = 6, tw = Math.floor((c.w - gap * (cols - 1)) / cols), th = 54;
  archs.forEach((id, i) => {
    const r = { x: c.x + (i % cols) * (tw + gap), y: y + 4 + Math.floor(i / cols) * (th + gap), w: tw, h: th };
    const g = checkArchetypeUnlocked(id, barracksLv, K?.techSystem);
    const sel = panel._selectedArchetypeId === id;
    if (hov(ov, r.x, r.y) && !sel) { ctx.save(); ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.restore(); }
    const art = unitArt(ov, id), sz = 30;
    ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (art) { ctx.globalAlpha = g.unlocked ? 1 : 0.55; ctx.drawImage(art, r.x + (r.w - sz) / 2, r.y + 2, sz, sz); ctx.globalAlpha = 1; }
    ctx.font = F(THEME.fontSizeSmall - 1, sel); ctx.fillStyle = g.unlocked ? roles.primary : roles.dim;
    ctx.fillText(fit(ctx, archName(id), r.w - 4), r.x + r.w / 2, r.y + sz + 8);
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, g.unlocked ? t(`groundPanel.role.${UNIT_ARCHETYPES[id].role}`) : t('colonyPages.locked'), r.w - 4), r.x + r.w / 2, r.y + sz + 19);
    ctx.restore();
    if (sel) drawSelectBrackets(ctx, r, roles);
    ov._addHit(r.x, r.y, r.w, r.h, 'ground:select_tile', { archetypeId: id });
  });
  y += 4 + Math.ceil(archs.length / cols) * (th + gap) + 2;
  // stan rekrutacji (ta sama kolejność warunków co dziś)
  const archId = panel._selectedArchetypeId;
  const arch = UNIT_ARCHETYPES[archId] ?? {};
  const cost = panel._getRecruitCost();
  const slots = colMgr?._getBarracksSlots?.(colony) ?? 0, queue = colony?.groundUnitQueues?.length ?? 0;
  const maxUnits = colMgr?._getMaxGroundUnits?.(colony) ?? 0;
  const st = recruitStateOf({ hasColony: !!colony, gate: panel._getGatingStatus(), slots, queue, capOK: colMgr?._canRecruitMoreUnits?.(colony, archId) ?? true,
    maxUnits, canAfford: panel._canAfford(colony) });
  const active = (K?.groundUnitManager?.getUnitsOnPlanet?.(colony?.planetId) ?? [])
    .filter((u) => (u.owner === 'player' || u.factionId === 'humanity') && !GROUND_UNIT_CAP_EXEMPT.has(u.archetypeId)).length;
  // dół okna przypięty: koszary, czip, powód / wynik
  const footH = 18 + CONSOLE_KIT.CHIP_H + 6 + 2 * LINE;
  const detail = { x: c.x, y, w: c.w - 6, h: Math.max(40, c.y + c.h - footH - y - 4) };
  const scroll = clampScroll(panel._scrollRight ?? 0, ov._cRecruitContentH ?? 0, detail.h);
  panel._scrollRight = scroll;
  ov._cRecruitContentH = windowScroll(ov, ctx, detail, scroll, roles, (y0) => {
    let yy = y0;
    yy += note(ctx, detail.x, yy, detail.w, archName(archId).toUpperCase(), roles, { tone: 'primary', bold: true, size: THEME.fontSizeNormal });
    ctx.save(); ctx.font = F(THEME.fontSizeSmall - 1);
    for (const ln of wrapWords(ctx, isEn() ? (arch.descriptionEN ?? '') : (arch.descriptionPL ?? ''), detail.w)) yy += note(ctx, detail.x, yy, detail.w, ln, roles, { size: THEME.fontSizeSmall - 1 });
    ctx.restore();
    yy += drawEyebrow(ctx, detail.x, yy + 2, detail.w, t('cmdPages.ground.stats'), roles) + 2;
    const bs = arch.baseStats ?? {};
    for (const k of ['hp', 'ac', 'dmg', 'rng', 'mov']) { drawKvRow(ctx, detail.x, yy, detail.w, t(`groundPanel.stat.${k}.full`).split(' — ')[0], String(bs[k] ?? '—'), roles); yy += CONSOLE_KIT.KV_H; }
    drawKvRow(ctx, detail.x, yy, detail.w, t('groundPanel.stat.supply'), `${arch.baseSupplyCap ?? 100} (−${arch.supplyConsumption ?? 2}/y)`, roles); yy += CONSOLE_KIT.KV_H;
    // zdolność (dziś: nazwa + opis w podpowiedzi) — w konsoli opis wprost pod nazwą
    const ab = arch.ability ? GROUND_ABILITIES[arch.ability] : null;
    if (ab) {
      yy += drawEyebrow(ctx, detail.x, yy + 2, detail.w, t('groundPanel.ability'), roles) + 2;
      const kind = ab.type === 'active' || ab.active ? t('groundPanel.ability.active') : t('groundPanel.ability.passive');
      drawKvRow(ctx, detail.x, yy, detail.w, isEn() ? (ab.nameEN ?? ab.id) : (ab.namePL ?? ab.id), `${kind}${ab.cooldown > 0 ? ` · ${t('groundPanel.ability.cooldown')} ${ab.cooldown}` : ''}`, roles, { tone: 'dim' }); yy += CONSOLE_KIT.KV_H;
      ctx.save(); ctx.font = F(THEME.fontSizeSmall - 1);
      for (const ln of wrapWords(ctx, isEn() ? (ab.descriptionEN ?? '') : (ab.descriptionPL ?? ''), detail.w - 8)) yy += note(ctx, detail.x, yy, detail.w, ln, roles, { size: THEME.fontSizeSmall - 1, indent: 8 });
      ctx.restore();
    }
    if (arch.counters?.length) yy += note(ctx, detail.x, yy, detail.w, `${t('cmdPages.ground.counters')}: ${arch.counters.map(archName).join(', ')}`, roles, { tone: 'primary' });
    if (arch.counteredBy?.length) yy += note(ctx, detail.x, yy, detail.w, `${t('cmdPages.ground.counteredBy')}: ${arch.counteredBy.map(archName).join(', ')}`, roles, { tone: 'alert' });
    if (arch.specialRules?.length) {
      yy += drawEyebrow(ctx, detail.x, yy + 2, detail.w, t('groundPanel.rules'), roles) + 2;
      ctx.save(); ctx.font = F(THEME.fontSizeSmall - 1);
      for (const rule of arch.specialRules) for (const ln of wrapWords(ctx, rule, detail.w - 8)) yy += note(ctx, detail.x, yy, detail.w, ln, roles, { size: THEME.fontSizeSmall - 1, indent: 8 });
      ctx.restore();
    }
    // statystyki startowe z premiami technologii (jak dziś)
    const tb = K?.techSystem?.getTechStatBonuses?.() ?? { org: 0, morale: 0, supplyCap: 0 };
    yy += drawEyebrow(ctx, detail.x, yy + 2, detail.w, t('groundPanel.startStats'), roles) + 2;
    drawKvRow(ctx, detail.x, yy, detail.w, 'Org', String(Math.min(100, (arch.baseOrg ?? 10) + (tb.org ?? 0))), roles); yy += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, detail.x, yy, detail.w, 'Mor', arch.noMorale === true ? 'N/A' : String(Math.min(100, (arch.baseMorale ?? 10) + (Number(tb.morale) || 0))), roles); yy += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, detail.x, yy, detail.w, t('groundPanel.stat.supply'), `${Math.min(200, (arch.baseSupplyCap ?? 100) + (tb.supplyCap ?? 0))} (−${arch.supplyConsumption ?? 2}/y)`, roles); yy += CONSOLE_KIT.KV_H;
    yy += drawEyebrow(ctx, detail.x, yy + 2, detail.w, t('cmdPages.ground.cost'), roles) + 2;
    const haveRes = (id) => colony?.resourceSystem?.getAmount?.(id) ?? colony?.resourceSystem?.inventory?.get?.(id) ?? 0;
    for (const [id, n] of Object.entries({ ...(cost.resources ?? {}), ...(cost.commodities ?? {}) })) {
      drawKvRow(ctx, detail.x, yy, detail.w, resLabel(id), `${Math.floor(haveRes(id))} / ${n}`, roles, { tone: haveRes(id) >= n ? 'primary' : 'alert' }); yy += CONSOLE_KIT.KV_H;
    }
    if (cost.pop) { const fp = colony?.civSystem?.freePops ?? 0; drawKvRow(ctx, detail.x, yy, detail.w, 'POP', `${Math.floor(fp)} / ${cost.pop}`, roles, { tone: fp >= cost.pop ? 'primary' : 'alert' }); yy += CONSOLE_KIT.KV_H; }
    if (cost.kr) { const kr = colony?.credits ?? 0; drawKvRow(ctx, detail.x, yy, detail.w, 'Kr', `${Math.floor(kr)} / ${cost.kr}`, roles, { tone: kr >= cost.kr ? 'primary' : 'alert' }); yy += CONSOLE_KIT.KV_H; }
    drawKvRow(ctx, detail.x, yy, detail.w, t('cmdPages.ground.costTime'), t('cmdPages.ground.years', cost.time ?? 1), roles); yy += CONSOLE_KIT.KV_H;
    if (cost.upkeep) { drawKvRow(ctx, detail.x, yy, detail.w, t('cmdPages.ground.upkeep'), `${cost.upkeep.energy ?? 0} E · ${cost.upkeep.credits ?? 0} Kr`, roles, { tone: 'dim' }); yy += CONSOLE_KIT.KV_H; }
    return yy + 4;
  });
  let fy = c.y + c.h - footH;
  drawKvRow(ctx, c.x, fy, c.w, t('cmdPages.ground.barracks'), t('cmdPages.ground.barracksLine', barracksLv, queue, slots, active, maxUnits), roles, { tone: barracksLv > 0 ? 'primary' : 'alert' });
  fy += 18;
  const cr = { x: c.x, y: fy, w: c.w, h: CONSOLE_KIT.CHIP_H };
  drawActionChip(ctx, cr.x, cr.y, cr.w, roles, { label: t('cmdPages.ground.recruit', colony?.name ?? '—'), enabled: st.canRecruit, hover: hov(ov, cr.x, cr.y) });
  zoneOf(ov, cr, { type: 'ground:recruit', data: { archetypeId: archId }, enabled: st.canRecruit, reason: reasonText(st.reasonKey, st.reasonArgs) });
  fy += CONSOLE_KIT.CHIP_H + 6;
  if (!st.canRecruit) fy += note(ctx, c.x, fy, c.w, reasonText(st.reasonKey, st.reasonArgs), roles, { tone: 'alert' });
  const toast = panel._recruitToast && panel._recruitToast.expireAt > Date.now() ? panel._recruitToast : null;
  if (toast) { note(ctx, c.x, fy, c.w, toast.text, roles, { tone: toast.success ? 'primary' : 'alert' }); if (K?.uiManager) K.uiManager._dirty = true; }
  ov._addHit(win.x, win.y, win.w, win.h, 'draftDialogBg', {});
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// SZUFLADA GRUPY JEDNOSTEK
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/**
 * Szuflada grupy jednostek (zaznaczenie > 1) obok inspektora u dołu bohatera: nagłówek (armia / liczba), jednostki z HP
 * (`drawerUnitClick`), akcje armii (`armySplitFromDrawer`, `armyRename`, `armyDisband`, `armyCreateFromSelection`,
 * `drawerOpenGroup`) — „połącz” poza jednym polem wyłączone z powodem.
 */
export function drawGroupDrawer(ov, ctx, zones, roles) {
  const sel = ov._getSelectedPlayerUnits?.() ?? [];
  if (!sel.length) return 0;
  const armySys = KOS()?.armySystem;
  const first = armySys?.getArmyForUnit?.(sel[0].id);
  const sameArmy = !!first && sel.every((u) => armySys?.getArmyForUnit?.(u.id)?.id === first.id);
  const units = sel.map((u) => {
    const a = UNIT_ARCHETYPES[u.archetypeId];
    return { id: u.id, arch: u.archetypeId, hp: u.hp ?? 0, hpMax: a?.baseStats?.hp ?? u.hpMax ?? u.hp ?? 0, dmg: a?.baseStats?.dmg ?? u.attack ?? 0 };
  });
  const sameTile = sel.every((u) => samePos(u, sel[0]) && u.planetId === sel[0].planetId);
  const army = sameArmy ? { id: first.id, name: first.name, kills: first.kills ?? 0, tileLabel: ov._graphFor?.(first.planetId)?.idOf?.(first) ?? '' } : null;
  const m = groupDrawerOf(units, { army, sameTile });
  const r = drawerRect(zones, { h: m.sums ? COLONY_PAGES.DRAWER_H : COLONY_PAGES.DRAWER_H - 20 });
  if (!r) return 0;
  drawConsoleBackground(ctx, r);
  drawZoneFrame(ctx, r, roles, { tone: 'primary' });
  const P = COLONY_PAGES, actW = 128;
  ctx.save(); ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeSmall, true); ctx.fillStyle = roles.primary;
  ctx.fillText(fit(ctx, t(m.titleKey, ...m.titleArgs).toUpperCase(), r.w - actW - 20), r.x + 8, r.y + 11);
  ctx.restore();
  // jednostki
  const cell = 40, n = Math.min(P.DRAWER_ICONS, Math.max(1, Math.floor((r.w - actW - 24) / (cell + 4))));
  m.rows.slice(0, n).forEach((u, i) => {
    const cr = { x: r.x + 8 + i * (cell + 4), y: r.y + 24, w: cell, h: cell };
    const unit = units.find((q) => q.id === u.id);
    if (hov(ov, cr.x, cr.y)) { ctx.save(); ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(cr.x, cr.y, cr.w, cr.h); ctx.restore(); }
    const art = unitArt(ov, unit.arch);
    if (art) ctx.drawImage(art, cr.x + 4, cr.y + 2, cell - 8, cell - 10);
    else note(ctx, cr.x, cr.y + 10, cell, archName(unit.arch).slice(0, 4).toUpperCase(), roles, { tone: 'primary', size: THEME.fontSizeSmall - 1 });
    drawBar(ctx, cr.x + 2, cr.y + cell - 4, cell - 4, u.hpFrac, roles, { tone: u.tone });
    if (ov._selectedUnit?.id === u.id) drawSelectBrackets(ctx, cr, roles);
    ov._addHit(cr.x, cr.y, cr.w, cr.h, 'drawerUnitClick', { unitId: u.id, tip: `${archName(unit.arch)} · HP ${Math.round(unit.hp)}/${Math.round(unit.hpMax)}`, tipTone: 'dim' });
  });
  if (m.rows.length > n) note(ctx, r.x + 8 + n * (cell + 4), r.y + 36, 40, `+${m.rows.length - n}`, roles);
  if (m.sums) note(ctx, r.x + 8, r.y + r.h - 18, r.w - actW - 20, t('colonyPages.drawer.sums', m.sums.dmg, m.sums.hp, m.sums.hpMax, m.sums.kills), roles);
  // akcje (kolumna po prawej)
  let ay = r.y + 8;
  for (const a of m.actions) {
    const ar = { x: r.x + r.w - actW - 8, y: ay, w: actW, h: CONSOLE_KIT.CHIP_H };
    drawActionChip(ctx, ar.x, ar.y, ar.w, roles, { label: t(a.labelKey), enabled: a.enabled, danger: !!a.danger, hover: hov(ov, ar.x, ar.y) });
    const z = a.enabled ? { type: a.type, data: a.data } : { type: 'cReason', data: { tip: t(a.reasonKey) } };
    ov._addHit(ar.x, ar.y, ar.w, ar.h, z.type, z.data);
    ay += CONSOLE_KIT.CHIP_H + 6;
  }
  // absorber na końcu (pierwsza strefa wygrywa — jednostki i akcje przed nim): klik w szufladę nie przebija na kulę
  ov._addHit(r.x, r.y, r.w, r.h, 'floatPanel', {});
  return r.h;
}
