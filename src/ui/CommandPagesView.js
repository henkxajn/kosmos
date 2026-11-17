// ARC KONSOLE K7-C — strony Dowództwa na konsoli: Atlas Gwiazd, Logistyka, Jednostki (FEATURES.consoleCommand).
//
// Wołane z `CommandConsoleView.drawCommandConsole` dla zakładek innych niż rejestr. Szablon 4-strefowy (lista · bohater ·
// inspektor · pas), żywa przyciemniona scena za tekstem (żadna strona nie stoi już na nieprzezroczystym tle), kolory tylko
// przez role konsoli. Strefy trafień: DZISIEJSZE typy i dane (handlery `_handleHit` bez zmian); nowe typy tylko dla wyboru
// na konsoli (`atlasSelect`, `logiSelect`, `groundColony`, `groundUnit`). Akcja niemożliwa = czip wyłączony z powodem i18n.

import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { UNIT_ARCHETYPES, ARCHETYPE_ICONS } from '../data/unitArchetypes.js';
import { HUMANITY_UNITS } from '../data/factions/humanity.js';
import { drawZoneRule, drawZoneFrame, drawEyebrow, drawKvRow, drawActionChip, drawList, drawSelectBrackets, drawBar, drawConsoleBackground,
  CONSOLE_KIT } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';
import { atlasRows, atlasCounts, atlasSelection, orreryLayout, atlasActions, logiSelection, orderProgress, orderAlert, logiNodes } from './CommandPagesLogic.js';

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const push = (ov, x, y, w, h, type, data = {}) => ov._hitZones.push({ x, y, w, h, type, data });
const LINE_H = 15;
const ORRERY_PAD = 5;   // margines orrery w strefie bohatera (px log.)

/** Układ stron (px logiczne): lista / inspektor / pas per zakładka. */
export const PAGES = Object.freeze({
  atlas:     { listW: 240, inspW: 300, stripH: 22 },   // pas = jedna linia podsumowania; zysk wysokości dla orrery
  logistics: { listW: 240, inspW: 320, stripH: 64 },
  ground:    { listW: 220, inspW: 320, stripH: 40 },
});

// ── Klocki (język inspektora K7-B) ─────────────────────────────────────────────────────────────────────────────────

function line(ctx, c, text, roles, { tone = 'primary', bold = false, size = THEME.fontSizeSmall, indent = 0 } = {}) {
  ctx.font = F(size, bold);
  ctx.fillStyle = roles[tone] ?? roles.primary;
  ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, text, c.w - indent), c.x + indent, c.y + LINE_H / 2);
  c.y += LINE_H;
}
function eyebrow(ctx, c, text, roles, tone = 'dim') {
  c.y += 4;
  drawEyebrow(ctx, c.x, c.y, c.w, text, roles, { tone });
  c.y += CONSOLE_KIT.EYEBROW_H;
}
function kv(ctx, c, k, v, roles, tone = 'primary') {
  drawKvRow(ctx, c.x, c.y, c.w, k, String(v ?? '—'), roles, { tone });
  c.y += CONSOLE_KIT.KV_H;
}
/** Czipy: ze strefą → dzisiejsza strefa; bez strefy → wyłączony, powód w podpowiedzi (`ov._cmdDisabled`). */
export function pageChips(ov, ctx, c, list, roles, cols = 1) {
  if (!list?.length) return;
  const mx = ov._regMouseX, my = ov._regMouseY;
  const gap = CONSOLE_KIT.CHIP_GAP;
  const cw = cols === 1 ? c.w : Math.floor((c.w - gap * (cols - 1)) / cols);
  list.forEach((ch, i) => {
    const col = i % cols;
    const x = c.x + col * (cw + gap);
    const label = ch.text ?? t(ch.labelKey, ...(ch.labelArgs ?? []));
    const rect = { x, y: c.y, w: cw, h: CONSOLE_KIT.CHIP_H };
    const enabled = !!ch.zone;
    drawActionChip(ctx, x, c.y, cw, roles, { label, enabled, danger: !!ch.danger, hover: inside(rect, mx, my) });
    if (enabled) push(ov, x, c.y, cw, CONSOLE_KIT.CHIP_H, ch.zone.type, ch.zone.data);
    else ov._cmdDisabled.push({ rect, reasonKey: ch.reasonKey ?? 'cmdInsp.reasonUnavailable', args: ch.reasonArgs ?? [] });
    if (col === cols - 1 || i === list.length - 1) c.y += CONSOLE_KIT.CHIP_H + 4;
  });
}
function centerHint(ctx, r, text, roles) {
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, text, r.w - 12), r.x + r.w / 2, r.y + r.h / 2);
  ctx.restore();
}
const body = (rect, top) => ({ x: rect.x, y: rect.y + top + 4, w: rect.w, h: Math.max(0, rect.h - top - 4) });

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// ATLAS GWIAZD — ciała aktywnego układu (lista ↔ orrery zsynchronizowane jednym `_atlasSelectedBodyId`)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

/** Dane Atlasu tej klatki (te same wpisy katalogu co strona OFF). */
export function atlasPageData(ov) {
  const K = window.KOSMOS;
  const colMgr = K?.colonyManager;
  const entries = ov._getAllCatalogBodies();
  const rows = atlasRows(entries, (id) => !!colMgr?.hasColony?.(id));
  const sel = atlasSelection(ov._atlasSelectedBodyId, rows);
  if (sel !== ov._atlasSelectedBodyId) ov._atlasSelectedBodyId = sel;
  const sysId = K?.activeSystemId ?? 'sys_home';
  const ships = (K?.vesselManager?.getAllVessels?.() ?? []).filter((v) => !v.isWreck && (v.owner ?? 'player') === 'player'
    && (v.systemId ?? 'sys_home') === sysId && v.position);
  return { entries, rows, sel, counts: atlasCounts(rows), ships, sysName: ov._sysName?.(sysId) ?? sysId };
}

export function drawAtlasPage(ov, ctx, z, roles) {
  const d = atlasPageData(ov);
  drawAtlasList(ov, ctx, z.list, roles, d);
  drawAtlasHero(ov, ctx, z.hero, roles, d);
  drawAtlasInspector(ov, ctx, z.inspector, roles, d);
  drawAtlasStrip(ov, ctx, z.strip, roles, d);
}

function drawAtlasList(ov, ctx, lz, roles, d) {
  const top = drawZoneRule(ctx, lz, t('cmdPages.atlas.listTitle', d.sysName), roles);
  const r = body(lz, top);
  const c = { x: r.x, y: r.y, w: r.w - 6 };
  kv(ctx, c, t('cmdPages.atlas.explored'), `${d.counts.explored} / ${d.counts.total}`, roles);
  kv(ctx, c, t('cmdPages.atlas.colonies'), d.counts.colonies, roles);
  c.y += 4;
  const lr = { x: r.x, y: c.y, w: r.w, h: r.y + r.h - c.y };
  ov._atlasVisibleH = lr.h;
  ov._contentBounds = lr;   // kółko przewija listę tylko nad nią (`handleScroll` → `_atlasScrollY`)
  if (!d.rows.length) { centerHint(ctx, lr, t('fleet.catalogNoBodiesInSystem'), roles); ov._atlasContentH = 0; return; }
  const hz = ov._kitHoverZone;
  const rows = d.rows.map((q) => ({ ...q, label: '' }));
  const res = drawList(ctx, lr, rows, roles, {
    selectedId: d.sel, hoverId: hz?.type === 'atlasSelect' ? hz.data?.bodyId : null, scroll: ov._atlasScrollY || 0, rowH: 30,
    renderRow: (cx, q, rr, { sel }) => {
      const ind = q.isMoon ? 12 : 0;
      cx.font = F(THEME.fontSizeSmall, sel);
      cx.fillStyle = q.explored ? roles.primary : roles.dim;
      const nm = `${q.isMoon ? '└ ' : ''}${q.name ?? '???'}${q.isHome ? ` · ${t('cmdPages.atlas.capital')}` : ''}`;
      cx.fillText(fit(cx, nm, rr.w - 16 - ind), rr.x + 6 + ind, rr.y + 10);
      cx.font = F(THEME.fontSizeSmall - 1);
      cx.fillStyle = roles.dim;
      const tp = t(q.type === 'planet' ? 'fleet.bodyTypePlanet' : q.type === 'moon' ? 'fleet.bodyTypeMoon' : 'fleet.bodyTypePlanetoid');
      cx.fillText(fit(cx, `${tp}${q.explored ? '' : ` · ${t('fleet.badgeUnexplored')}`}`, rr.w - 70 - ind), rr.x + 6 + ind, rr.y + 22);
      if (q.colony) { cx.fillStyle = roles.primary; cx.textAlign = 'right'; cx.fillText(t('cmdPages.atlas.colonyTag'), rr.x + rr.w - 6, rr.y + 22); cx.textAlign = 'left'; }
    },
  });
  ov._atlasScrollY = res.scroll;
  ov._atlasContentH = res.contentH;
  for (const zr of res.zones) push(ov, zr.x, zr.y, zr.w, zr.h, 'atlasSelect', { bodyId: zr.id });
}

function drawAtlasHero(ov, ctx, hz, roles, d) {
  const top = drawZoneRule(ctx, hz, t('cmdPages.atlas.heroTitle', d.sysName), roles);
  const r = body(hz, top);
  // legenda
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall - 1); ctx.textBaseline = 'middle'; ctx.fillStyle = roles.dim;
  ctx.fillText(fit(ctx, t('cmdPages.atlas.legend'), r.w), r.x, r.y + 6);
  ctx.restore();
  // orrery na całej wysokości bohatera (legenda w wolnym rogu nad okręgiem; zmiana właściciela: schemat ≈10% większy)
  const area = { x: r.x, y: r.y, w: r.w, h: r.h };
  if (!d.rows.length) { centerHint(ctx, area, t('fleet.catalogNoBodiesInSystem'), roles); return; }
  const bodies = d.entries.map((e) => ({ id: e.body.id, x: e.body.x, y: e.body.y, isMoon: !!e.isMoon, parentId: e.body.parentPlanetId ?? null }));
  const free = d.ships.filter((v) => v.position.state !== 'docked' && v.position.state !== 'orbiting');
  const L = orreryLayout(bodies, area, free.map((v) => ({ id: v.id, x: v.position.x, y: v.position.y })), { pad: ORRERY_PAD });
  const docked = new Map();
  for (const v of d.ships) if (v.position.state === 'docked' || v.position.state === 'orbiting') {
    const at = v.position.dockedAt; if (at) docked.set(at, (docked.get(at) ?? 0) + 1);
  }
  const rowById = new Map(d.rows.map((q) => [q.id, q]));
  ctx.save();
  ctx.textBaseline = 'middle';
  // orbity (dim) i gwiazda
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1; ctx.globalAlpha = 0.35;
  // orbity tylko planet (orbity planetoid zagracały schemat)
  for (const [id, p] of L.bodies) if (p.orbitR > 0 && rowById.get(id)?.type === 'planet') { ctx.beginPath(); ctx.arc(L.cx, L.cy, p.orbitR, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = roles.primary; ctx.beginPath(); ctx.arc(L.cx, L.cy, 5, 0, Math.PI * 2); ctx.fill();
  // ciała: zbadane = pełne (primary), niezbadane = kontur dim + „?” (mgła — bez nazwy); kolonia = pierścień; stolica = podpis
  const hov = ov._kitHoverZone?.type === 'atlasSelect' ? ov._kitHoverZone.data?.bodyId : null;
  for (const [id, p] of L.bodies) {
    const q = rowById.get(id); if (!q) continue;
    const rad = q.type === 'planet' ? 4 : q.type === 'moon' ? 2.5 : 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
    if (q.explored) { ctx.fillStyle = roles.primary; ctx.fill(); } else { ctx.strokeStyle = roles.dim; ctx.stroke(); }
    if (q.colony) { ctx.strokeStyle = roles.primary; ctx.beginPath(); ctx.arc(p.x, p.y, rad + 3, 0, Math.PI * 2); ctx.stroke(); }
    const n = docked.get(id);
    ctx.font = F(THEME.fontSizeSmall - 1);
    if (n) { ctx.fillStyle = roles.primary; ctx.fillText(`▲${n}`, p.x + rad + 4, p.y + 8); }
    if ((q.explored && !q.isMoon) || id === d.sel || id === hov) {   // podpis: zbadane ciała główne, wybrane, pod kursorem
      ctx.fillStyle = id === d.sel ? roles.primary : roles.dim;
      ctx.font = F(THEME.fontSizeSmall - 1, id === d.sel);
      ctx.fillText(fit(ctx, q.explored ? `${q.name}${q.isHome ? ' ◆' : ''}` : '?', 120), p.x + rad + 4, p.y - 7);
    }
    if (id === d.sel) drawSelectBrackets(ctx, { x: p.x - 9, y: p.y - 9, w: 18, h: 18 }, roles, { arm: 4 });
    push(ov, p.x - 8, p.y - 8, 16, 16, 'atlasSelect', { bodyId: id });
  }
  // statki gracza w locie
  ctx.fillStyle = roles.primary;
  for (const s of L.ships) { ctx.beginPath(); ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x + 3.5, s.y + 3); ctx.lineTo(s.x - 3.5, s.y + 3); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

function drawAtlasInspector(ov, ctx, iz, roles, d) {
  const top = drawZoneRule(ctx, iz, t('cmdConsole.inspTitle'), roles);
  const r = body(iz, top);
  ov._atlasKitRects = { insp: r };
  const b = d.sel ? d.entries.find((e) => e.body.id === d.sel)?.body : null;
  if (!b) { centerHint(ctx, r, t('cmdPages.atlas.selectHint'), roles); return; }
  const f = ov._atlasBodyFacts(b);
  // przewijanie (pełna lista złóż bywa długa): nowe ciało = widok od góry
  if (ov._atlasInspKey !== b.id) { ov._atlasInspKey = b.id; ov._atlasInspScrollY = 0; }
  const sc = ov._atlasInspScrollY || 0;
  const hz0 = ov._hitZones.length, dis0 = ov._cmdDisabled.length;
  const c = { x: r.x, y: r.y - sc, w: r.w - 6 };
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x - 2, r.y, r.w + 4, r.h); ctx.clip();
  line(ctx, c, f.explored ? f.name : '???', roles, { bold: true, size: 13 });
  line(ctx, c, f.explored ? `${t(f.typeKey)} · ${f.subType}${f.tempC != null ? ` · ${f.tempC}°C` : ''}` : `${t(f.typeKey)} · ${t('fleet.badgeUnexplored')}`,
    roles, { tone: 'dim' });
  if (f.isHome) line(ctx, c, `● ${t('cmdPages.atlas.capital')}`, roles, { tone: 'primary' });
  // akcje u góry — osiągalne bez przewijania długiej listy złóż
  eyebrow(ctx, c, t('cmdInsp.actions'), roles);
  pageChips(ov, ctx, c, atlasActions({ bodyId: b.id, explored: f.explored, configSelect: ov._missionConfig?.step === 'select', redirect: f.redirect }), roles, 1);
  eyebrow(ctx, c, t('cmdPages.atlas.orbit'), roles);
  kv(ctx, c, t('cmdPages.atlas.orbitA'), `${f.orbitAU.toFixed(2)} AU`, roles);
  kv(ctx, c, t('cmdPages.atlas.distHome'), `${f.distHomeAU.toFixed(1)} AU`, roles);
  const here = d.ships.filter((v) => v.position.dockedAt === b.id && (v.position.state === 'docked' || v.position.state === 'orbiting')).length;
  kv(ctx, c, t('cmdPages.atlas.shipsHere'), here, roles, here ? 'primary' : 'dim');
  if (f.explored) {
    eyebrow(ctx, c, t('cmdPages.atlas.colony'), roles);
    if (f.colony) kv(ctx, c, f.colony.outpost ? t('cmdPages.atlas.outpost') : f.colony.name, `${f.colony.pop} POP`, roles);
    else line(ctx, c, t('cmdPages.atlas.noColony'), roles, { tone: 'dim' });
    // WSZYSTKIE złoża ciała (zmiana właściciela na bramce K7-C; dziś wiersz pokazuje 3 najbogatsze)
    eyebrow(ctx, c, t('cmdPages.atlas.depositsAll', f.deposits.length), roles);
    if (!f.deposits.length) line(ctx, c, t('cmdPages.atlas.noDeposits'), roles, { tone: 'dim' });
    for (const dp of f.deposits) kv(ctx, c, dp.name, `${'★'.repeat(dp.stars)}${dp.remaining != null ? ` · ${fmtAmount(dp.remaining)}` : ''}`, roles);
  } else {
    eyebrow(ctx, c, t('cmdPages.enemy.unknown'), roles);
    ctx.font = F(THEME.fontSizeSmall - 1);
    for (const ln of ov._wrapTextWidth(ctx, t('cmdPages.atlas.unexploredHint'), c.w)) line(ctx, c, ln, roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
  }
  ctx.restore();
  const contentH = c.y + sc - r.y + 6;
  ov._atlasInspContentH = contentH; ov._atlasInspViewH = r.h;
  const maxS = Math.max(0, contentH - r.h);
  if (ov._atlasInspScrollY > maxS) ov._atlasInspScrollY = maxS;
  ov._clipRightHitZones(hz0, r.y, r.h);
  const keep = ov._cmdDisabled.slice(dis0).filter((q) => q.rect.y + q.rect.h > r.y && q.rect.y < r.y + r.h);
  ov._cmdDisabled.length = dis0; ov._cmdDisabled.push(...keep);
  if (maxS > 0) {
    const th = Math.max(16, r.h * r.h / contentH), ty = r.y + (r.h - th) * (Math.min(sc, maxS) / maxS);
    ctx.save();
    ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(r.x + r.w - CONSOLE_KIT.SCROLLBAR_W, r.y, CONSOLE_KIT.SCROLLBAR_W, r.h);
    ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(r.x + r.w - CONSOLE_KIT.SCROLLBAR_W, ty, CONSOLE_KIT.SCROLLBAR_W, th);
    ctx.restore();
  }
}
const fmtAmount = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`);

function drawAtlasStrip(ov, ctx, sz, roles, d) {
  if (!sz || sz.h <= 0) return;
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  const inFlight = d.ships.filter((v) => v.position.state !== 'docked' && v.position.state !== 'orbiting').length;
  const txt = ov._missionConfig?.step === 'select' ? t('cmdPages.atlas.stripConfig')
    : t('cmdPages.atlas.strip', d.counts.total, d.counts.explored, d.counts.colonies, d.ships.length, inFlight);
  ctx.fillStyle = ov._missionConfig?.step === 'select' ? roles.primary : roles.dim;
  ctx.fillText(fit(ctx, txt, sz.w - 8), sz.x + 4, sz.y + sz.h / 2);
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LOGISTYKA — lista = kreator + zlecenia; bohater = schemat tras między koloniami; inspektor = kreator albo zlecenie;
// pas = statki w trasie. Strefy `logi_*` — dzisiejsze typy i dane.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

export function drawLogisticsPage(ov, ctx, z, roles, colMgr) {
  const f = ov._logiFacts(colMgr);
  const sel = logiSelection(ov._logiSelectedOrderId, f.orders);
  ov._logiSelectedOrderId = sel;
  ov._logiKitRects = {};
  drawLogiList(ov, ctx, z.list, roles, f, sel);
  drawLogiHero(ov, ctx, z.hero, roles, f, sel);
  drawLogiInspector(ov, ctx, z.inspector, roles, f, sel);
  drawLogiStrip(ov, ctx, z.strip, roles, f);
}

function drawLogiList(ov, ctx, lz, roles, f, sel) {
  const top = drawZoneRule(ctx, lz, t('cmdPages.logi.listTitle', f.orders.length), roles);
  const r = body(lz, top);
  const c = { x: r.x, y: r.y, w: r.w - 6 };
  kv(ctx, c, t('cmdPages.logi.pool'), f.pool, roles, f.pool > 0 ? 'primary' : 'alert');
  c.y += 4;
  const lr = { x: r.x, y: c.y, w: r.w, h: r.y + r.h - c.y };
  ov._logiKitRects.list = lr;
  const hz = ov._kitHoverZone;
  const rows = [{ id: 'new', label: '' }, ...f.orders.map((o) => ({ id: o.id, label: '', o }))];
  const res = drawList(ctx, lr, rows, roles, {
    selectedId: sel, hoverId: hz?.type === 'logiSelect' ? hz.data?.orderId : null, scroll: ov._logiOrdersScrollY || 0, rowH: 30,
    renderRow: (cx, q, rr, { sel: s }) => {
      cx.textBaseline = 'middle';
      if (q.id === 'new') {
        cx.font = F(THEME.fontSizeSmall, s); cx.fillStyle = roles.primary;
        cx.fillText(fit(cx, `＋ ${t('transportOrder.newOrder')}`, rr.w - 12), rr.x + 6, rr.y + rr.h / 2);
        return;
      }
      const o = q.o, p = orderProgress(o), al = orderAlert(o, f.pool);
      cx.font = F(THEME.fontSizeSmall, s); cx.fillStyle = roles.primary;
      cx.fillText(fit(cx, `#${o.id} ${o.cross ? '⚡ ' : ''}${o.fromName} → ${o.toName}`, rr.w - 50), rr.x + 6, rr.y + 10);
      cx.textAlign = 'right'; cx.fillStyle = roles.dim;
      cx.fillText(`${Math.round(p.frac * 100)}%`, rr.x + rr.w - 6, rr.y + 10);
      cx.textAlign = 'left';
      cx.font = F(THEME.fontSizeSmall - 1); cx.fillStyle = al ? roles.alert : roles.dim;
      cx.fillText(fit(cx, al ? t(al.key) : t('cmdPages.logi.rowShips', o.assigns.length, o.goods.length), rr.w - 12), rr.x + 6, rr.y + 22);
    },
  });
  ov._logiOrdersScrollY = res.scroll;
  ov._logiOrdersContentH = res.contentH;
  ov._logiOrdersViewH = lr.h;
  for (const zr of res.zones) push(ov, zr.x, zr.y, zr.w, zr.h, 'logiSelect', { orderId: zr.id });
}

function drawLogiHero(ov, ctx, hz, roles, f, sel) {
  const top = drawZoneRule(ctx, hz, t('cmdPages.logi.heroTitle'), roles);
  const r = body(hz, top);
  if (!f.cols.length) { centerHint(ctx, r, t('cmdPages.logi.noColonies'), roles); return; }
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall - 1); ctx.textBaseline = 'middle'; ctx.fillStyle = roles.dim;
  ctx.fillText(fit(ctx, t('cmdPages.logi.legend'), r.w), r.x, r.y + 6);
  const area = { x: r.x, y: r.y + 16, w: r.w, h: r.h - 16 };
  const N = logiNodes(f.cols, area);
  const selO = f.orders.find((o) => o.id === sel) ?? null;
  // trasy (zlecenia): linia źródło → cel; wybrane primary pogrubione, wąskie gardło alert, skok między układami przerywany
  f.orders.forEach((o, i) => {
    const a = N.get(o.fromId), b = N.get(o.toId);
    if (!a || !b) return;
    const al = orderAlert(o, f.pool);
    const isSel = o.id === sel;
    const off = (i % 3 - 1) * 4;   // równoległe zlecenia na tej samej parze — lekko rozsunięte
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.max(1, Math.hypot(dx, dy)), nx = -dy / len * off, ny = dx / len * off;
    ctx.strokeStyle = al ? roles.alert : roles.primary;
    ctx.globalAlpha = isSel ? 1 : 0.55;
    ctx.lineWidth = isSel ? 2 : 1;
    ctx.setLineDash(o.cross ? [5, 4] : []);
    ctx.beginPath(); ctx.moveTo(a.x + nx, a.y + ny); ctx.lineTo(b.x + nx, b.y + ny); ctx.stroke();
    ctx.setLineDash([]);
    // grot + postęp (znacznik na odcinku = część dostarczona)
    const p = orderProgress(o).frac;
    const ex = b.x + nx - dx / len * 12, ey = b.y + ny - dy / len * 12;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath(); ctx.moveTo(ex + dx / len * 6, ey + dy / len * 6); ctx.lineTo(ex - dy / len * 4, ey + dx / len * 4); ctx.lineTo(ex + dy / len * 4, ey - dx / len * 4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(a.x + nx + dx * p, a.y + ny + dy * p, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
    push(ov, a.x + dx / 2 + nx - 10, a.y + dy / 2 + ny - 10, 20, 20, 'logiSelect', { orderId: o.id });   // klik środka trasy = wybór zlecenia
  });
  // węzły kolonii: końce wybranego zlecenia w roli primary z nawiasami
  for (const c of f.cols) {
    const p = N.get(c.id); if (!p) continue;
    const end = selO && (selO.fromId === c.id || selO.toId === c.id);
    ctx.fillStyle = end ? roles.primary : roles.dim;
    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.font = F(THEME.fontSizeSmall - 1, !!end);
    ctx.textAlign = p.x < area.x + area.w / 2 - 4 ? 'right' : 'left';
    ctx.fillText(fit(ctx, c.name, 130), p.x + (ctx.textAlign === 'right' ? -8 : 8), p.y - 6);
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, c.sysName, 130), p.x + (ctx.textAlign === 'right' ? -8 : 8), p.y + 7);
    ctx.textAlign = 'left';
    if (end) drawSelectBrackets(ctx, { x: p.x - 8, y: p.y - 8, w: 16, h: 16 }, roles, { arm: 4 });
  }
  if (!f.orders.length) { ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.fillText(t('cmdPages.logi.noneActive'), area.x + area.w / 2, area.y + area.h - 10); }
  ctx.restore();
}

function drawLogiInspector(ov, ctx, iz, roles, f, sel) {
  const top = drawZoneRule(ctx, iz, t('cmdConsole.inspTitle'), roles);
  const r = body(iz, top);
  ov._logiKitRects.insp = r;
  if (sel === 'new') { drawLogiBuilderKit(ov, ctx, r, roles, f); return; }
  const o = f.orders.find((q) => q.id === sel);
  if (!o) return;
  const c = { x: r.x, y: r.y, w: r.w - 6 };
  ctx.save();
  line(ctx, c, `#${o.id} ${o.fromName} → ${o.toName}`, roles, { bold: true, size: 13 });
  line(ctx, c, `${o.cross ? `⚡ ${t('cmdPages.logi.cross')}` : t('cmdPages.logi.local')} · ${t('cmdPages.logi.fifo', o.fifo)}`, roles, { tone: 'dim' });
  const al = orderAlert(o, f.pool);
  if (al) line(ctx, c, `⚠ ${t(al.key)}`, roles, { tone: 'alert' });
  eyebrow(ctx, c, t('transportOrder.goodsHeader'), roles);
  for (const g of o.goods) {
    const frac = g.total > 0 ? Math.min(1, g.done / g.total) : 0;
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    ctx.fillStyle = roles.primary; ctx.fillText(fit(ctx, `${g.icon} ${g.name}`, c.w * 0.6), c.x, c.y + 7);
    ctx.textAlign = 'right'; ctx.fillText(`${g.done} / ${g.total}`, c.x + c.w, c.y + 7); ctx.textAlign = 'left';
    drawBar(ctx, c.x, c.y + 16, c.w, frac, roles, { tone: 'primary' });
    c.y += 24;
  }
  eyebrow(ctx, c, t('cmdPages.logi.ships', o.assigns.length), roles);
  if (!o.assigns.length) line(ctx, c, t(f.pool > 0 ? 'cmdPages.logi.alertQueued' : 'cmdPages.logi.alertNoPool'), roles, { tone: 'dim' });
  for (const a of o.assigns) kv(ctx, c, a.name, t(a.phaseKey), roles, a.phase === 'waiting' ? 'alert' : a.phase === 'hauling' || a.warping ? 'primary' : 'dim');
  eyebrow(ctx, c, t('cmdInsp.actions'), roles);
  pageChips(ov, ctx, c, [{ labelKey: 'cmdPages.logi.cancelOrder', danger: true, zone: { type: 'logi_cancel', data: { orderId: o.id } } }], roles, 1);
  ctx.restore();
}

/** Kreator nowego zlecenia w strefie inspektora (przewijany `_logiBuilderScrollY`); drop-down nad treścią strefy. */
function drawLogiBuilderKit(ov, ctx, r, roles, f) {
  const mx = ov._regMouseX, my = ov._regMouseY;
  // przycisk „Utwórz” przypięty do dołu strefy (zawsze widoczny), reszta przewijana nad nim
  const btnY = r.y + r.h - CONSOLE_KIT.CHIP_H - 2;
  const view = { x: r.x, y: r.y, w: r.w, h: Math.max(0, btnY - 6 - r.y) };
  const maxPrev = Math.max(0, (ov._logiBuilderContentH || 0) - view.h);
  ov._logiBuilderScrollY = Math.max(0, Math.min(maxPrev, ov._logiBuilderScrollY || 0));
  const sc = ov._logiBuilderScrollY;
  const hz0 = ov._hitZones.length;
  const c = { x: r.x, y: r.y - sc, w: r.w - 6 };
  ctx.save();
  ctx.beginPath(); ctx.rect(view.x - 2, view.y, view.w + 4, view.h); ctx.clip();
  eyebrow(ctx, c, t('transportOrder.newOrder'), roles, 'primary');
  const colLabel = (id) => { const q = f.cols.find((x) => x.id === id); return q ? `${q.name} · ${q.sysName}` : t('transportOrder.pickColony'); };
  // skąd / dokąd — dzisiejsze przełączniki drop-downów
  for (const [lbl, id, type] of [[t('transportOrder.from'), f.from, 'logi_from_dropdown_toggle'], [t('transportOrder.to'), f.to, 'logi_to_dropdown_toggle']]) {
    line(ctx, c, lbl, roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
    pageChips(ov, ctx, c, [{ text: `${colLabel(id)} ▾`, zone: { type, data: {} } }], roles, 1);
  }
  // towary: dodaj (drop-down) + wiersze nazwa · zapas · [−] ilość [+] [✕]
  line(ctx, c, t('transportOrder.goodsHeader'), roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
  pageChips(ov, ctx, c, [{ text: `${t('transportOrder.addGood')} ▾`, zone: { type: 'logi_good_dropdown_toggle', data: {} } }], roles, 1);
  if (!f.selected.length) line(ctx, c, t('transportOrder.noGoodsSelected'), roles, { tone: 'dim' });
  const BW = 22, QW = 46, RH = CONSOLE_KIT.CHIP_H;
  for (const g of f.selected) {
    const rmX = c.x + c.w - BW, incX = rmX - 4 - BW, qtyX = incX - 4 - QW, decX = qtyX - 4 - BW;
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
    ctx.fillStyle = roles.primary;
    ctx.fillText(fit(ctx, `${g.icon} ${g.name}`, decX - c.x - 6), c.x, c.y + RH / 2 - 5);
    ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = g.inStock >= g.qty ? roles.dim : roles.alert;
    ctx.fillText(fit(ctx, t('transportOrder.inStock', g.inStock), decX - c.x - 6), c.x, c.y + RH / 2 + 6);
    const mini = (x, w, label, type, data) => {
      const rr = { x, y: c.y, w, h: RH };
      drawActionChip(ctx, x - CONSOLE_KIT.CHIP_PAD_X + 2, c.y, w + CONSOLE_KIT.CHIP_PAD_X, roles, { label, hover: inside(rr, mx, my) });
      push(ov, x, c.y, w, RH, type, data);
    };
    mini(decX, BW, '−', 'logi_good_dec', { goodId: g.id });
    // pole ilości: klik = DOM <input> z TEGO prostokąta (boxW/boxH — konsola), tekst w ramce 1 px
    ctx.strokeStyle = inside({ x: qtyX, y: c.y, w: QW, h: RH }, mx, my) ? roles.primary : roles.dim;
    ctx.strokeRect(qtyX + 0.5, c.y + 0.5, QW - 1, RH - 1);
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.primary; ctx.textAlign = 'center';
    ctx.fillText(String(g.qty), qtyX + QW / 2, c.y + RH / 2); ctx.textAlign = 'left';
    push(ov, qtyX, c.y, QW, RH, 'logi_good_qty_input', { goodId: g.id, boxCanvasX: qtyX, boxCanvasY: c.y, boxW: QW, boxH: RH });
    mini(incX, BW, '+', 'logi_good_inc', { goodId: g.id });
    mini(rmX, BW, '✕', 'logi_good_remove', { goodId: g.id });
    c.y += RH + 6;
  }
  ctx.restore();
  ov._logiBuilderContentH = c.y + sc - r.y;
  ov._logiBuilderViewH = view.h;
  ov._clipRightHitZones(hz0, view.y, view.h);
  // „Utwórz” — czip główny; niemożliwe = wyłączony z powodem (czego brakuje)
  const cb = { x: r.x, y: btnY, w: r.w - 6 };
  pageChips(ov, ctx, cb, [{ labelKey: 'transportOrder.createBtn', labelArgs: [f.totalGoods],
    zone: f.canCreate ? { type: 'logi_create', data: {} } : null, reasonKey: f.createReason }], roles, 1);
  // drop-downy nad treścią strefy (jak dziś: nad builderem; strefy na końcu = priorytet)
  if (ov._logiColDropdown) drawLogiColDropdownKit(ov, ctx, view, roles, f);
  else if (ov._logiGoodDropdownOpen) drawLogiGoodDropdownKit(ov, ctx, view, roles, f);
  else { ov._logiDropdownRect = null; ov._logiColDropdownRect = null; }
}

function dropdownFrame(ov, ctx, view, roles, title, bgType, closeType) {
  const p = { x: view.x, y: view.y, w: view.w - 6, h: view.h };
  drawConsoleBackground(ctx, p);
  drawZoneFrame(ctx, p, roles, { tone: 'primary' });
  push(ov, p.x, p.y, p.w, p.h, bgType, {});
  ctx.font = F(THEME.fontSizeSmall, true); ctx.fillStyle = roles.primary; ctx.textBaseline = 'middle';
  ctx.fillText(fit(ctx, title, p.w - 40), p.x + 6, p.y + 11);
  const cl = { x: p.x + p.w - 24, y: p.y, w: 24, h: 22 };
  ctx.fillStyle = inside(cl, ov._regMouseX, ov._regMouseY) ? roles.primary : roles.dim;
  ctx.fillText('[x]', cl.x + 2, cl.y + 11);
  push(ov, cl.x, cl.y, cl.w, cl.h, closeType, {});
  return { x: p.x + 2, y: p.y + 24, w: p.w - 4, h: p.h - 26 };
}

function drawLogiColDropdownKit(ov, ctx, view, roles, f) {
  const which = ov._logiColDropdown;
  const selId = which === 'from' ? f.from : f.to;
  const oppId = which === 'from' ? f.to : f.from;
  const lr = dropdownFrame(ov, ctx, view, roles, t(which === 'from' ? 'transportOrder.pickSource' : 'transportOrder.pickTarget'), 'logi_col_dropdown_bg', 'logi_col_dropdown_close');
  ov._logiColDropdownRect = { ...view }; ov._logiDropdownRect = null;
  const rows = f.cols.map((q) => ({ id: q.id, label: `${q.id === selId ? '● ' : q.id === oppId ? '· ' : '○ '}${q.name}`, value: q.sysName, dimmed: q.id === oppId }));
  const hz = ov._kitHoverZone;
  const res = drawList(ctx, lr, rows, roles, { selectedId: selId, hoverId: hz?.type === 'logi_col_pick' ? hz.data?.colonyId : null, scroll: ov._logiColDropdownScrollY || 0 });
  ov._logiColDropdownScrollY = res.scroll; ov._logiColDropdownContentH = res.contentH; ov._logiColDropdownViewH = lr.h;
  for (const zr of res.zones) {
    if (zr.id === oppId) ov._cmdDisabled.push({ rect: zr, reasonKey: 'cmdPages.logi.reasonOpposite', args: [] });   // przeciwny koniec — dziś bez strefy
    else push(ov, zr.x, zr.y, zr.w, zr.h, 'logi_col_pick', { which, colonyId: zr.id });
  }
}

function drawLogiGoodDropdownKit(ov, ctx, view, roles, f) {
  const lr = dropdownFrame(ov, ctx, view, roles, t('transportOrder.pickGood'), 'logi_dropdown_bg', 'logi_dropdown_close');
  ov._logiDropdownRect = { ...view }; ov._logiColDropdownRect = null;
  const rows = f.catalog.map((g) => ({ id: g.id, label: `${g.icon} ${g.name}`, value: g.amt > 0 ? String(g.amt) : '', tone: g.already ? 'primary' : 'dim' }));
  const hz = ov._kitHoverZone;
  const res = drawList(ctx, lr, rows, roles, { hoverId: hz?.type === 'logi_good_pick' ? hz.data?.goodId : null, scroll: ov._logiGoodDropdownScrollY || 0 });
  ov._logiGoodDropdownScrollY = res.scroll; ov._logiDropdownContentH = res.contentH; ov._logiDropdownViewH = lr.h;
  for (const zr of res.zones) push(ov, zr.x, zr.y, zr.w, zr.h, 'logi_good_pick', { goodId: zr.id });
}

function drawLogiStrip(ov, ctx, sz, roles, f) {
  if (!sz || sz.h <= 0) return;
  ctx.save();
  ctx.textBaseline = 'middle';
  drawEyebrow(ctx, sz.x, sz.y, sz.w, t('cmdPages.logi.stripTitle'), roles);
  const moving = f.orders.flatMap((o) => o.assigns.map((a) => ({ ...a, route: `#${o.id} ${o.fromName} → ${o.toName}` })));
  const y = sz.y + CONSOLE_KIT.EYEBROW_H + 10;
  ctx.font = F(THEME.fontSizeSmall);
  if (!moving.length) { ctx.fillStyle = roles.dim; ctx.fillText(fit(ctx, t('cmdPages.logi.stripEmpty'), sz.w - 8), sz.x + 4, y); ctx.restore(); return; }
  let x = sz.x + 4;
  for (const a of moving) {
    const txt = `${a.name} · ${t(a.phaseKey)} · ${a.route}`;
    const w = Math.min(ctx.measureText(txt).width, 320);
    if (x + w > sz.x + sz.w - 40) { ctx.fillStyle = roles.dim; ctx.fillText(t('cmdPages.logi.stripMore', moving.length), x, y); break; }
    ctx.fillStyle = a.phase === 'waiting' ? roles.alert : a.phase === 'hauling' || a.warping ? roles.primary : roles.dim;
    ctx.fillText(fit(ctx, txt, w), x, y);
    x += w + 18;
  }
  ctx.restore();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// JEDNOSTKI (Naziemne) — lista = kolonie z licznikami (kolonia strony, lokalna); bohater = jednostki kolonii + kafle
// archetypów; inspektor = wybrany archetyp (statystyki, koszt, [ REKRUTUJ ]) albo wybrana jednostka; pas = kolejka koszar.
// Strefy `ground:select_tile` / `ground:recruit` — dzisiejsze typy i dane (dyspozycja przez edytor projektów).
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

const archName = (id) => {
  const o = HUMANITY_UNITS[id] ?? {}, a = UNIT_ARCHETYPES[id] ?? {};
  const en = getLocale() === 'en';
  const own = en ? (o.nameEN ?? o.name) : (o.namePL ?? o.name);
  if (own) return own;
  const k = `unit.${id}.name`, v = t(k);   // archetyp bez nadpisania frakcji (np. zaopatrzenie) — nazwa z i18n
  return v !== k ? v : t('cmdPages.ground.unnamedArch');
};
/** Linia zawijana (powód, opis) — nie ucina tekstu w wąskiej strefie. */
function wrappedLine(ov, ctx, c, text, roles, tone = 'dim') {
  ctx.font = F(THEME.fontSizeSmall - 1);
  for (const ln of ov._wrapTextWidth(ctx, text, c.w)) line(ctx, c, ln, roles, { tone, size: THEME.fontSizeSmall - 1 });
}

export function drawGroundPage(ov, ctx, z, roles) {
  const f = ov._groundFacts();
  if (ov._groundSelUnitId && !f.units.some((u) => u.id === ov._groundSelUnitId)) ov._groundSelUnitId = null;
  drawGroundList(ov, ctx, z.list, roles, f);
  drawGroundHero(ov, ctx, z.hero, roles, f);
  drawGroundInspector(ov, ctx, z.inspector, roles, f);
  drawGroundStrip(ov, ctx, z.strip, roles, f);
}

function drawGroundList(ov, ctx, lz, roles, f) {
  const top = drawZoneRule(ctx, lz, t('cmdPages.ground.listTitle'), roles);
  const r = body(lz, top);
  ov._groundKitRects = { list: r };
  if (!f.colonies.length) { centerHint(ctx, r, t('cmdPages.ground.noColonies'), roles); return; }
  const hz = ov._kitHoverZone;
  const rows = f.colonies.map((c) => ({ id: c.id, label: '', c }));
  const res = drawList(ctx, r, rows, roles, {
    selectedId: f.local?.id ?? null, hoverId: hz?.type === 'groundColony' ? hz.data?.colonyId : null, rowH: 30,
    renderRow: (cx, q, rr, { sel }) => {
      cx.textBaseline = 'middle';
      cx.font = F(THEME.fontSizeSmall, sel); cx.fillStyle = q.c.outpost ? roles.dim : roles.primary;
      cx.fillText(fit(cx, q.c.name, rr.w - 60), rr.x + 6, rr.y + 10);
      cx.textAlign = 'right'; cx.fillStyle = q.c.units ? roles.primary : roles.dim;
      cx.fillText(String(q.c.units), rr.x + rr.w - 6, rr.y + 10); cx.textAlign = 'left';
      cx.font = F(THEME.fontSizeSmall - 1); cx.fillStyle = roles.dim;
      cx.fillText(fit(cx, `${q.c.outpost ? t('cmdPages.atlas.outpost') : t('cmdPages.ground.colony')} · ${t('cmdPages.ground.rowUnits', q.c.units, q.c.queue)}`, rr.w - 12), rr.x + 6, rr.y + 22);
    },
  });
  for (const zr of res.zones) push(ov, zr.x, zr.y, zr.w, zr.h, 'groundColony', { colonyId: zr.id });
}

function drawGroundHero(ov, ctx, hz, roles, f) {
  const top = drawZoneRule(ctx, hz, t('cmdPages.ground.heroTitle', f.local?.name ?? '—'), roles);
  const r = body(hz, top);
  const mx = ov._regMouseX, my = ov._regMouseY;
  ctx.save();
  ctx.textBaseline = 'middle';
  // tabela jednostek kolonii (u góry, tyle wierszy ile trzeba), pod nią siatka kafli archetypów (miniatury ≈2× — uwaga
  // właściciela po bramce K7-C) wypełniająca resztę bohatera; tabela oddaje miejsce kaflom, nie odwrotnie
  const RH = GROUND_ROW_H;
  const n = Math.max(1, f.archs.length), gap = 8;
  const gcols = Math.max(1, Math.min(n, Math.floor((r.w + gap) / (GROUND_TILE_MIN_W + gap))));
  const grows = Math.ceil(n / gcols);
  const tileH = GROUND_ART + 32;
  const tilesH = CONSOLE_KIT.EYEBROW_H + 4 + grows * (tileH + gap);
  const tableNeed = 16 + Math.max(1, f.units.length) * RH + 8;
  const tr = { x: r.x, y: r.y, w: r.w, h: Math.max(16 + RH + 8, Math.min(tableNeed, r.h - tilesH - 8)) };
  const cols = [['name', 0.34], ['hp', 0.16], ['org', 0.14], ['morale', 0.14], ['status', 0.22]];
  let x = tr.x;
  ctx.font = F(THEME.fontSizeSmall - 1); ctx.fillStyle = roles.dim;
  const colX = {};
  for (const [id, wf] of cols) { colX[id] = x; ctx.fillText(t(`cmdPages.ground.col.${id}`).toUpperCase(), x + 4, tr.y + 7); x += tr.w * wf; }
  let y = tr.y + 16;
  if (!f.units.length) {
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, t('cmdPages.ground.noUnits'), tr.w - 8), tr.x + 4, y + 12);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(tr.x, y, tr.w, tr.y + tr.h - y); ctx.clip();
  for (const u of f.units) {
    if (y + RH > tr.y + tr.h) break;
    const row = { x: tr.x, y, w: tr.w, h: RH };
    const sel = u.id === ov._groundSelUnitId;
    if (inside(row, mx, my) && !sel) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(row.x, row.y, row.w, row.h); ctx.globalAlpha = 1; }
    ctx.font = F(THEME.fontSizeSmall, sel);
    const lowHp = u.hpMax > 0 && u.hp / u.hpMax < 0.35;
    const cell = (id, txt, tone = 'primary') => { ctx.fillStyle = roles[tone] ?? roles.primary; ctx.fillText(fit(ctx, txt, tr.w * cols.find((q) => q[0] === id)[1] - 8), colX[id] + 4, y + RH / 2); };
    // ikona: miniatura modelu właściciela (wysokość wiersza), glif tylko gdy zasobu brak
    const art = unitArt(ov, u.archId);
    if (art) ctx.drawImage(art, colX.name + 2, y + 1, RH - 2, RH - 2);
    else { ctx.fillStyle = roles.primary; ctx.fillText(ARCHETYPE_ICONS[u.archId] ?? '•', colX.name + 4, y + RH / 2); }
    ctx.save(); ctx.translate(RH, 0);
    cell('name', u.name ?? archName(u.archId));
    ctx.restore();
    cell('hp', `${Math.round(u.hp)}/${Math.round(u.hpMax)}`, lowHp ? 'alert' : 'primary');
    cell('org', u.org == null ? '—' : `${Math.round(u.org)}/${Math.round(u.maxOrg ?? u.org)}`, 'dim');
    cell('morale', u.morale == null ? '—' : `${Math.round(u.morale)}`, 'dim');
    cell('status', t(`cmdPages.ground.status.${STATUS_KEYS.has(u.status) ? u.status : 'other'}`), u.status === 'offline' ? 'alert' : 'dim');
    if (sel) drawSelectBrackets(ctx, row, roles);
    push(ov, row.x, row.y, row.w, row.h, 'groundUnit', { unitId: u.id });
    y += RH;
  }
  ctx.restore();
  // kafle archetypów — dzisiejsze strefy `ground:select_tile` (także zablokowane: wybór pokazuje, czego brakuje)
  const ty = tr.y + tr.h + 8;   // siatka zaraz pod tabelą (wykorzystuje puste miejsce bohatera)
  drawEyebrow(ctx, r.x, ty, r.w, t('cmdPages.ground.recruitTitle', f.local?.name ?? '—'), roles);
  const tw = Math.floor((r.w - gap * (gcols - 1)) / gcols), th = tileH;
  f.archs.forEach((a, i) => {
    const rect = { x: r.x + (i % gcols) * (tw + gap), y: ty + CONSOLE_KIT.EYEBROW_H + 4 + Math.floor(i / gcols) * (tileH + gap), w: tw, h: th };
    const sel = !ov._groundSelUnitId && a.id === f.archId;
    const hov = inside(rect, mx, my);
    if (hov && !sel) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); ctx.globalAlpha = 1; }
    ctx.textAlign = 'center';
    // miniatura modelu (GLB → offscreen, renderowana raz i cache'owana przez fabrykę jednostek); zablokowany = przygaszony
    const artSz = Math.max(16, Math.min(GROUND_ART, rect.w - 8, rect.h - 32));
    const art = unitArt(ov, a.id);
    if (art) {
      ctx.globalAlpha = a.unlocked ? 1 : LOCKED_ART_ALPHA;
      ctx.drawImage(art, rect.x + (rect.w - artSz) / 2, rect.y + 2, artSz, artSz);
      ctx.globalAlpha = 1;
    } else {
      ctx.font = F(16); ctx.fillStyle = a.unlocked ? roles.primary : roles.dim;
      ctx.fillText(a.icon || '•', rect.x + rect.w / 2, rect.y + 2 + artSz / 2);
    }
    ctx.font = F(THEME.fontSizeSmall - 1, sel); ctx.fillStyle = a.unlocked ? roles.primary : roles.dim;
    ctx.fillText(fit(ctx, archName(a.id), rect.w - 4), rect.x + rect.w / 2, rect.y + artSz + 12);
    ctx.fillStyle = roles.dim;
    ctx.fillText(fit(ctx, a.unlocked ? t(`groundPanel.role.${a.role}`) : `🔒 ${t('cmdPages.ground.locked')}`, rect.w - 4), rect.x + rect.w / 2, rect.y + artSz + 25);
    ctx.textAlign = 'left';
    if (sel) drawSelectBrackets(ctx, rect, roles);
    push(ov, rect.x, rect.y, rect.w, rect.h, 'ground:select_tile', { archetypeId: a.id });
  });
  ctx.restore();
}
/**
 * Miniatura modelu jednostki właściciela: obraz z cache panelu rekrutacji (`GroundUnitPanel._ensureSprite` →
 * `GroundUnitFactory.loadUnitSprite`: GLB → offscreen, raz). Gotowa (`glb` / `png`) → obraz; brak zasobu → null (glif).
 * Wczytywanie → null + odświeżenie UI, aż miniatura przyjdzie.
 */
function unitArt(ov, archId) {
  const img = ov._groundSprite(archId);
  const st = img?._kosmosAsset;
  if ((st === 'glb' || st === 'png') && img.complete !== false) return img;
  if (st === 'loading' && window.KOSMOS?.uiManager) window.KOSMOS.uiManager._dirty = true;
  return null;
}
/** Nagłówek inspektora: miniatura modelu (glif, gdy zasobu brak) + nazwa. */
function artTitle(ov, ctx, c, archId, name, roles) {
  const art = unitArt(ov, archId);
  const S = 28;
  if (art) {
    ctx.drawImage(art, c.x, c.y, S, S);
    const cc = { x: c.x + S + 6, y: c.y + (S - LINE_H) / 2, w: c.w - S - 6 };
    line(ctx, cc, name, roles, { bold: true, size: 13 });
    c.y += S + 2;
  } else line(ctx, c, `${ARCHETYPE_ICONS[archId] ?? ''} ${name}`, roles, { bold: true, size: 13 });
}
const LOCKED_ART_ALPHA = 0.6;
const GROUND_ART = 96;          // miniatura modelu na kaflu (px log.; źródło 256 px — ostra)
const GROUND_TILE_MIN_W = 112;  // najwęższy kafel siatki (miniatura + margines na nazwę)
const GROUND_ROW_H = 28;        // wiersz tabeli jednostek z ikoną modelu   // zablokowany archetyp: model czytelny, kłódka + powód obok
const STATUS_KEYS = new Set(['idle', 'moving', 'scanning', 'in_cargo', 'offline']);

function drawGroundInspector(ov, ctx, iz, roles, f) {
  const top = drawZoneRule(ctx, iz, t('cmdConsole.inspTitle'), roles);
  const r = body(iz, top);
  const c = { x: r.x, y: r.y, w: r.w - 6 };
  ctx.save();
  const u = ov._groundSelUnitId ? f.units.find((q) => q.id === ov._groundSelUnitId) : null;
  if (u) {
    artTitle(ov, ctx, c, u.archId, u.name ?? archName(u.archId), roles);
    line(ctx, c, `${archName(u.archId)} · ${t(`cmdPages.ground.status.${STATUS_KEYS.has(u.status) ? u.status : 'other'}`)}`, roles, { tone: 'dim' });
    eyebrow(ctx, c, t('cmdPages.ground.state'), roles);
    const bar = (label, cur, max) => {
      if (cur == null || !max) return;
      kv(ctx, c, label, `${Math.round(cur)} / ${Math.round(max)}`, roles, cur / max < 0.35 ? 'alert' : 'primary');
      drawBar(ctx, c.x, c.y - 2, c.w, cur / max, roles, { tone: cur / max < 0.35 ? 'alert' : 'primary' });
      c.y += 4;
    };
    bar(t('groundPanel.stat.hp'), u.hp, u.hpMax);
    bar(t('cmdPages.ground.col.org'), u.org, u.maxOrg);
    bar(t('cmdPages.ground.col.morale'), u.morale, u.maxMorale);
    bar(t('groundPanel.stat.supply'), u.supply, u.supplyCap);
    kv(ctx, c, t('cmdPages.ground.experience'), u.experience, roles, 'dim');
    eyebrow(ctx, c, t('cmdInsp.actions'), roles);
    ctx.font = F(THEME.fontSizeSmall - 1);
    for (const ln of ov._wrapTextWidth(ctx, t('cmdPages.ground.unitOrdersHint'), c.w)) line(ctx, c, ln, roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
    ctx.restore();
    return;
  }
  const rc = f.recruit;
  if (!rc) { ctx.restore(); centerHint(ctx, r, t(f.hasPanel ? 'cmdPages.ground.selectHint' : 'cmdPages.ground.noPanel'), roles); return; }
  const arch = UNIT_ARCHETYPES[rc.archId] ?? {};
  artTitle(ov, ctx, c, rc.archId, archName(rc.archId), roles);
  line(ctx, c, t(`groundPanel.role.${arch.role}`), roles, { tone: 'dim' });
  ctx.font = F(THEME.fontSizeSmall - 1);
  const desc = getLocale() === 'en' ? (arch.descriptionEN ?? '') : (arch.descriptionPL ?? '');
  for (const ln of ov._wrapTextWidth(ctx, desc, c.w)) line(ctx, c, ln, roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
  eyebrow(ctx, c, t('cmdPages.ground.stats'), roles);
  const bs = arch.baseStats ?? {};
  for (const k of ['hp', 'ac', 'dmg', 'rng', 'mov']) kv(ctx, c, t(`groundPanel.stat.${k}.full`).split(' — ')[0], bs[k] ?? '—', roles);
  if (arch.counters?.length) wrappedLine(ov, ctx, c, `${t('cmdPages.ground.counters')}: ${arch.counters.map(archName).join(', ')}`, roles, 'primary');
  if (arch.counteredBy?.length) wrappedLine(ov, ctx, c, `${t('cmdPages.ground.counteredBy')}: ${arch.counteredBy.map(archName).join(', ')}`, roles, 'alert');
  eyebrow(ctx, c, t('cmdPages.ground.cost'), roles);
  const cost = rc.cost ?? {};
  for (const g of rc.costGoods ?? []) kv(ctx, c, g.name, g.n, roles);
  if (cost.pop) kv(ctx, c, 'POP', cost.pop, roles);
  if (cost.kr) kv(ctx, c, 'Kr', cost.kr, roles);
  kv(ctx, c, t('cmdPages.ground.costTime'), t('cmdPages.ground.years', cost.time ?? 1), roles);
  if (cost.upkeep) kv(ctx, c, t('cmdPages.ground.upkeep'), `${cost.upkeep.energy ?? 0} E · ${cost.upkeep.credits ?? 0} Kr`, roles, 'dim');
  kv(ctx, c, t('cmdPages.ground.barracks'), t('cmdPages.ground.barracksLine', rc.barracksLv, rc.queue, rc.slots, rc.active, rc.maxUnits), roles,
    rc.barracksLv > 0 ? 'primary' : 'alert');
  eyebrow(ctx, c, t('cmdInsp.actions'), roles);
  pageChips(ov, ctx, c, [{ labelKey: 'cmdPages.ground.recruit', labelArgs: [f.local?.name ?? '—'],
    zone: rc.canRecruit ? { type: 'ground:recruit', data: { archetypeId: rc.archId } } : null, reasonKey: rc.reasonKey, reasonArgs: rc.reasonArgs }], roles, 1);
  if (!rc.canRecruit) wrappedLine(ov, ctx, c, t(rc.reasonKey, ...rc.reasonArgs), roles, 'alert');
  if (rc.toast) line(ctx, c, rc.toast.text, roles, { tone: rc.toast.success ? 'primary' : 'alert' });
  ctx.restore();
}

function drawGroundStrip(ov, ctx, sz, roles, f) {
  if (!sz || sz.h <= 0) return;
  const col = window.KOSMOS?.colonyManager?.getColony?.(f.local?.id);
  const q = col?.groundUnitQueues ?? [];
  ctx.save();
  ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'middle';
  if (!q.length) { ctx.fillStyle = roles.dim; ctx.fillText(fit(ctx, t('cmdPages.ground.stripEmpty', f.local?.name ?? '—'), sz.w - 8), sz.x + 4, sz.y + sz.h / 2); ctx.restore(); return; }
  let x = sz.x + 4;
  ctx.fillStyle = roles.dim; ctx.fillText(t('cmdPages.ground.stripTitle'), x, sz.y + 10);
  const y = sz.y + 26;
  for (const it of q) {
    const frac = it.buildTime > 0 ? Math.min(1, (it.progress ?? 0) / it.buildTime) : 0;
    const w = 150;
    if (x + w > sz.x + sz.w) break;
    ctx.fillStyle = roles.primary; ctx.fillText(fit(ctx, `${ARCHETYPE_ICONS[it.archetypeId] ?? ''} ${archName(it.archetypeId)} ${Math.round(frac * 100)}%`, w - 8), x, y - 4);
    drawBar(ctx, x, y + 4, w - 12, frac, roles, { tone: 'primary' });
    x += w;
  }
  ctx.restore();
}
