// ColonyConsoleView — konsola Kolonii na zestawie konsoli (ARC COLONY SPHERE CS-8; szablon: docs/design/CONSOLES_PLAN.md).
//
// Wołane przez `ColonyOverlay.draw`, gdy `colonyConsoleActive(grid)` (siatka geo — niezależnie od bieżącej flagi `colonySphere`).
// Strefy (`consoleZones`): nagłówek · lista kolonii + karta planety · bohater (kula CS-7 — rysuje ją gospodarz PRZED tym
// widokiem, poza poświatą tekstu) · inspektor wg zaznaczenia · pas kolejki budowy.
// Geometria — wyłącznie strefy; kolory — wyłącznie role (`consoleRoles`) i barwy kategorii z danych. Bez emoji.
// Strefy trafień: typy dzisiejszego okna tam, gdzie znaczenie jest to samo (`build`, `upgrade`, `demolish`, `colonyTab`,
// `unit*`…), nowe typy konsoli z przedrostkiem `c` (obsługa: `ColonyOverlay._onConsoleHit`).

import { THEME } from '../config/ThemeConfig.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { ANOMALIES } from '../data/AnomalyData.js';
import { UNIT_ARCHETYPES, DEFAULT_MORALE } from '../data/unitArchetypes.js';
import { TERRAIN_TYPES, evaluatePlacement } from '../map/HexTile.js';
import { buildVerdictFor } from './ColonySphereView.js';
import { BUILD_VERDICT } from './ColonySphereOverlayLogic.js';
import { tileGraphOf, LATITUDE_BAND } from '../map/TileGraph.js';
import { latitudeModifierOf } from '../data/LatitudeBands.js';
import { BUILDING_CATEGORY_COLORS, BUILDING_CATEGORY_FALLBACK } from '../data/BuildingCategoryColors.js';
import { DepositSystem } from '../systems/DepositSystem.js';
import { computeDepositReadout, fmtCompact } from './DepositReadoutLogic.js';
import { computeEnvironmentEffects } from './EnvironmentEffectLogic.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';
import { truncateText } from './HudLabelLogic.js';
import { drawResourceIcon } from './ResourceIcons.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawList, drawActionChip, drawSelectBrackets, drawConsoleTooltip, drawZoneFrame,
  drawTabular, chipLabel, CONSOLE_KIT } from './ConsoleKit.js';
import { getBuildingTexture, hasBuildingTexture } from '../renderer/BuildingTextures.js';
import { canIssueColonyOrders } from './ColonyOrderGuard.js';
import { tilePosLabel } from './ColonyTilePosLogic.js';
import { COLONY_CONSOLE, colonyListRows, colonyListHeight, planetCardRows, tileStatsOf, inspectorStateOf, portraitSpecOf,
  categoryGlyphOf, CAPITAL_BUILDING_ID, tileBuildRows, sortByCategory, categoriesOf, queueRows, headerChips, BUILD_ROW,
  colonySummaryOf, buildingCountsByCategory, unitOrdersOf, workforceRowsOf, troopTransportRows } from './ColonyConsoleLogic.js';

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const isHz = (hz, type, pred = null) => !!hz && hz.type === type && (!pred || pred(hz.data ?? {}));
const catColor = (c) => BUILDING_CATEGORY_COLORS[c] ?? BUILDING_CATEGORY_FALLBACK;
const bName = (id) => { const b = BUILDINGS[id]; return b ? getName(b, 'building') : String(id ?? '?'); };
const terrainName = (type) => { const k = `terrain.${type}.name`; const s = t(k); return s === k ? (TERRAIN_TYPES[type]?.namePL ?? type) : s; };
const BAND_KEY = { [LATITUDE_BAND.EQUATORIAL]: 'equatorial', [LATITUDE_BAND.SUBPOLAR]: 'subpolar', [LATITUDE_BAND.POLAR]: 'polar' };

function resLabel(key) {
  const c = COMMODITIES[key];
  if (c) return getName(c, 'commodity');
  const r = ALL_RESOURCES[key];
  if (r) return getLocale() === 'en' ? (r.nameEN ?? r.namePL ?? key) : (r.namePL ?? key);
  return key;
}
const fmtNum = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Number(v.toFixed(1)).toString());

/** Stan magazynu kolonii dla klucza (pula układu, gdy aktywna — to samo źródło co `_build`). */
function haveOfColony(colony) {
  const res = colony?.resourceSystem ?? null;
  const store = (typeof window !== 'undefined' ? window.KOSMOS?.systemPoolService?.getStore?.(res) : null) ?? res;
  return (key) => store?.getAmount?.(key) ?? store?.inventory?.get?.(key) ?? res?.inventory?.get?.(key) ?? 0;
}

// ── Portret / znak kategorii ────────────────────────────────────────────────

/** Portret budynku w kwadracie `size`: PNG, a gdy go brak — znak kategorii (łamane) w barwie kategorii w tym samym gnieździe. */
export function drawBuildingPortrait(ctx, buildingId, x, y, size, roles, { frame = true } = {}) {
  const spec = portraitSpecOf(buildingId, hasBuildingTexture);
  const img = spec.kind === 'png' ? getBuildingTexture(spec.id) : null;
  ctx.save();
  ctx.shadowBlur = 0;
  if (img && (img.complete ?? true) && (img.naturalWidth ?? img.width ?? 1) > 0) {
    try { ctx.drawImage(img, x, y, size, size); } catch (e) { /* obraz jeszcze się ładuje */ }
  } else {
    const cat = spec.kind === 'category' ? spec.category : (BUILDINGS[buildingId]?.category ?? 'civil');
    ctx.strokeStyle = catColor(cat);
    ctx.lineWidth = Math.max(1, size / 22);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const pad = size * 0.12, s = size - 2 * pad;
    ctx.beginPath();
    for (const line of categoryGlyphOf(cat)) {
      line.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(x + pad + px * s, y + pad + py * s); else ctx.lineTo(x + pad + px * s, y + pad + py * s); });
    }
    ctx.stroke();
  }
  ctx.restore();
  if (frame) drawZoneFrame(ctx, { x, y, w: size, h: size }, roles, { arm: Math.max(4, Math.round(size / 9)) });
}

// ── Koszt (ikony zasobów + liczby; braki w roli alert) ──────────────────────

/** Linia kosztu od `x`: ikona + ilość na pozycję; brak pokrycia → rola alert. Zwraca szerokość. */
function drawCostLine(ctx, x, cy, maxW, cost, haveOf, roles) {
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall);
  ctx.textBaseline = 'middle';
  let cx = x;
  const entries = Object.entries(cost ?? {});
  if (!entries.length) { ctx.fillStyle = roles.dim; ctx.fillText(t('colonyConsole.costFree'), cx, cy); ctx.restore(); return 0; }
  for (const [key, need] of entries) {
    const txt = String(need);
    const w = 13 + ctx.measureText(txt).width + 8;
    if (cx + w > x + maxW) { ctx.fillStyle = roles.dim; ctx.fillText('…', cx, cy); break; }
    const short = (haveOf(key) ?? 0) < need;
    ctx.save(); ctx.shadowBlur = 0;
    const drawn = drawResourceIcon(ctx, key, cx, cy, 12, null);
    ctx.restore();
    if (!drawn) { ctx.fillStyle = roles.dim; ctx.fillText(key.slice(0, 2), cx, cy); }
    ctx.fillStyle = short ? roles.alert : roles.primary;
    ctx.fillText(txt, cx + 14, cy);
    cx += w;
  }
  ctx.restore();
  return cx - x;
}

/** Tekst braków: „Brakuje: Si 6, Cu 3". */
function missingText(missing, max = 3) {
  const parts = missing.slice(0, max).map((m) => `${resLabel(m.key)} ${fmtNum(m.short)}`);
  if (missing.length > max) parts.push(`+${missing.length - max}`);
  return t('colonyConsole.missing', parts.join(', '));
}

// ── Przewijany blok (lista budowy, inspektor, karta planety) ────────────────

/**
 * Blok przewijany w `rect`: `body(x, y0, w, vis)` rysuje od `y0` (już po odjęciu przewinięcia) i zwraca dolną krawędź treści.
 * Strefy trafień spoza pasa widoku są usuwane (clip ich nie przycina). Stan przewijania per `key` na gospodarzu.
 */
function scrolled(ov, ctx, rect, key, roles, body) {
  ov._cScroll ??= {}; ov._cContentH ??= {}; ov._cScrollRects ??= {};
  const sc = clampScroll(ov._cScroll[key] ?? 0, ov._cContentH[key] ?? 0, rect.h);
  ov._cScroll[key] = sc;
  ov._cScrollRects[key] = rect;
  const hitStart = ov._hitZones.length;
  const vis = (y, h = CONSOLE_KIT.KV_H) => y >= rect.y - 1 && y + h <= rect.y + rect.h + 1;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  const end = body(rect.x, rect.y - sc, rect.w - CONSOLE_KIT.SCROLLBAR_W - 6, vis);
  ctx.restore();
  const contentH = Math.max(0, (end ?? rect.y) - (rect.y - sc));
  ov._cContentH[key] = contentH;
  ov._pruneHitsOutside(hitStart, rect.y, rect.y + rect.h);
  const th = scrollThumb(sc, contentH, rect.h, rect.y);
  if (th) {
    ctx.save();
    const sx = rect.x + rect.w - CONSOLE_KIT.SCROLLBAR_W;
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, rect.y, CONSOLE_KIT.SCROLLBAR_W, rect.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, th.y, CONSOLE_KIT.SCROLLBAR_W, th.h);
    ctx.restore();
  }
}

/** Czip akcji na pełną szerokość ze strefą: włączony → `type`/`data`; wyłączony → strefa powodu (`cReason`, podpowiedź + flash). */
function actionChip(ov, ctx, x, y, w, roles, { label, type, data = {}, enabled = true, danger = false, reason = null, vis = null }) {
  const hz = ov._hoverZone;
  const hover = !!hz && hz.x === x && hz.y === y;
  const r = drawActionChip(ctx, x, y, w, roles, { label, enabled, danger, hover });
  if (!vis || vis(y, r.h)) {
    if (enabled) ov._addHit(r.x, r.y, r.w, r.h, type, data);
    else ov._addHit(r.x, r.y, r.w, r.h, 'cReason', { tip: reason ?? '' });
  }
  return r.h + CONSOLE_KIT.CHIP_GAP;
}

// ═══════════════════════════════════════════════════════════════════════════
// Główna funkcja
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Rysuje konsolę Kolonii (wszystko poza kulą). `ov.consoleZones` policzył gospodarz przed kulą.
 * @param {object} ov ColonyOverlay
 */
export function drawColonyConsole(ov, ctx, W, H, colony, grid) {
  const roles = consoleRoles(THEME);
  const z = ov.consoleZones;
  const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
  const hz = ov._hoverZone;
  const graph = tileGraphOf(grid);
  const selTile = ov._selectedHex && graph ? graph.tile(ov._selectedHex) : null;
  const ordersOk = canIssueColonyOrders(colony) && !colony?.isPreview;
  const state = inspectorStateOf({
    buildMode: !!ov._cBuildMode, unit: ov._selectedUnit, unitCount: ov._selectedUnits?.size ?? 0,
    tile: selTile, station: !!ov._cStation, preview: !!colony?.isPreview,
  });
  ov._cInspector = state;

  drawHeader(ov, ctx, z, roles, colony, state, ordersOk, hz);
  drawListZone(ov, ctx, z.list, roles, colony, grid, K, hz);
  drawInspector(ov, ctx, z.inspector, roles, colony, grid, graph, selTile, state, ordersOk, K, hz);
  if (z.strip) drawQueueStrip(ov, ctx, z.strip, roles, colony, graph, ordersOk, hz);

  // Strefa pod kursorem z TEJ klatki (strefy zmieniają się bez ruchu myszy: zaznaczenie, przewinięcie, koniec budowy) —
  // podświetlenie następnej klatki i podpowiedź czytają świeżą strefę, nigdy tę sprzed zmiany.
  if (Number.isFinite(ov._mouseX) && Number.isFinite(ov._mouseY)) ov._hoverZone = ov._hitTest(ov._mouseX, ov._mouseY);
  const fresh = ov._hoverZone;
  // Podpowiedź (powód wyłączonego elementu / opis) — na wierzchu
  const tipZone = fresh?.data?.tip ? fresh : null;
  if (tipZone) drawConsoleTooltip(ctx, { text: tipZone.data.tip, x: tipZone.x, y: tipZone.y + tipZone.h + 4, above: tipZone.h + 6 }, z.frame, roles,
    { tone: tipZone.data.tipTone ?? 'alert' });
}

// ── Nagłówek ────────────────────────────────────────────────────────────────

function drawHeader(ov, ctx, z, roles, colony, state, ordersOk, hz) {
  const hd = z.header, tr = z.title, cl = z.close;
  const cy = hd.y + hd.h / 2;
  const KIT = CONSOLE_KIT;
  ctx.save();
  ctx.textBaseline = 'middle';
  // Tytuł = nazwa kolonii (kontekst zawsze na ekranie) + rodzaj
  const name = String(colony?.planet?.name ?? colony?.name ?? colony?.planetId ?? t('colonyConsole.noColony')).toUpperCase();
  ctx.font = F(THEME.fontSizeMedium, true);
  ctx.fillStyle = roles.primary;
  ctx.fillText(name, tr.x, cy);
  let x = tr.x + ctx.measureText(name).width + 12;
  ctx.font = F(THEME.fontSizeSmall);
  const sum = colonySummaryOf(colony);
  let sub;
  if (sum.kind === 'preview') sub = t('colonyInfo.previewTag').toUpperCase();
  else if (!canIssueColonyOrders(colony)) sub = t('colonyConsole.foreign').toUpperCase();
  else if (sum.kind === 'outpost') sub = t('colonyConsole.outpost').toUpperCase();
  else if (sum.hasCiv) sub = t('colonyConsole.popLine', sum.humans, sum.housing, (sum.growth >= 0 ? '+' : '') + sum.growth.toFixed(1), sum.satisfaction);
  else sub = '';
  ctx.fillStyle = sum.hasCiv && (sum.famine || sum.unrest) ? roles.alert : roles.dim;
  ctx.fillText(sub, x, cy);
  x += ctx.measureText(sub).width + 22;

  // Czipy: widok · soczewki · tryb budowy
  const sv = ov._sphere;
  const stTabs = ov._getInfoTabs(colony);
  const chips = headerChips({
    lens: sv?.lens ?? 'none', supply: !!ov._showSupplyCoverage, buildMode: !!ov._cBuildMode, station: state.kind === 'station',
    stationAvailable: !colony?.isPreview && stTabs.some((tb) => tb.id === 'stacja'),
    stationReasonKey: !canIssueColonyOrders(colony) || colony?.isPreview ? 'colonyConsole.reason.foreign'
      : colony?.isOutpost ? 'colonyConsole.reason.stationOutpost' : 'colonyConsole.reason.stationTech',
    canBuild: ordersOk, buildReasonKey: colony?.isPreview ? 'colonyConsole.reason.preview' : 'colonyConsole.reason.foreign',
  });
  const groups = [chips.view, chips.lens, chips.build];
  const right = tr.x + tr.w;
  groups.forEach((group, gi) => {
    if (gi === 1) {
      ctx.fillStyle = roles.dim;
      const lab = t('colonyConsole.lensLabel').toUpperCase();
      if (x + ctx.measureText(lab).width + 6 < right) { ctx.fillText(lab, x, cy); x += ctx.measureText(lab).width + 6; }
    }
    for (const c of group) {
      const txt = chipLabel(t(c.labelKey));
      const w = Math.ceil(ctx.measureText(txt).width) + 2 * KIT.CHIP_PAD_X;
      if (x + w > right) break;
      const r = { x, y: Math.round(cy - KIT.CHIP_H / 2), w, h: KIT.CHIP_H };
      const hov = isHz(hz, 'cChip', (d) => d.id === c.id);
      if (hov && c.enabled) { ctx.globalAlpha = KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.globalAlpha = 1; }
      ctx.globalAlpha = c.enabled ? 1 : KIT.OFF_ALPHA;
      ctx.fillStyle = c.active && c.enabled ? roles.primary : roles.dim;
      ctx.fillText(txt, x + KIT.CHIP_PAD_X, cy);
      ctx.globalAlpha = 1;
      if (c.active && c.enabled) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x + KIT.CHIP_PAD_X, r.y + r.h - 0.5); ctx.lineTo(r.x + r.w - KIT.CHIP_PAD_X, r.y + r.h - 0.5); ctx.stroke(); }
      ov._addHit(r.x, r.y, r.w, r.h, 'cChip', { id: c.id, enabled: c.enabled, tip: c.enabled ? null : t(c.reasonKey) });
      x += w + KIT.HEADER_CHIP_GAP;
    }
    x += 16;
  });

  // [ x ]
  const hovClose = isHz(hz, 'close');
  if (hovClose) { ctx.globalAlpha = KIT.HOVER_ALPHA; ctx.fillStyle = roles.alert; ctx.fillRect(cl.x, cl.y + 4, cl.w, cl.h - 8); ctx.globalAlpha = 1; }
  ctx.fillStyle = hovClose ? roles.alert : roles.dim;
  ctx.textAlign = 'center';
  ctx.fillText('[ x ]', cl.x + cl.w / 2, cy);
  ctx.textAlign = 'left';
  ov._addHit(cl.x, cl.y, cl.w, cl.h, 'close');
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(hd.x, hd.y + hd.h - 0.5); ctx.lineTo(hd.x + hd.w, hd.y + hd.h - 0.5); ctx.stroke();
  ctx.restore();
}

// ── Lewa strefa: lista kolonii + karta planety ──────────────────────────────

function drawListZone(ov, ctx, lz, roles, colony, grid, K, hz) {
  const KIT = CONSOLE_KIT;
  const colMgr = K?.colonyManager;
  const colonies = colMgr?.getPlayerColonies?.() ?? [];
  const rows = colonyListRows(colonies, {
    viewedId: colony?.planetId ?? null, activeId: colMgr?.activePlanetId ?? null,
    systemNameOf: (sid) => K?.galaxySystem?.getSystem?.(sid)?.name ?? K?.starSystemManager?.getSystem?.(sid)?.name ?? null,
  });
  const head = drawZoneRule(ctx, lz, t('colonyConsole.list', rows.filter((r) => !r.group).length), roles);
  const rowH = 20;
  const groupCount = rows.filter((r) => r.group).length;
  const listH = colonyListHeight(rows.length - groupCount, groupCount, lz.h - head, rowH, KIT.GROUP_H);
  const lr = { x: lz.x, y: lz.y + head + 2, w: lz.w, h: listH };
  ov._cScroll ??= {}; ov._cScrollRects ??= {};
  const res = drawList(ctx, lr, rows, roles, {
    selectedId: colony?.planetId ?? null, hoverId: isHz(hz, 'colonyTab') ? hz.data.planetId : null, scroll: ov._cScroll.list ?? 0, rowH,
    renderRow: (c, row, r, { sel }) => {
      const cy = r.y + r.h / 2;
      c.textBaseline = 'middle';
      c.font = F(THEME.fontSizeNormal, sel);
      let vw = 0;
      const tag = row.kind === 'outpost' ? t('colonyConsole.outpost') : (row.pop != null ? String(row.pop) : '');
      if (tag) {
        c.font = F(THEME.fontSizeSmall);
        c.fillStyle = roles.dim; c.textAlign = 'right';
        c.fillText(row.kind === 'outpost' ? tag.toUpperCase() : `${t('colonyConsole.pop')} ${tag}`, r.x + r.w - KIT.ROW_PAD_X, cy);
        vw = c.measureText(row.kind === 'outpost' ? tag.toUpperCase() : `${t('colonyConsole.pop')} ${tag}`).width + 10;
        c.textAlign = 'left';
        c.font = F(THEME.fontSizeNormal, sel);
      }
      c.fillStyle = roles.primary;
      c.globalAlpha = sel ? 1 : 0.85;
      c.fillText(fit(c, row.label, r.w - 2 * KIT.ROW_PAD_X - vw), r.x + KIT.ROW_PAD_X, cy);
      c.globalAlpha = 1;
    },
  });
  ov._cScroll.list = res.scroll;
  ov._cScrollRects.list = lr;
  for (const zn of res.zones) ov._addHit(zn.x, zn.y, zn.w, zn.h, 'colonyTab', { planetId: zn.id });

  // Karta planety
  const cardTop = lr.y + lr.h + 10;
  const cz = { x: lz.x, y: cardTop, w: lz.w, h: Math.max(0, lz.y + lz.h - cardTop) };
  const planet = colony?.planet ?? null;
  if (!planet || cz.h < 30) return;
  const ch = drawZoneRule(ctx, cz, t('colonyConsole.planetCard'), roles);
  const body = { x: cz.x, y: cz.y + ch + 2, w: cz.w, h: Math.max(0, cz.h - ch - 2) };
  scrolled(ov, ctx, body, 'card', roles, (x, y0, w, vis) => {
    let y = y0;
    ctx.textBaseline = 'middle';
    // Nazwa + archetyp
    ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
    ctx.fillText(fit(ctx, planet.name ?? planet.id, w), x, y + 9);
    y += 18;
    const archKey = planet.bodyArchetype ? `archetype.${planet.bodyArchetype}.name` : null;
    const arch = archKey && t(archKey) !== archKey ? t(archKey) : null;
    const stats = tileStatsOf(grid?.tiles);
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
    if (arch) { ctx.fillText(fit(ctx, arch, w), x, y + 7); y += 14; }
    ctx.fillText(fit(ctx, t('colonyConsole.tiles', stats.total, stats.buildable, stats.used), w), x, y + 7);
    y += 18;
    const civ = colony?.civSystem ?? null;
    const gb = civ?.getGrowthBreakdown?.() ?? null;
    const env = computeEnvironmentEffects(planet, gb ? { planetMod: gb.planetMod, blockReason: gb.blockReason } : null);
    for (const row of planetCardRows(planet, env)) {
      const val = (row.valueKey ? t(row.valueKey) : row.value) + (row.bandKey ? ` (${t(row.bandKey)})` : '');
      drawKvRow(ctx, x, y, w, t(row.labelKey), val, roles, { unit: row.unitKey ? t(row.unitKey) : '' });
      y += CONSOLE_KIT.KV_H;
      if (row.effects?.length) {
        ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
        ctx.fillStyle = row.effects.some((e) => e.tone === 'gate') ? roles.alert : roles.dim;
        ctx.fillText(fit(ctx, row.effects.map((e) => t(e.key, ...(e.params ?? []))).join(', '), w - 8), x + 8, y + 6);
        y += 13;
      }
    }
    if (env?.growth) {
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = env.growth.tone === 'gate' ? roles.alert : roles.dim;
      ctx.fillText(fit(ctx, t(env.growth.key, ...(env.growth.params ?? [])), w), x, y + 6);
      y += 13;
    }
    y += 6;
    // Złoża
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.deposits'), roles);
    const deps = planet.deposits ?? [];
    if (!deps.length) {
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
      ctx.fillText(t('colonyInfo.noResources'), x, y + 8); y += 18;
    } else {
      const summaries = DepositSystem.getDepositsSummary(deps);
      const resSys = colony?.resourceSystem;
      const rateCache = {};
      deps.forEach((d, i) => {
        let rate = rateCache[d.resourceId];
        if (rate === undefined) {
          try { rate = resSys?.getResourceBreakdown?.(d.resourceId)?.producers?.mine?.total ?? 0; } catch (e) { rate = 0; }
          rateCache[d.resourceId] = rate;
        }
        const ro = computeDepositReadout(summaries[i], rate, { civTimeScale: GAME_CONFIG.CIV_TIME_SCALE });
        const cy = y + 8;
        ctx.save(); ctx.shadowBlur = 0; drawResourceIcon(ctx, d.resourceId, x, cy, 12, null); ctx.restore();
        ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle';
        ctx.fillStyle = ro?.depleted ? roles.dim : roles.primary;
        // bogactwo: 4 segmenty po prawej
        const segW = 6, segGap = 2, barW = 4 * segW + 3 * segGap, bx = x + w - barW;
        const dots = Math.max(0, Math.min(4, Math.round((d.richness ?? 0) * 4)));
        for (let s = 0; s < 4; s++) {
          ctx.globalAlpha = s < dots ? 1 : CONSOLE_KIT.TRACK_ALPHA;
          ctx.fillStyle = s < dots ? roles.primary : roles.dim;
          ctx.fillRect(bx + s * (segW + segGap), cy - 2, segW, 4);
        }
        ctx.globalAlpha = 1;
        let rightEdge = bx - 8;
        if (ro) {
          const eta = ro.etaYears == null ? '—' : `~${fmtCompact(Math.round(ro.etaYears))} ${t('colonyInfo.depositEtaUnit')}`;
          ctx.font = F(THEME.fontSizeSmall); ctx.textAlign = 'right';
          ctx.fillStyle = ro.warn ? roles.alert : roles.dim;
          ctx.fillText(eta, rightEdge, cy);
          rightEdge -= ctx.measureText(eta).width + 8;
          ctx.fillStyle = roles.dim;
          ctx.fillText(ro.ratioStr, rightEdge, cy);
          rightEdge -= ctx.measureText(ro.ratioStr).width + 8;
          ctx.textAlign = 'left';
        }
        ctx.font = F(THEME.fontSizeNormal);
        ctx.fillStyle = ro?.depleted ? roles.dim : roles.primary;
        ctx.fillText(fit(ctx, resLabel(d.resourceId), rightEdge - (x + 16)), x + 16, cy);
        y += 17;
      });
    }
    return y + 4;
  });
}

// ── Inspektor ───────────────────────────────────────────────────────────────

function drawInspector(ov, ctx, iz, roles, colony, grid, graph, selTile, state, ordersOk, K, hz) {
  const labelKey = `colonyConsole.insp.${state.kind}`;
  const head = drawZoneRule(ctx, iz, t(labelKey), roles);
  const rect = { x: iz.x, y: iz.y + head + 4, w: iz.w, h: Math.max(0, iz.h - head - 4) };
  ov._infoView = null;

  // Zamknięcie zaznaczenia: [ x ] w głowicy inspektora (pole / budynek / jednostka)
  if (['tile', 'building', 'construction', 'pending', 'unit', 'palette'].includes(state.kind)) {
    const type = state.kind === 'unit' ? 'unitDeselect' : state.kind === 'palette' ? 'cBuildExit' : 'deselectHex';
    const w = 30, r = { x: iz.x + iz.w - w, y: iz.y + 2, w, h: CONSOLE_KIT.EYEBROW_H - 2 };
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    const hov = !!hz && hz.x === r.x && hz.y === r.y;
    ctx.fillStyle = hov ? roles.alert : roles.dim;
    ctx.fillText('[ x ]', r.x + r.w, r.y + r.h / 2);
    ctx.restore();
    ov._addHit(r.x, r.y, r.w, r.h, type, state.kind === 'unit' ? { tip: t('colonyConsole.tip.deselect'), tipTone: 'dim' } : {});
  }

  switch (state.kind) {
    case 'palette': return drawPalette(ov, ctx, rect, roles, colony, grid, graph, K, hz);
    case 'unit': return scrolled(ov, ctx, rect, 'insp', roles, (x, y, w, vis) => drawUnit(ov, ctx, x, y, w, vis, roles, colony, grid, graph, K));
    case 'building': return scrolled(ov, ctx, rect, 'insp', roles, (x, y, w, vis) => drawBuilding(ov, ctx, x, y, w, vis, roles, colony, graph, selTile, ordersOk));
    case 'construction':
    case 'pending': return scrolled(ov, ctx, rect, 'insp', roles, (x, y, w, vis) => drawQueuedTile(ov, ctx, x, y, w, vis, roles, colony, graph, selTile, state, ordersOk));
    case 'tile': return scrolled(ov, ctx, rect, 'insp', roles, (x, y, w, vis) => drawTile(ov, ctx, x, y, w, vis, roles, colony, grid, graph, selTile, state, ordersOk, K, hz));
    case 'station': return drawLegacyTab(ov, ctx, rect, colony, grid, 'stacja');
    default: return drawSummary(ov, ctx, rect, roles, colony, grid, K, hz);
  }
}

/** Dzisiejsza zakładka okna kolonii (Załoga / Populacja / Stacja) osadzona w inspektorze: ta sama treść, sterowniki i przewijanie. */
function drawLegacyTab(ov, ctx, rect, colony, grid, tab) {
  ov._drawInfoPanel(ctx, rect.x, rect.y, rect.w, rect.h, colony, grid, { consoleTab: tab });
}

/** Blok terenu pola: nazwa, pozycja, pas szerokości z mnożnikami, mnożniki uzysku terenu, anomalia. Zwraca dolną krawędź. */
function drawTerrainBlock(ctx, x, y0, w, roles, graph, tile) {
  let y = y0;
  const terrain = TERRAIN_TYPES[tile.type] ?? TERRAIN_TYPES.plains;
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
  ctx.fillText(terrainName(tile.type).toUpperCase(), x, y + 8);
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textAlign = 'right';
  ctx.fillText(t('colonyConsole.tileNo', tilePosLabel(tile, ', ')), x + w, y + 8);
  ctx.textAlign = 'left';
  y += 20;
  const band = graph?.latitudeBand?.(tile) ?? LATITUDE_BAND.EQUATORIAL;
  const lat = latitudeModifierOf(band);
  drawKvRow(ctx, x, y, w, t('colonyConsole.band'), t(`colonyConsole.band.${BAND_KEY[band] ?? 'equatorial'}`), roles,
    { tone: band === LATITUDE_BAND.EQUATORIAL ? 'primary' : 'alert' });
  y += CONSOLE_KIT.KV_H;
  if (lat.production !== 1 || lat.buildCost !== 1) {
    drawKvRow(ctx, x, y, w, t('colonyConsole.bandProd'), `×${lat.production}`, roles, { tone: 'alert' }); y += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, x, y, w, t('colonyConsole.bandCost'), `×${lat.buildCost}`, roles, { tone: 'alert' }); y += CONSOLE_KIT.KV_H;
  }
  drawKvRow(ctx, x, y, w, t('colonyConsole.buildable'), t(terrain.buildable && !tile.damaged ? 'colonyConsole.yes' : 'colonyConsole.no'), roles,
    { tone: terrain.buildable && !tile.damaged ? 'primary' : 'alert' });
  y += CONSOLE_KIT.KV_H;
  const yb = Object.entries(terrain.yieldBonus ?? {});
  if (yb.length) {
    y += 2;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.yield'), roles);
    for (const [cat, mult] of yb) {
      const ck = `colonyConsole.cat.${cat}`;
      drawKvRow(ctx, x, y, w, cat === 'default' ? t('colonyConsole.yieldDefault') : (t(ck) === ck ? cat : t(ck)), `×${mult}`, roles,
        { tone: mult >= 1 ? 'primary' : 'alert' });
      y += CONSOLE_KIT.KV_H;
    }
  }
  if (tile.anomaly && tile.anomalyDetected) {
    y += 2;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.anomaly'), roles);
    ctx.font = F(THEME.fontSizeNormal); ctx.textBaseline = 'middle';
    const ad = tile.anomalyRevealed ? ANOMALIES[tile.anomaly] : null;
    ctx.fillStyle = roles.primary;
    ctx.fillText(fit(ctx, ad ? (getLocale() === 'en' ? (ad.nameEN ?? ad.namePL ?? ad.id) : (ad.namePL ?? ad.id)) : t('colonyConsole.anomalyUnknown'), w), x, y + 8);
    y += 16;
    if (ad) {
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
      ctx.fillText(fit(ctx, getLocale() === 'en' ? (ad.effectDescEN ?? ad.effectDescPL ?? '') : (ad.effectDescPL ?? ''), w), x, y + 6);
      y += 14;
    }
  }
  return y + 6;
}

/** Wiersz listy budowy / palety: ikona, nazwa, koszt, stan. Zwraca wysokość. */
function drawBuildRow(ov, ctx, x, y, w, roles, row, haveOf, { vis, hz, type, picked = false, yieldText = null }) {
  const C = COLONY_CONSOLE, h = C.BUILD_ROW_H;
  const hov = isHz(hz, type, (d) => d.buildingId === row.id) || (isHz(hz, 'cReason') && hz.x === x && hz.y === y);
  const off = !row.enabled;
  ctx.save();
  if (hov && !off) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(x, y, w, h - 2); ctx.globalAlpha = 1; }
  ctx.globalAlpha = off ? 0.5 : 1;
  drawBuildingPortrait(ctx, row.id, x + 2, y + 5, C.ROW_ICON, roles, { frame: false });
  ctx.globalAlpha = 1;
  const tx = x + C.ROW_ICON + 10, tw = w - C.ROW_ICON - 14;
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeNormal, picked);
  ctx.fillStyle = off ? roles.dim : roles.primary;
  let nameW = tw;
  if (yieldText) {
    ctx.font = F(THEME.fontSizeSmall); ctx.textAlign = 'right'; ctx.fillStyle = roles.dim;
    ctx.fillText(yieldText, x + w - 2, y + 10);
    nameW -= ctx.measureText(yieldText).width + 8;
    ctx.textAlign = 'left'; ctx.font = F(THEME.fontSizeNormal, picked); ctx.fillStyle = off ? roles.dim : roles.primary;
  }
  ctx.fillText(fit(ctx, bName(row.id), nameW), tx, y + 10);
  if (row.state === BUILD_ROW.LOCKED || row.state === BUILD_ROW.FOREIGN) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert;
    ctx.fillText(fit(ctx, t(row.reasonKey), tw), tx, y + 25);
  } else {
    const cw = drawCostLine(ctx, tx, y + 25, tw, row.cost, haveOf, roles);
    if (row.state === BUILD_ROW.QUEUE) {
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, t('colonyConsole.toQueue'), tw - cw - 6), tx + cw + 4, y + 25);
    }
  }
  if (picked) drawSelectBrackets(ctx, { x, y, w, h: h - 2 }, roles);
  ctx.restore();
  if (!vis || vis(y, h - 2)) {
    if (row.enabled) {
      const tip = row.state === BUILD_ROW.QUEUE ? `${missingText(row.missing)} · ${t('colonyConsole.reason.queueShort')}` : null;
      ov._addHit(x, y, w, h - 2, type, { buildingId: row.id, tip, tipTone: 'alert' });
    } else {
      ov._addHit(x, y, w, h - 2, 'cReason', { tip: `${t(row.reasonKey)} — ${t(row.state === BUILD_ROW.FOREIGN ? 'colonyConsole.fix.foreign' : 'colonyConsole.fix.terrain')}` });
    }
  }
  return h;
}

/** Wiersze budowy dla pola (`entries` z bramki gospodarza) z rzeczywistym kosztem na polu. */
function buildRowsFor(ov, colony, tile, ordersOk) {
  const bSys = colony?.buildingSystem ?? null;
  const entries = ov._getAvailableBuildings(tile);
  const haveOf = haveOfColony(colony);
  const rows = sortByCategory(tileBuildRows({
    entries, haveOf, ordersOk,
    costOf: (id) => bSys?.previewBuildCost?.(tile, id) ?? null,
  }));
  return { rows, haveOf, bSys };
}

function yieldTextOf(bSys, tile, id) {
  const y = bSys?.previewTileYield?.(tile, id) ?? null;
  if (!y || y.key == null) return null;
  return `+${fmtNum(y.value)} ${resLabel(y.key)}`;
}

function drawTile(ov, ctx, x, y0, w, vis, roles, colony, grid, graph, tile, state, ordersOk, K, hz) {
  let y = y0;
  if (state.capital) {
    drawBuildingPortrait(ctx, CAPITAL_BUILDING_ID, x, y, COLONY_CONSOLE.PORTRAIT, roles);
    ctx.textBaseline = 'middle'; ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
    ctx.fillText(fit(ctx, bName(CAPITAL_BUILDING_ID).toUpperCase(), w - COLONY_CONSOLE.PORTRAIT - 12), x + COLONY_CONSOLE.PORTRAIT + 12, y + 10);
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, t('colonyConsole.capitalNote'), w - COLONY_CONSOLE.PORTRAIT - 12), x + COLONY_CONSOLE.PORTRAIT + 12, y + 28);
    y += COLONY_CONSOLE.PORTRAIT + 8;
  }
  y = drawTerrainBlock(ctx, x, y, w, roles, graph, tile);

  // Jednostki na polu (klik = zaznacz jednostkę)
  const units = K?.groundUnitManager?.getUnitsAtHex?.(colony?.planetId, tile.q, tile.r) ?? [];
  const mine = units.filter((u) => !u.owner || u.owner === 'player');
  if (mine.length) {
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.unitsHere', mine.length), roles);
    for (const u of mine) {
      y += actionChip(ov, ctx, x, y, w, roles, { label: unitName(u), type: 'cycleHexUnit', data: { unitId: u.id }, vis });
    }
    y += 4;
  }

  if (!state.canBuild) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.reason.preview'), w), x, y + 8);
    return y + 20;
  }
  // Lista budowy: rzeczywisty koszt na TYM polu + werdykt
  const { rows, haveOf, bSys } = buildRowsFor(ov, colony, tile, ordersOk);
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.buildList', rows.length), roles);
  if (!rows.length) {
    const terrain = TERRAIN_TYPES[tile.type];
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t(terrain?.buildable && !tile.damaged ? 'colonyConsole.reason.noneAvailable' : 'colonyConsole.reason.terrainTile'), w), x, y + 8);
    y += 16;
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, t(terrain?.buildable && !tile.damaged ? 'colonyConsole.fix.research' : 'colonyConsole.fix.otherTile'), w), x, y + 8);
    return y + 20;
  }
  let lastCat = null;
  for (const row of rows) {
    if (row.category !== lastCat) {
      lastCat = row.category;
      ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.fillStyle = catColor(row.category);
      const ck = `colonyConsole.cat.${row.category}`;
      ctx.fillText((t(ck) === ck ? row.category : t(ck)).toUpperCase(), x, y + 8);
      y += 16;
    }
    y += drawBuildRow(ov, ctx, x, y, w, roles, row, haveOf, { vis, hz, type: 'build', yieldText: yieldTextOf(bSys, tile, row.id) });
  }
  return y + 4;
}

function drawRateLines(ctx, x, y0, w, roles, rates, { skipEnergy = true } = {}) {
  let y = y0;
  for (const [res, rate] of Object.entries(rates ?? {})) {
    if (rate === 0 || (skipEnergy && res === 'energy')) continue;
    drawKvRow(ctx, x + 8, y, w - 8, resLabel(res), `${rate > 0 ? '+' : ''}${fmtNum(rate)}`, roles, { tone: rate > 0 ? 'primary' : 'alert' });
    y += CONSOLE_KIT.KV_H;
  }
  return y;
}

function drawBuilding(ov, ctx, x, y0, w, vis, roles, colony, graph, tile, ordersOk) {
  const C = COLONY_CONSOLE;
  const b = BUILDINGS[tile.buildingId];
  const bSys = colony?.buildingSystem ?? null;
  const tileKey = graph.idOf(tile);
  const entry = bSys?._active?.get(tileKey) ?? null;
  const level = tile.buildingLevel ?? entry?.level ?? 1;
  let y = y0;
  if (!b) return y;

  // Portret + nazwa + poziom
  drawBuildingPortrait(ctx, b.id, x, y, C.PORTRAIT, roles);
  const tx = x + C.PORTRAIT + 12, tw = w - C.PORTRAIT - 12;
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
  ctx.fillText(fit(ctx, bName(b.id).toUpperCase(), tw), tx, y + 10);
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = catColor(b.category);
  const ck = `colonyConsole.cat.${b.category}`;
  ctx.fillText(fit(ctx, (t(ck) === ck ? (b.category ?? '') : t(ck)).toUpperCase(), tw), tx, y + 27);
  const maxLevel = bSys?.getMaxLevel?.() ?? b.maxLevel ?? null;
  ctx.fillStyle = roles.dim;
  ctx.fillText(t('colonyConsole.level', level, b.maxLevel ? (maxLevel ?? b.maxLevel) : '—'), tx, y + 43);
  if (state_capitalBadge(tile)) { ctx.fillStyle = roles.dim; ctx.fillText(fit(ctx, t('colonyConsole.onCapital'), tw), tx, y + 59); }
  y += C.PORTRAIT + 8;

  // Produkcja / wydobycie
  const isMine = b.isMine || b.id === 'mine';
  const mineEst = isMine ? bSys?.getMineOutputEstimate?.(tileKey) : null;
  const rates = entry?.effectiveRates ?? entry?.baseRates ?? b.rates;
  if (mineEst && Object.keys(mineEst.gains).length > 0) {
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.extraction') + (mineEst.staff < 0.995 ? ` ×${+mineEst.staff.toFixed(2)}` : ''), roles);
    for (const [res, amt] of Object.entries(mineEst.gains)) {
      drawKvRow(ctx, x + 8, y, w - 8, resLabel(res), `+${amt.toFixed(1)}`, roles, { tone: amt > 0.05 ? 'primary' : 'alert' });
      y += CONSOLE_KIT.KV_H;
    }
  } else if (!isMine && rates && Object.keys(rates).some((k) => k !== 'energy' && rates[k] !== 0)) {
    const eff = bSys?._getBuildingLaborEfficiency?.(b, tileKey) ?? 1.0;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.production') + (Math.abs(eff - 1.0) > 0.005 ? ` ×${+eff.toFixed(2)}` : ''), roles);
    y = drawRateLines(ctx, x, y, w, roles, rates);
    // stawki bazowe, które spadły do zera (brak obsady) — uczciwe „0"
    for (const [res, base] of Object.entries(b.rates ?? {})) {
      if (base <= 0 || res === 'energy' || (rates[res] ?? 0) !== 0) continue;
      drawKvRow(ctx, x + 8, y, w - 8, resLabel(res), eff <= 0 ? t('colonyConsole.noStaff') : '0', roles, { tone: 'alert' });
      y += CONSOLE_KIT.KV_H;
    }
  }
  if (b.maintenance && Object.keys(b.maintenance).length) {
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.maintenance'), roles);
    for (const [res, cost] of Object.entries(b.maintenance)) {
      drawKvRow(ctx, x + 8, y, w - 8, resLabel(res), `−${cost}`, roles, { tone: 'alert' }); y += CONSOLE_KIT.KV_H;
    }
  }
  // Energia / obsada / mieszkania
  const droids = bSys?._tileDroidCount?.(entry, tileKey) ?? 0;
  const tier = tile.syntheticSlot?.tier ?? 1;
  const perDroid = bSys?.constructor?.SYNTH_ENERGY_UPKEEP?.[tier] ?? 2;
  const kv = [];
  if (b.energyCost) {
    const e = Math.round(rates?.energy ?? -b.energyCost) + Math.round(perDroid * droids);
    kv.push([t('colonyConsole.energy'), `${e >= 0 ? '+' : ''}${e}`, e >= 0 ? 'primary' : 'alert']);
  } else if ((rates?.energy ?? 0) !== 0) {
    kv.push([t('colonyConsole.energy'), `${rates.energy > 0 ? '+' : ''}${fmtNum(rates.energy)}`, rates.energy > 0 ? 'primary' : 'alert']);
  }
  if (b.jobs) {
    const jobs = (b.jobs ?? 0) * (entry?.level ?? 1);
    kv.push([t('colonyConsole.staffing'), droids > 0 ? t('colonyConsole.staffingMix', jobs - droids, droids, jobs) : t('colonyConsole.staffingPop', jobs), 'primary']);
    if (droids > 0) kv.push([t('colonyConsole.droidUpkeep'), `−${perDroid * droids}`, 'alert']);
  }
  if (b.housing) kv.push([t('colonyConsole.housing'), `+${b.housing * level}`, 'primary']);
  if (kv.length) {
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.operation'), roles);
    for (const [k, v, tone] of kv) { drawKvRow(ctx, x + 8, y, w - 8, k, v, roles, { tone }); y += CONSOLE_KIT.KV_H; }
  }

  // Desygnacja (trójstan)
  if (GAME_CONFIG.FEATURES?.popAllocation2Priority === true && entry) {
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.designation'), roles);
    const cur = entry.designation ?? 'active';
    const segW = Math.floor((w - 8) / 3);
    ['active', 'paused', 'priority'].forEach((id, i) => {
      const sx = x + i * (segW + 4);
      const on = id === cur;
      const hz = ov._hoverZone, hov = !!hz && hz.x === sx && hz.y === y;
      drawActionChip(ctx, sx, y, segW, roles, { label: t(`designation.${id}`), enabled: on || ordersOk, hover: hov });
      if (on) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sx + 4, y + CONSOLE_KIT.CHIP_H - 0.5); ctx.lineTo(sx + segW - 4, y + CONSOLE_KIT.CHIP_H - 0.5); ctx.stroke(); }
      if (vis(y, CONSOLE_KIT.CHIP_H)) ov._addHit(sx, y, segW, CONSOLE_KIT.CHIP_H, 'setDesignation', { tileKey, designation: id, tip: t('designation.tooltip'), tipTone: 'dim' });
    });
    y += CONSOLE_KIT.CHIP_H + CONSOLE_KIT.CHIP_GAP + 2;
  }

  // Droidy
  if (bSys && (b.jobs ?? 0) > 0 && !b.isAutonomous) {
    const prev = bSys.previewSyntheticInstall?.(tileKey) ?? { ok: false, reason: 'no_building', count: 0, jobs: 0 };
    const dCount = prev.count ?? 0, dJobs = prev.jobs ?? 0;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.droids', dCount, dJobs), roles);
    if (dCount < dJobs) y += actionChip(ov, ctx, x, y, w, roles, { label: t('synthetic.autonomize'), type: 'autonomizeBuilding', data: { tileKey }, enabled: ordersOk, reason: t('colonyConsole.reason.foreign'), vis });
    if (prev.ok) y += actionChip(ov, ctx, x, y, w, roles, { label: t('synthetic.install'), type: 'installSynthetic', data: { tileKey, commodityId: prev.commodityId }, enabled: ordersOk, reason: t('colonyConsole.reason.foreign'), vis });
    else if (prev.reason && prev.reason !== 'no_building' && prev.reason !== 'autonomous_building') {
      y += actionChip(ov, ctx, x, y, w, roles, { label: t('synthetic.install'), enabled: false, reason: t('synthetic.reason.' + prev.reason), vis });
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, t('synthetic.reason.' + prev.reason), w), x, y + 4); y += 14;
    }
    if (dCount > 0) {
      const ret = GAME_CONFIG.FEATURES?.popAllocation2 === true;
      y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyPanel.removeSynthetic'), type: 'removeSynthetic', data: { tileKey }, enabled: ordersOk, danger: !ret, reason: t('colonyConsole.reason.foreign'), vis });
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
      ctx.fillText(fit(ctx, t(ret ? 'synthetic.removeReturnHint' : 'synthetic.removeWarn'), w), x, y + 4); y += 14;
    }
  }

  // Ulepszenie / rozbiórka
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.actions'), roles);
  const haveOf = haveOfColony(colony);
  const up = bSys?.previewUpgradeCost?.(tileKey) ?? null;
  if (b.maxLevel && up) {
    const busy = !!tile.underConstruction || !!tile.pendingBuild;
    const reason = !ordersOk ? t('colonyConsole.reason.foreign') : busy ? t('colonyConsole.reason.busy') : null;
    y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyConsole.upgradeTo', up.nextLevel), type: 'upgrade', enabled: !reason, reason, vis });
    drawCostLine(ctx, x + 8, y + 5, w - 8, up.cost, haveOf, roles);
    y += 16;
  } else if (b.maxLevel) {
    y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyConsole.upgrade'), enabled: false, reason: t('colonyConsole.reason.maxLevel'), vis });
  }
  y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyConsole.demolish'), type: 'demolish', enabled: ordersOk, danger: true,
    reason: t('colonyConsole.reason.foreign'), vis });
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, t('colonyConsole.demolishHint'), w), x, y + 4);
  y += 16;

  // Teren pola pod budynkiem
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.insp.tile'), roles);
  y = drawTerrainBlock(ctx, x, y, w, roles, graph, tile);
  return y;
}

const state_capitalBadge = (tile) => !!tile?.capitalBase;

function drawQueuedTile(ov, ctx, x, y0, w, vis, roles, colony, graph, tile, state, ordersOk) {
  const C = COLONY_CONSOLE;
  let y = y0;
  const id = state.kind === 'construction' ? tile.underConstruction.buildingId : tile.pendingBuild;
  drawBuildingPortrait(ctx, id, x, y, C.PORTRAIT, roles);
  const tx = x + C.PORTRAIT + 12, tw = w - C.PORTRAIT - 12;
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = roles.primary;
  ctx.fillText(fit(ctx, bName(id).toUpperCase(), tw), tx, y + 10);
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
  if (state.kind === 'construction') {
    const uc = tile.underConstruction;
    const frac = uc.buildTime > 0 ? Math.max(0, Math.min(1, (uc.progress ?? 0) / uc.buildTime)) : 1;
    ctx.fillText(t('colonyConsole.building', Math.round(frac * 100)), tx, y + 28);
    drawBar(ctx, tx, y + 40, tw, frac, roles, { h: 3 });
    ctx.fillText(t('colonyConsole.yearsLeft', Math.max(0, (uc.buildTime ?? 0) - (uc.progress ?? 0)).toFixed(1)), tx, y + 54);
    y += C.PORTRAIT + 8;
    y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyConsole.cancelBuild'), type: 'cQueueCancel', data: { tileKey: graph.idOf(tile), kind: 'construction' },
      enabled: ordersOk, danger: true, reason: t('colonyConsole.reason.foreign'), vis });
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.cancelRefund'), w), x, y + 4); y += 16;
  } else {
    const order = colony?.buildingSystem?._pendingQueue?.get(graph.idOf(tile)) ?? null;
    ctx.fillStyle = roles.alert;
    ctx.fillText(fit(ctx, t('colonyConsole.waiting'), tw), tx, y + 28);
    if (order?.cost) drawCostLine(ctx, tx, y + 46, tw, order.cost, haveOfColony(colony), roles);
    y += C.PORTRAIT + 8;
    y += actionChip(ov, ctx, x, y, w, roles, { label: t('colonyConsole.cancelOrder'), type: 'cancelPending', enabled: ordersOk, danger: true,
      reason: t('colonyConsole.reason.foreign'), vis });
  }
  y += 4;
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.insp.tile'), roles);
  return drawTerrainBlock(ctx, x, y, w, roles, graph, tile);
}

// ── Paleta trybu budowy („budynek → pola") ──────────────────────────────────

function drawPalette(ov, ctx, rect, roles, colony, grid, graph, K, hz) {
  const bSys = colony?.buildingSystem ?? null;
  const haveOf = haveOfColony(colony);
  // Katalog: budynki dostępne na JAKIMKOLWIEK polu (bramki tech / frakcji / prereq jak lista pola); koszt bazowy = pole równikowe
  const cat = ov._consolePaletteCatalog(colony, grid);
  const cats = categoriesOf(cat);
  if (!cats.some((c) => c.id === ov._cCat)) ov._cCat = cats[0]?.id ?? null;
  let y = rect.y;
  // pasek kategorii
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  let cx = rect.x, rowY = y;
  for (const c of cats) {
    const ck = `colonyConsole.cat.${c.id}`;
    const txt = chipLabel(t(ck) === ck ? c.id : t(ck));
    const w = Math.ceil(ctx.measureText(txt).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
    if (cx + w > rect.x + rect.w) { cx = rect.x; rowY += CONSOLE_KIT.CHIP_H + 4; }
    const on = c.id === ov._cCat, hov = isHz(hz, 'cCat', (d) => d.id === c.id);
    if (hov && !on) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(cx, rowY, w, CONSOLE_KIT.CHIP_H); ctx.globalAlpha = 1; }
    ctx.fillStyle = on ? catColor(c.id) : roles.dim;
    ctx.fillText(txt, cx + CONSOLE_KIT.CHIP_PAD_X, rowY + CONSOLE_KIT.CHIP_H / 2);
    if (on) { ctx.strokeStyle = catColor(c.id); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + 4, rowY + CONSOLE_KIT.CHIP_H - 0.5); ctx.lineTo(cx + w - 4, rowY + CONSOLE_KIT.CHIP_H - 0.5); ctx.stroke(); }
    ov._addHit(cx, rowY, w, CONSOLE_KIT.CHIP_H, 'cCat', { id: c.id });
    cx += w + CONSOLE_KIT.HEADER_CHIP_GAP;
  }
  ctx.restore();
  y = rowY + CONSOLE_KIT.CHIP_H + 8;

  // stan wybranego budynku: ile pól go przyjmie
  const pick = ov._cPick && cat.some((r) => r.id === ov._cPick) ? ov._cPick : null;
  if (!pick) ov._cPick = null;
  ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  if (pick) {
    const n = ov._cPlaceable?.count ?? 0;
    ctx.fillStyle = n > 0 ? roles.primary : roles.alert;
    ctx.fillText(fit(ctx, n > 0 ? t('colonyConsole.pickedHint', bName(pick), n) : t('colonyConsole.pickedNone', bName(pick)), rect.w), rect.x, y + 7);
  } else {
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, t('colonyConsole.paletteHint'), rect.w), rect.x, y + 7);
  }
  ctx.fillStyle = roles.dim;
  ctx.fillText(fit(ctx, t('colonyConsole.paletteKeys'), rect.w), rect.x, y + 22);
  ctx.restore();
  y += 34;

  // Pole pod kursorem: werdykt i RZECZYWISTY koszt wybranego budynku na TYM polu (pas szerokości wliczony) — kwota,
  // którą pobierze klik. Blok ma stałą wysokość, żeby lista pod nim nie skakała.
  if (pick) {
    const hov = ov._hoveredHex ? graph?.tile?.(ov._hoveredHex) ?? null : null;
    y += drawEyebrow(ctx, rect.x, y, rect.w, t('colonyConsole.target'), roles);
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    if (!hov) {
      ctx.fillStyle = roles.dim;
      ctx.fillText(fit(ctx, t('colonyConsole.targetNone'), rect.w), rect.x, y + 8);
    } else {
      const b = BUILDINGS[pick];
      const ctxV = { techSystem: K?.techSystem ?? null, planet: colony?.planet ?? null };
      const verdict = buildVerdictFor(hov, b, ctxV);
      const band = graph?.latitudeBand?.(hov) ?? LATITUDE_BAND.EQUATORIAL;
      ctx.fillStyle = roles.primary;
      ctx.fillText(fit(ctx, `${t('colonyConsole.tileNo', tilePosLabel(hov, ', '))} · ${terrainName(hov.type)} · ${t(`colonyConsole.band.${BAND_KEY[band] ?? 'equatorial'}`)}`, rect.w), rect.x, y + 8);
      if (verdict === BUILD_VERDICT.OK) {
        const yt = yieldTextOf(bSys, hov, pick);
        drawCostLine(ctx, rect.x, y + 26, rect.w - (yt ? 90 : 0), bSys?.previewBuildCost?.(hov, pick) ?? {}, haveOf, roles);
        if (yt) { ctx.fillStyle = roles.dim; ctx.textAlign = 'right'; ctx.fillText(yt, rect.x + rect.w, y + 26); ctx.textAlign = 'left'; }
      } else {
        ctx.fillStyle = roles.alert;
        const why = verdict === BUILD_VERDICT.OCCUPIED ? t('colonyConsole.flash.occupied')
          : `${t(evaluatePlacement(hov, b, ctxV).reason ?? 'ui.terrainForbidden')} — ${t('colonyConsole.fix.otherTile')}`;
        ctx.fillText(fit(ctx, why, rect.w), rect.x, y + 26);
      }
    }
    ctx.restore();
    y += 40;
  }

  const list = { x: rect.x, y, w: rect.w, h: Math.max(0, rect.y + rect.h - y) };
  scrolled(ov, ctx, list, 'insp', roles, (x, yy, w, vis) => {
    let ry = yy;
    for (const row of cat.filter((r) => r.category === ov._cCat)) {
      ry += drawBuildRow(ov, ctx, x, ry, w, roles, row, haveOf, { vis, hz, type: 'cPick', picked: row.id === pick });
    }
    return ry + 4;
  });
}

// ── Jednostka ───────────────────────────────────────────────────────────────

function unitName(u) {
  if (u.archetypeId && UNIT_ARCHETYPES?.[u.archetypeId]) {
    const ak = `groundUnit.${u.archetypeId}`;
    if (t(ak) !== ak) return t(ak);
  }
  const k = `colonyConsole.unitType.${u.type}`;
  return t(k) === k ? String(u.type ?? '?') : t(k);
}

function drawUnit(ov, ctx, x, y0, w, vis, roles, colony, grid, graph, K) {
  const unit = ov._selectedUnit;
  const gum = K?.groundUnitManager;
  const C = COLONY_CONSOLE;
  let y = y0;
  if (!unit) return y;
  const isEnemy = !!unit.owner && unit.owner !== 'player';
  const tone = isEnemy ? 'alert' : 'primary';
  // karta: portret (sprite jednostki) + nazwa + właściciel + stan
  const img = ov._getUnitSprite?.(unit) ?? null;
  ctx.save(); ctx.shadowBlur = 0;
  if (img && (img.complete ?? true) && (img.naturalWidth ?? 1) > 0) { try { ctx.drawImage(img, x, y, C.PORTRAIT, C.PORTRAIT); } catch (e) { /* ładuje się */ } }
  ctx.restore();
  drawZoneFrame(ctx, { x, y, w: C.PORTRAIT, h: C.PORTRAIT }, roles, { arm: 8, tone: isEnemy ? 'alert' : 'dim' });
  const tx = x + C.PORTRAIT + 12, tw = w - C.PORTRAIT - 12;
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeNormal, true); ctx.fillStyle = isEnemy ? roles.alert : roles.primary;
  ctx.fillText(fit(ctx, unitName(unit).toUpperCase(), tw), tx, y + 10);
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
  const owner = isEnemy ? (K?.empireRegistry?.get?.(unit.owner)?.name ?? unit.owner) : t('colonyConsole.unit.own');
  ctx.fillText(fit(ctx, owner, tw), tx, y + 27);
  const pct = Math.floor((unit.mission?.progress ?? 0) * 100);
  const stKey = unit.status === 'scanning' ? (unit.mission?.type === 'analyze' ? 'analyzing' : 'scanning') : unit.status;
  const stK = `colonyConsole.unit.status.${stKey}`;
  ctx.fillStyle = roles.primary;
  ctx.fillText(fit(ctx, t(stK) === stK ? String(unit.status) : t(stK, pct), tw), tx, y + 43);
  ctx.fillStyle = roles.dim;
  ctx.fillText(t('colonyConsole.tileNo', tilePosLabel(unit, ', ')), tx, y + 59);
  y += C.PORTRAIT + 8;

  if (isEnemy) { ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.fillText(fit(ctx, t('colonyConsole.unit.recon'), w), x, y + 6); y += 16; }
  if ((ov._selectedUnits?.size ?? 0) > 1) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.primary; ctx.textBaseline = 'middle';
    ctx.fillText(t('colonyConsole.unit.multi', ov._selectedUnits.size), x, y + 6); y += 16;
  }
  // przełącznik jednostek na tym samym polu
  const sibs = (gum?.getUnitsAtHex?.(unit.planetId, unit.q, unit.r) ?? []).filter((u) => (isEnemy ? (u.owner && u.owner !== 'player') : (!u.owner || u.owner === 'player')));
  if (sibs.length > 1) {
    const i = Math.max(0, sibs.findIndex((u) => u.id === unit.id));
    const half = Math.floor((w - 70) / 2);
    drawActionChip(ctx, x, y, half, roles, { label: '<', hover: false });
    if (vis(y, CONSOLE_KIT.CHIP_H)) ov._addHit(x, y, half, CONSOLE_KIT.CHIP_H, 'cycleHexUnit', { unitId: sibs[(i - 1 + sibs.length) % sibs.length].id });
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t('colonyConsole.unit.stack', i + 1, sibs.length), x + w / 2, y + CONSOLE_KIT.CHIP_H / 2);
    ctx.textAlign = 'left';
    drawActionChip(ctx, x + w - half, y, half, roles, { label: '>', hover: false });
    if (vis(y, CONSOLE_KIT.CHIP_H)) ov._addHit(x + w - half, y, half, CONSOLE_KIT.CHIP_H, 'cycleHexUnit', { unitId: sibs[(i + 1) % sibs.length].id });
    y += CONSOLE_KIT.CHIP_H + 8;
  }

  // parametry
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.unit.stats'), roles);
  if (unit.hpMax) {
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.hp'), `${Math.round(unit.hp)} / ${unit.hpMax}`, roles, { tone }); y += CONSOLE_KIT.KV_H;
    const f = Math.max(0, Math.min(1, unit.hp / unit.hpMax));
    drawBar(ctx, x, y, w, f, roles, { tone: f < 0.35 ? 'alert' : tone }); y += 6;
  }
  if (unit.attack != null) {
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.attack'), String(unit.attack), roles, { tone }); y += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.defense'), String(unit.defense ?? 0), roles, { tone }); y += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.range'), String(unit.range ?? 1), roles, { tone }); y += CONSOLE_KIT.KV_H;
  }
  if (unit.supply != null && !isEnemy) {
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.supply'), `${Math.round(unit.supply)} / ${unit.supplyCap}`, roles, { tone: unit.supply <= 0 ? 'alert' : 'primary', unit: `−${unit.supplyConsumption ?? 2}/${t('colonyConsole.yr')}` });
    y += CONSOLE_KIT.KV_H;
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.org'), `${Math.round(unit.org ?? 0)} / ${unit.maxOrg ?? 0}`, roles); y += CONSOLE_KIT.KV_H;
    if (!unit.noMorale) { drawKvRow(ctx, x, y, w, t('colonyConsole.unit.morale'), String(Math.round(unit.morale ?? DEFAULT_MORALE)), roles); y += CONSOLE_KIT.KV_H; }
    const supFac = (unit.supply ?? 0) <= 0 ? 0 : Math.min((unit.supply ?? 0) / 20, 1);
    const core = ((unit.org ?? 0) + (unit.noMorale ? 0 : (unit.morale ?? DEFAULT_MORALE))) / (unit.noMorale ? 100 : 200);
    const dm = supFac * (1 + core);
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.damage'), `×${dm.toFixed(2)}`, roles, { tone: dm >= 1 ? 'primary' : 'alert' }); y += CONSOLE_KIT.KV_H;
  }
  if (!isEnemy && unit.withdrawal) {
    const now = K?.timeSystem?.gameTime ?? 0;
    const left = Math.max(0, Math.ceil((unit.withdrawal.deadline - now) * 12 - 1e-9));
    const date = K?.timeSystem?.formatTime?.(unit.withdrawal.deadline) ?? Number(unit.withdrawal.deadline).toFixed(2);
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.unit.withdrawal', date, left), w), x, y + 6); y += 16;
  }
  const inCombat = !isEnemy && !!gum?.isUnitInCombat?.(unit);
  if (inCombat) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.unit.inCombat'), w), x, y + 6); y += 16;
  }
  if (!isEnemy && unit.deployState != null) {
    const dk = `colonyConsole.unit.deploy.${unit.deployState}`;
    drawKvRow(ctx, x, y, w, t('colonyConsole.unit.mode'), t(dk) === dk ? unit.deployState : t(dk), roles); y += CONSOLE_KIT.KV_H;
    if (unit.deployState === 'deploying' || unit.deployState === 'packing') {
      const arch = ov._deployArchetypes?.[unit.archetypeId];
      const total = unit.deployState === 'deploying' ? (arch?.deployTime ?? 2) : (arch?.packTime ?? 1);
      const remain = Math.max(0, unit.stateTimer ?? 0);
      drawBar(ctx, x, y + 2, w, total > 0 ? 1 - remain / total : 1, roles, { h: 3 }); y += 10;
    }
  }

  // rozkazy
  y += 4;
  y += drawEyebrow(ctx, x, y, w, t('colonyConsole.unit.orders'), roles);
  const tile = graph?.tile?.(unit) ?? null;
  const orders = unitOrdersOf(unit, {
    isEnemy, inCombat,
    canAnalyze: !!(tile?.anomaly && tile.anomalyDetected && !tile.anomalyRevealed),
    hasSupportCandidates: !isEnemy && K?.combatSystem ? !!ov._hasSupportCandidates?.(unit, K.combatSystem) : false,
    hasCombatSystem: !!K?.combatSystem,
  });
  if (!isEnemy) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.unit.moveHint'), w), x, y + 6); y += 16;
  }
  for (const o of orders) {
    y += actionChip(ov, ctx, x, y, w, roles, { label: t(o.labelKey, ...(o.params ?? [])), type: o.type, data: o.type === 'drawerOpenUnit' ? { unitId: unit.id } : {}, enabled: o.enabled, danger: !!o.danger,
      reason: o.reasonKey ? t(o.reasonKey, ...(o.reasonParams ?? [])) : null, vis });
  }
  // transport: załadunek / rozładunek na statek z ładownią wojsk zadokowany w tej kolonii
  if (!isEnemy) {
    y += 4;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.unit.transport'), roles);
    for (const row of troopTransportRows(K?.vesselManager?.getVesselsAt?.(colony?.planetId) ?? [])) {
      y += actionChip(ov, ctx, x, y, w, roles, {
        label: row.enabled ? t('colonyConsole.order.cargo', row.name, row.used, row.capacity) : t('colonyConsole.order.cargoNone'),
        type: 'cCargo', data: { vesselId: row.id }, enabled: row.enabled, reason: row.reasonKey ? t(row.reasonKey) : null, vis });
    }
  }
  void grid;
  return y + 4;
}

// ── Podsumowanie kolonii (nic nie zaznaczone) ───────────────────────────────

function drawSummary(ov, ctx, rect, roles, colony, grid, K, hz) {
  const sum = colonySummaryOf(colony);
  let top = rect.y;
  // podzakładki: Podsumowanie / Załoga / Populacja (dwie ostatnie = dzisiejsze zakładki z pełnymi sterownikami)
  const tabs = sum.hasCiv ? ['summary', 'workforce', 'populacja'] : ['summary'];
  if (!tabs.includes(ov._cInspTab)) ov._cInspTab = 'summary';
  if (tabs.length > 1) {
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    let cx = rect.x;
    for (const id of tabs) {
      const txt = chipLabel(t(`colonyConsole.tab.${id}`));
      const w = Math.ceil(ctx.measureText(txt).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
      const on = id === ov._cInspTab, hov = isHz(hz, 'cInspTab', (d) => d.id === id);
      if (hov && !on) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(cx, top, w, CONSOLE_KIT.CHIP_H); ctx.globalAlpha = 1; }
      ctx.fillStyle = on ? roles.primary : roles.dim;
      ctx.fillText(txt, cx + CONSOLE_KIT.CHIP_PAD_X, top + CONSOLE_KIT.CHIP_H / 2);
      if (on) { ctx.strokeStyle = roles.primary; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + 4, top + CONSOLE_KIT.CHIP_H - 0.5); ctx.lineTo(cx + w - 4, top + CONSOLE_KIT.CHIP_H - 0.5); ctx.stroke(); }
      ov._addHit(cx, top, w, CONSOLE_KIT.CHIP_H, 'cInspTab', { id });
      cx += w + CONSOLE_KIT.HEADER_CHIP_GAP;
    }
    ctx.restore();
    top += CONSOLE_KIT.CHIP_H + 8;
  }
  const body = { x: rect.x, y: top, w: rect.w, h: Math.max(0, rect.y + rect.h - top) };
  if (ov._cInspTab !== 'summary') return drawLegacyTab(ov, ctx, body, colony, grid, ov._cInspTab);

  scrolled(ov, ctx, body, 'insp', roles, (x, y0, w, vis) => {
    let y = y0;
    ctx.textBaseline = 'middle';
    if (!sum.hasCiv) {
      ctx.font = F(THEME.fontSizeNormal); ctx.fillStyle = roles.primary;
      ctx.fillText(fit(ctx, t(`colonyConsole.kind.${sum.kind}`), w), x, y + 8); y += 20;
      ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
      ctx.fillText(fit(ctx, t(`colonyConsole.kindNote.${sum.kind}`), w), x, y + 6); y += 18;
    } else {
      y += drawEyebrow(ctx, x, y, w, t('colonyConsole.population'), roles);
      drawKvRow(ctx, x, y, w, t('colonyConsole.popHousing'), `${sum.humans} / ${sum.housing}`, roles, { tone: sum.humans >= sum.housing ? 'alert' : 'primary' }); y += CONSOLE_KIT.KV_H;
      drawBar(ctx, x, y, w, sum.housingFrac, roles, { tone: sum.housingFrac >= 1 ? 'alert' : 'primary' }); y += 6;
      drawKvRow(ctx, x, y, w, t('colonyConsole.growth'), `${sum.growth >= 0 ? '+' : ''}${sum.growth.toFixed(2)}`, roles, { tone: sum.growth < 0 ? 'alert' : 'primary', unit: `/${t('colonyConsole.yr')}` }); y += CONSOLE_KIT.KV_H;
      drawKvRow(ctx, x, y, w, t('colonyConsole.satisfaction'), `${sum.satisfaction}%`, roles, { tone: sum.satisfaction < 40 ? 'alert' : 'primary' }); y += CONSOLE_KIT.KV_H;
      if (sum.famine || sum.unrest) {
        ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.alert; ctx.textBaseline = 'middle';
        ctx.fillText(fit(ctx, [sum.famine ? t('colonyConsole.famine') : null, sum.unrest ? t('colonyConsole.unrest') : null].filter(Boolean).join(' · '), w), x, y + 6); y += 16;
      }
      y += 4;
      y += drawEyebrow(ctx, x, y, w, t('colonyConsole.crew'), roles);
      drawKvRow(ctx, x, y, w, t('workforce.unemployed'), `${sum.unemployed} (${Math.round(sum.unemployedFrac * 100)}%)`, roles, { tone: sum.unemployedFrac > 0.2 ? 'alert' : 'primary' }); y += CONSOLE_KIT.KV_H;
      // warstwy: obsadzeni / etaty (pełna tabela ze sterownikami — podzakładka Załoga)
      for (const s of workforceRowsOf(colony?.civSystem?.getWorkforceBreakdown?.())) {
        drawKvRow(ctx, x + 8, y, w - 8, getLocale() === 'en' ? s.nameEN : s.namePL, `${s.workers} / ${s.jobs}`, roles,
          { tone: s.workers < s.jobs ? 'alert' : 'primary' });
        y += CONSOLE_KIT.KV_H;
      }
      y += actionChip(ov, ctx, x, y + 2, w, roles, { label: t('colonyConsole.openCrew'), type: 'cInspTab', data: { id: 'workforce' }, vis }) + 2;
    }
    // budynki wg kategorii
    const counts = buildingCountsByCategory(colony?.buildingSystem?._active?.values?.() ?? []);
    y += 4;
    y += drawEyebrow(ctx, x, y, w, t('colonyConsole.buildings', counts.reduce((a, c) => a + c.count, 0)), roles);
    for (const c of counts) {
      const ck = `colonyConsole.cat.${c.id}`;
      ctx.save(); ctx.fillStyle = catColor(c.id); ctx.fillRect(x, y + 5, 6, 6); ctx.restore();
      drawKvRow(ctx, x + 12, y, w - 12, t(ck) === ck ? c.id : t(ck), String(c.count), roles); y += CONSOLE_KIT.KV_H;
    }
    if (!counts.length) { ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle'; ctx.fillText(t('colonyConsole.noBuildings'), x, y + 6); y += 16; }
    // jednostki naziemne na ciele
    const units = (K?.groundUnitManager?.getUnitsOnPlanet?.(colony?.planetId) ?? []).filter((u) => !u.owner || u.owner === 'player');
    if (units.length) {
      y += 4;
      y += drawEyebrow(ctx, x, y, w, t('colonyConsole.units', units.length), roles);
      for (const u of units.slice(0, 8)) y += actionChip(ov, ctx, x, y, w, roles, { label: `${unitName(u)} · ${tilePosLabel(u, ', ')}`, type: 'drawerUnitClick', data: { unitId: u.id }, vis });
    }
    y += 6;
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('colonyConsole.summaryHint'), w), x, y + 6);
    return y + 18;
  });
}

// ── Pas: kolejka budowy ─────────────────────────────────────────────────────

function drawQueueStrip(ov, ctx, sz, roles, colony, graph, ordersOk, hz) {
  const C = COLONY_CONSOLE, KIT = CONSOLE_KIT;
  const bSys = colony?.buildingSystem ?? null;
  const rows = queueRows({ construction: bSys?._constructionQueue ?? [], pending: bSys?._pendingQueue ?? [] });
  const head = drawZoneRule(ctx, sz, t('colonyConsole.queue', rows.length), roles);
  const rect = { x: sz.x, y: sz.y + head + 2, w: sz.w, h: Math.max(0, sz.h - head - 2) };
  if (!rows.length) {
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle';
    ctx.fillText(t(colony?.isPreview ? 'colonyConsole.reason.preview' : 'colonyConsole.queueEmpty'), rect.x, rect.y + 12);
    ctx.restore();
    return;
  }
  ov._cScroll ??= {}; ov._cScrollRects ??= {};
  const cardW = C.QUEUE_CARD_W, gap = 8, cardH = Math.min(rect.h, 52);
  const maxScroll = Math.max(0, rows.length * (cardW + gap) - gap - rect.w);
  const sc = Math.max(0, Math.min(maxScroll, ov._cScroll.queue ?? 0));
  ov._cScroll.queue = sc; ov._cScrollRects.queue = rect; ov._cQueueMaxScroll = maxScroll;
  const hitStart = ov._hitZones.length;
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.w, rect.h); ctx.clip();
  rows.forEach((row, i) => {
    const x = rect.x + i * (cardW + gap) - sc, y = rect.y;
    if (x + cardW < rect.x || x > rect.x + rect.w) return;
    const hovCard = isHz(hz, 'cQueueFocus', (d) => d.tileKey === row.tileKey);
    drawZoneFrame(ctx, { x, y, w: cardW, h: cardH }, roles, { tone: hovCard ? 'primary' : 'dim', arm: 5 });
    drawBuildingPortrait(ctx, row.buildingId, x + 5, y + 5, 26, roles, { frame: false });
    ctx.textBaseline = 'middle';
    ctx.font = F(THEME.fontSizeNormal); ctx.fillStyle = roles.primary;
    const nm = bName(row.buildingId) + (row.isUpgrade && row.targetLevel ? ` ${t('colonyConsole.lv', row.targetLevel)}` : '');
    ctx.fillText(fit(ctx, nm, cardW - 40 - 26), x + 37, y + 11);
    ctx.font = F(THEME.fontSizeSmall);
    if (row.kind === 'construction') {
      ctx.fillStyle = roles.dim;
      drawTabular(ctx, t('colonyConsole.queueProgress', Math.round(row.frac * 100), row.yearsLeft.toFixed(1)), x + 37, y + 26, 'left');
      drawBar(ctx, x + 6, y + cardH - 8, cardW - 12, row.frac, roles);
    } else {
      ctx.fillStyle = roles.alert;
      ctx.fillText(fit(ctx, t('colonyConsole.queueWaiting'), cardW - 44), x + 37, y + 26);
      // kolejność zamówień: [ < ] [ > ]
      const bw = 46, by = y + cardH - KIT.CHIP_H - 3;
      [['<', -1, row.canEarlier, 'colonyConsole.tip.earlier', 'colonyConsole.reason.first'], ['>', 1, row.canLater, 'colonyConsole.tip.later', 'colonyConsole.reason.last']]
        .forEach(([lab, delta, can, tipKey, noKey], k) => {
          const bx = x + 6 + k * (bw + 2);
          const en = can && ordersOk;
          const hov = !!hz && hz.x === bx && hz.y === by;
          drawActionChip(ctx, bx, by, bw, roles, { label: lab, enabled: en, hover: hov });
          if (en) ov._addHit(bx, by, bw, KIT.CHIP_H, 'cQueueMove', { tileKey: row.tileKey, delta, tip: t(tipKey), tipTone: 'dim' });
          else ov._addHit(bx, by, bw, KIT.CHIP_H, 'cReason', { tip: t(ordersOk ? noKey : 'colonyConsole.reason.foreign') });
        });
    }
    // anuluj
    const xw = 26, xr = { x: x + cardW - xw - 2, y: y + 2, w: xw, h: KIT.CHIP_H };
    const hovX = !!hz && hz.x === xr.x && hz.y === xr.y;
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillStyle = !ordersOk ? roles.dim : hovX ? roles.alert : roles.dim;
    ctx.fillText('[ x ]', xr.x + xr.w - 2, xr.y + xr.h / 2);
    ctx.textAlign = 'left';
    if (ordersOk) ov._addHit(xr.x, xr.y, xr.w, xr.h, 'cQueueCancel', { tileKey: row.tileKey, kind: row.kind, tip: t(row.kind === 'construction' ? 'colonyConsole.tip.cancelBuild' : 'colonyConsole.tip.cancelOrder'), tipTone: 'alert' });
    else ov._addHit(xr.x, xr.y, xr.w, xr.h, 'cReason', { tip: t('colonyConsole.reason.foreign') });
    // klik w kartę → zaznacz pole i obróć kulę do niego
    ov._addHit(x, y, cardW, cardH, 'cQueueFocus', { tileKey: row.tileKey });
  });
  ctx.restore();
  // strefy kart wystające poza pas (przewijanie poziome) — usuń
  for (let i = ov._hitZones.length - 1; i >= hitStart; i--) {
    const zn = ov._hitZones[i];
    if (zn.x + zn.w <= rect.x || zn.x >= rect.x + rect.w) ov._hitZones.splice(i, 1);
    else if (zn.x < rect.x) { zn.w -= rect.x - zn.x; zn.x = rect.x; }
    else if (zn.x + zn.w > rect.x + rect.w) zn.w = rect.x + rect.w - zn.x;
  }
  if (maxScroll > 0) {
    ctx.save(); ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
    ctx.fillText(t('colonyConsole.queueScroll'), rect.x + rect.w, sz.y + KIT.EYEBROW_H / 2 + 1);
    ctx.restore();
  }
  void graph;
}

// ── Etykiety uzysku na kuli (tryb „budynek → pola") ─────────────────────────

/**
 * Napisy spodziewanego uzysku na podświetlonych polach kuli. `labels` = [{ x, y, text, r }] policzone przez gospodarza
 * (rzut pola na ekran); rysowane w roli primary z ciemną poświatą, tylko gdy pole jest dość duże na ekranie.
 */
export function drawYieldLabels(ctx, labels, roles) {
  if (!labels?.length) return;
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = F(THEME.fontSizeSmall, true);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const l of labels) {
    const w = Math.ceil(ctx.measureText(l.text).width) + 10, h = 16;
    ctx.globalAlpha = 0.82; ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(Math.round(l.x - w / 2), Math.round(l.y - h / 2), w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = l.tone === 'alert' ? roles.alert : roles.primary;
    ctx.fillText(l.text, l.x, l.y + 0.5);
  }
  ctx.restore();
}
