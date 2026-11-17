// ARC KONSOLE K7-B — inspektor statku / floty na konsoli Dowództwa: rysunek (FEATURES.consoleCommand).
//
// Wołane z `CommandConsoleView.drawInspectorZone` (strefa inspektora `consoleZones`). Treść = dzisiejszy panel `_drawRight`
// (statek, flota, wrak; wróg i konfigurator misji — dzisiejsze rysunki w strefie), język konsoli: bez wypełnionych paneli
// i przycisków, tekst w rolach konsoli, przyrządy jako cienkie paski z liczbami, akcje jako czipy w nawiasach pogrupowane
// (główne → rozkazy → logistyka → niszczące w roli alert). Strefy trafień: DZISIEJSZE typy i dane (handlery bez zmian),
// fakty z `FleetManagerOverlay._inspectorShipFacts` (te same predykaty co panel OFF). Akcja niemożliwa = czip wyłączony
// z powodem w podpowiedzi (`ov._cmdDisabled`), nigdy cichy brak reakcji.

import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { drawEyebrow, drawKvRow, drawActionChip, drawBar, drawSelectBrackets, chipLabel, CONSOLE_KIT } from './ConsoleKit.js';
import { truncateText } from './HudLabelLogic.js';
import { isEnemyVessel } from '../entities/Vessel.js';
import { ALL_DOCTRINES, doctrineNameKey } from '../data/FleetDoctrines.js';
import { resolveVesselStatus } from '../utils/VesselStatus.js';
import { shipActionGroups, preConfigGroups, noOrdersKey, fleetActionGroups, groupStats, meter, hullState, upkeepLines, LOW_FRAC } from './CommandInspectorLogic.js';

export const INSP = Object.freeze({
  PAD_R: 6,          // odstęp od paska przewijania
  LINE_H: 15,        // linia tekstu
  GAP: 8,            // odstęp między blokami
  CHIP_GAP_Y: 4,
  METER_H: 26,       // przyrząd: etykieta + liczby (linia) + pasek
  NAME_FONT: 13,
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fit = (ctx, s, w) => truncateText(String(s ?? ''), Math.max(0, w), (q) => ctx.measureText(q).width);
const inside = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const push = (ov, x, y, w, h, type, data = {}) => ov._hitZones.push({ x, y, w, h, type, data });

/** Wejście: dzisiejszy wybór (flota → wrak → brak → wróg → statek), jak kolejność gałęzi `_drawRight`. */
export function drawInspector(ov, ctx, r, roles, env) {
  ov._rightViewH = r.h;
  ov._rightContentH = r.h;
  const K = window.KOSMOS;
  if (ov._selectedFleetId) {
    const fleet = K?.fleetSystem?.getFleet?.(ov._selectedFleetId);
    if (fleet) { scrolled(ov, ctx, r, roles, `fleet:${fleet.id}`, (c) => drawFleetBody(ov, ctx, c, roles, fleet)); return; }
  }
  const sel = ov._selectedVesselId ? env.vMgr?.getVessel?.(ov._selectedVesselId) : null;
  if (sel?.isWreck) { drawWreck(ov, ctx, r, roles, sel); return; }
  if (!ov._selectedVesselId) {
    ctx.save();
    ctx.font = F(THEME.fontSizeSmall); ctx.fillStyle = roles.dim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(fit(ctx, t('cmdInsp.selectHint'), r.w - 12), r.x + r.w / 2, r.y + r.h / 2);
    ctx.restore();
    return;
  }
  if (!sel) { ov._setSelectedVesselViaUI(null); return; }
  // wróg — dzisiejszy uproszczony panel (bez akcji) w strefie inspektora
  if (isEnemyVessel(sel)) { ov._drawEnemyDetails(ctx, r.x, r.y, r.w, r.h, sel); return; }
  scrolled(ov, ctx, r, roles, `vessel:${sel.id}`, (c) => drawShipBody(ov, ctx, c, roles, sel, env));
}

// ── Przewijanie (ten sam `_rightScrollY` / `_rightContentH` co panel OFF — kółko obsługuje `_scrollRightPanel`) ────────

function scrolled(ov, ctx, r, roles, key, body) {
  if (ov._inspScrollKey !== key) { ov._inspScrollKey = key; ov._rightScrollY = 0; ov._rightScrollVesselId = ov._selectedVesselId; }
  // konfigurator misji: świeży widok od góry przy zmianie kroku / celu (jak `_drawRight`)
  if (ov._missionConfig) {
    const k = `${ov._missionConfig.actionId}|${ov._missionConfig.step}|${ov._missionConfig.targetId ?? ''}`;
    if (k !== ov._missionCfgScrollKey) { ov._missionCfgScrollKey = k; ov._rightScrollY = 0; }
  } else ov._missionCfgScrollKey = null;
  const sc = ov._rightScrollY || 0;
  const hz0 = ov._hitZones.length;
  const dis0 = (ov._cmdDisabled ?? []).length;
  const c = { x: r.x, y: r.y - sc, w: r.w - INSP.PAD_R, top: r.y, bottom: r.y + r.h, sc, viewH: r.h };
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x - 4, r.y, r.w + 8, r.h); ctx.clip();
  ctx.textBaseline = 'middle';
  try { body(c); } finally {
    ctx.restore();
    ov._rightViewH = r.h;
    ov._rightContentH = (c.y - r.y) + sc + INSP.GAP;
    const maxS = Math.max(0, ov._rightContentH - r.h);
    if (ov._rightScrollY > maxS) ov._rightScrollY = maxS;
    if (ov._rightScrollY < 0) ov._rightScrollY = 0;
    ov._clipRightHitZones(hz0, r.y, r.h);
    // powody wyłączonych czipów poza widokiem — bez podpowiedzi (jak strefy: clip nie przycina — Finding 110)
    if (ov._cmdDisabled) {
      const keep = ov._cmdDisabled.slice(dis0).filter((d) => d.rect.y + d.rect.h > r.y && d.rect.y < r.y + r.h);
      ov._cmdDisabled.length = dis0; ov._cmdDisabled.push(...keep);
    }
    if (maxS > 0) {
      const sx = r.x + r.w - CONSOLE_KIT.SCROLLBAR_W;
      const th = Math.max(16, r.h * r.h / ov._rightContentH);
      const ty = r.y + (r.h - th) * ((ov._rightScrollY || 0) / maxS);
      ctx.save();
      ctx.globalAlpha = CONSOLE_KIT.TRACK_ALPHA; ctx.fillStyle = roles.dim; ctx.fillRect(sx, r.y, CONSOLE_KIT.SCROLLBAR_W, r.h);
      ctx.globalAlpha = 1; ctx.fillStyle = roles.primary; ctx.fillRect(sx, ty, CONSOLE_KIT.SCROLLBAR_W, th);
      ctx.restore();
    }
  }
}

// ── Klocki ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function line(ctx, c, text, roles, { tone = 'primary', bold = false, size = THEME.fontSizeSmall, indent = 0 } = {}) {
  ctx.font = F(size, bold);
  ctx.fillStyle = roles[tone] ?? roles.primary;
  ctx.fillText(fit(ctx, text, c.w - indent), c.x + indent, c.y + INSP.LINE_H / 2);
  c.y += INSP.LINE_H;
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

/** Przyrząd: etykieta (dim) · liczby (rola) w jednej linii + pasek 2 px. */
function instrument(ctx, c, label, valueTxt, frac, tone, roles) {
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = roles.dim;
  ctx.fillText(fit(ctx, label.toUpperCase(), c.w * 0.5), c.x, c.y + 7);
  ctx.fillStyle = roles[tone] ?? roles.primary;
  ctx.textAlign = 'right';
  ctx.fillText(fit(ctx, valueTxt, c.w * 0.55), c.x + c.w, c.y + 7);
  ctx.textAlign = 'left';
  drawBar(ctx, c.x, c.y + 16, c.w, frac, roles, { tone });
  c.y += INSP.METER_H;
}

/**
 * Czipy jednej grupy: `cols` kolumn (1 = pełna szerokość). Czip ze strefą → dzisiejsza strefa; bez strefy → wyłączony
 * z powodem w podpowiedzi. Ucięta etykieta → pełna treść w podpowiedzi pod kursorem.
 */
function chips(ov, ctx, c, list, roles, cols = 2) {
  if (!list?.length) return;
  const mx = ov._regMouseX, my = ov._regMouseY;
  const gap = CONSOLE_KIT.CHIP_GAP;
  const cw = cols === 1 ? c.w : Math.floor((c.w - gap * (cols - 1)) / cols);
  ctx.font = F(THEME.fontSizeSmall);
  list.forEach((ch, i) => {
    const col = i % cols;
    const x = c.x + col * (cw + gap);
    const y = c.y;
    const label = ch.text ?? t(ch.labelKey, ...(ch.labelArgs ?? []));
    const enabled = !!ch.zone;
    const rect = { x, y, w: cw, h: CONSOLE_KIT.CHIP_H };
    const hov = inside(rect, mx, my) && my >= c.top && my <= c.bottom;
    drawActionChip(ctx, x, y, cw, roles, { label, enabled, danger: !!ch.danger, hover: hov });
    if (enabled) {
      push(ov, x, y, cw, CONSOLE_KIT.CHIP_H, ch.zone.type, ch.zone.data);
      ctx.font = F(THEME.fontSizeSmall);
      if (hov && ctx.measureText(chipLabel(label)).width > cw - 2 * CONSOLE_KIT.CHIP_PAD_X) {
        ov._cmdTip = { text: label, x: mx + 12, y: my + 14, tone: 'primary' };
      }
    } else {
      ov._cmdDisabled.push(ch.reasonText
        ? { rect, text: `${label}: ${ch.reasonText}` }
        : { rect, reasonKey: ch.reasonKey ?? 'cmdInsp.reasonUnavailable', args: ch.reasonArgs ?? [] });
    }
    if (col === cols - 1 || i === list.length - 1) c.y += CONSOLE_KIT.CHIP_H + INSP.CHIP_GAP_Y;
  });
}

/** Nagłówek: nazwa (klik = zmiana nazwy — dzisiejsza strefa) + link po prawej (dzisiejsza strefa powrotu). */
function titleRow(ov, ctx, c, roles, { name, renameType, renameData, linkLabel, linkType, linkData }) {
  const mx = ov._regMouseX, my = ov._regMouseY;
  ctx.font = F(THEME.fontSizeSmall);
  const lk = chipLabel(linkLabel);
  const lw = Math.ceil(ctx.measureText(lk).width) + 2 * CONSOLE_KIT.CHIP_PAD_X;
  const lr = { x: c.x + c.w - lw, y: c.y, w: lw, h: CONSOLE_KIT.CHIP_H };
  drawActionChip(ctx, lr.x, lr.y, lw, roles, { label: linkLabel, hover: inside(lr, mx, my) });
  push(ov, lr.x, lr.y, lr.w, lr.h, linkType, linkData);
  ctx.font = F(INSP.NAME_FONT, true);
  const nameW = c.w - lw - 22;
  const shown = fit(ctx, name, nameW);
  const nw = ctx.measureText(shown).width;
  const nr = { x: c.x, y: c.y, w: nw + 16, h: CONSOLE_KIT.CHIP_H };
  const hovN = inside(nr, mx, my);
  ctx.fillStyle = roles.primary;
  ctx.fillText(shown, c.x, c.y + CONSOLE_KIT.CHIP_H / 2);
  ctx.font = F(THEME.fontSizeSmall);
  ctx.fillStyle = hovN ? roles.primary : roles.dim;
  ctx.fillText('✎', c.x + nw + 5, c.y + CONSOLE_KIT.CHIP_H / 2);
  push(ov, nr.x, nr.y, nr.w, nr.h, renameType, renameData);
  if (hovN) ov._cmdTip = { text: t('cmdInsp.renameHint'), x: mx + 12, y: my + 14, tone: 'primary' };
  c.y += CONSOLE_KIT.CHIP_H + 2;
}

const STATUS_TONE = { in_transit: 'primary', docked: 'primary', orbiting: 'primary', in_space: 'primary', unknown: 'dim' };

// ── Statek ─────────────────────────────────────────────────────────────────────────────────────────────────────────

function drawShipBody(ov, ctx, c, roles, v, env) {
  const info = ov._inspectorShipInfo(v, env.ms, env.colMgr);
  titleRow(ov, ctx, c, roles, { name: v.name ?? v.id, renameType: 'rename', renameData: { vesselId: v.id },
    linkLabel: t('cmdInsp.shipyard'), linkType: 'back_to_shipyard', linkData: {} });
  line(ctx, c, `${info.roleLabel} · ${info.className}`, roles, { tone: 'dim' });
  // linia statusu: stan · miejsce (inny układ / tranzyt) — w rolach; gwiazdki doświadczenia po prawej
  const stranded = info.statusText === t('fleet.statusTextStranded');
  const where = info.inTransit ? t('cmdInsp.whereTransit') : info.otherSystem ? t('cmdInsp.whereOther', info.systemName ?? '—') : (info.systemName ?? '');
  const stTone = stranded || v.damaged || info.upkeep.immobilized ? 'alert' : (STATUS_TONE[info.statusToken] ?? 'primary');
  ctx.font = F(THEME.fontSizeSmall);
  const xpW = ctx.measureText(info.xp).width + 6;
  ctx.fillStyle = roles.dim; ctx.textAlign = 'right';
  ctx.fillText(info.xp, c.x + c.w, c.y + INSP.LINE_H / 2);
  ctx.textAlign = 'left';
  const stTxt = `● ${info.statusText}${where ? ` · ${where}` : ''}`;
  ctx.fillStyle = roles[stTone];
  ctx.fillText(fit(ctx, stTxt, c.w - xpW), c.x, c.y + INSP.LINE_H / 2);
  c.y += INSP.LINE_H;
  kv(ctx, c, t('fleet.labelBase'), info.base, roles, 'primary');
  c.y += 4;

  // przyrządy: paliwo, warp, wytrzymałość, kadłub (+ mobilizacja)
  const fm = meter(v.fuel?.current, v.fuel?.max);
  if (fm) instrument(ctx, c, t('fleet.labelFuel'), `${(v.fuel.current ?? 0).toFixed(1)} / ${v.fuel.max} pc`, fm.frac, fm.tone, roles);
  const wm = meter(v.warpFuel?.current, v.warpFuel?.max);
  if (wm) instrument(ctx, c, t('fleet.labelWarpFuel'), `${v.warpFuel.current.toFixed(1)} / ${v.warpFuel.max} wc`, wm.frac, wm.tone, roles);
  const em = meter(v.endurance?.current, v.endurance?.max);
  if (em) instrument(ctx, c, t('fleet.labelEndurance'), `${Math.round(v.endurance.current)} / ${Math.round(v.endurance.max)}`, em.frac, em.tone, roles);
  const hs = hullState(v);
  instrument(ctx, c, t('cmdInsp.hull'), t(hs.key, Math.round(hs.frac * 100)), hs.frac, hs.tone, roles);
  if (info.mobilizing) instrument(ctx, c, t(info.mobilizing.key), `${Math.round(info.mobilizing.frac * 100)}%`, info.mobilizing.frac, 'primary', roles);

  // utrzymanie: stawka; ostrzeżenie / unieruchomienie z KONKRETNĄ naprawą w roli alert
  const up = upkeepLines(info.upkeep);
  kv(ctx, c, t('fleet.maintenance'), `-${t(up.rate.key, ...up.rate.args)}`, roles, up.rate.tone);
  for (const l of up.lines) line(ctx, c, `${l.tone === 'alert' ? '⚠ ' : ''}${t(l.key, ...l.args)}`, roles, { tone: l.tone });

  // rozkaz ruchu, misja, przylot, obca orbita, rekon, pętla — dzisiejsze dane
  const facts = ov._inspectorShipFacts(v, env.ms, env.colMgr, env.activePid);
  drawMissionBlock(ctx, c, roles, info, facts);

  // konfigurator misji zastępuje akcje (jak dziś): zostają tylko czipy, które panel rysuje przed nim; konfigurator — dzisiejszy rysunek
  if (ov._missionConfig) {
    const pg = preConfigGroups(shipActionGroups(facts));
    chips(ov, ctx, c, pg.primary, roles, 1);
    chips(ov, ctx, c, [...pg.orders, ...pg.logistics], roles, 2);
    c.y += 4;
    const end = ov._drawMissionConfig(ctx, c.x, c.y, c.w + INSP.PAD_R, c.bottom - c.y, 0, v, env.ms, env.colMgr);
    if (typeof end === 'number' && end > c.y) c.y = end;
    return;
  }

  // akcje: główne (pełna szerokość) → rozkazy → logistyka → niszczące (pełna szerokość, alert)
  const g = shipActionGroups(facts);
  eyebrow(ctx, c, t('cmdInsp.actions'), roles);
  chips(ov, ctx, c, g.primary, roles, 1);
  if (g.orders.length) { line(ctx, c, t('cmdInsp.grpOrders'), roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 }); chips(ov, ctx, c, g.orders, roles, 2); }
  const nk = noOrdersKey(v.position?.state, facts.actions?.length ?? 0, g.logistics.length);
  if (nk) line(ctx, c, t(nk), roles, { tone: 'dim' });
  line(ctx, c, t('cmdInsp.grpLogistics'), roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
  if (facts.rally?.currentId) line(ctx, c, t('fleet.rally.assigned', facts.rally.currentName ?? '?'), roles, { tone: 'primary' });
  chips(ov, ctx, c, g.logistics, roles, 2);
  c.y += 4;
  chips(ov, ctx, c, g.destructive, roles, 1);

  // akta techniczne: moduły + osiągi + opis kadłuba
  eyebrow(ctx, c, `${t('cmdInsp.techFile')} · ${t('fleet.modulesHeader')} ${info.mods.length}/${info.modsMax}`, roles);
  if (info.mods.length === 0) line(ctx, c, t('fleet.noModules'), roles, { tone: 'dim' });
  for (const m of info.mods) kv(ctx, c, m.slot, m.name, roles, m.missing ? 'alert' : 'primary');
  for (const [k, val] of info.specs) kv(ctx, c, k, val, roles, 'primary');
  if (info.desc) {
    ctx.font = F(THEME.fontSizeSmall - 1);
    for (const ln of ov._wrapTextWidth(ctx, info.desc, c.w)) { line(ctx, c, ln, roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 }); }
  }

  // log misji
  if (info.log.length > 0) {
    eyebrow(ctx, c, t('fleet.missionLog'), roles);
    for (const e of info.log) {
      const tone = e.type === 'danger' || e.type === 'warning' ? 'alert' : e.type === 'success' ? 'primary' : 'dim';
      line(ctx, c, `${e.year != null ? `[${e.year}] ` : ''}${e.text}`, roles, { tone });
    }
  }
}

function drawMissionBlock(ctx, c, roles, info, facts) {
  const any = info.orderLine || info.mission || info.interstellar || facts.foreign || info.recon || info.loop;
  if (!any) return;
  eyebrow(ctx, c, t('cmdInsp.now'), roles);
  if (info.orderLine) line(ctx, c, info.orderLine.label, roles, { tone: info.orderLine.blocked ? 'alert' : 'primary' });
  const m = info.mission;
  if (m) {
    line(ctx, c, `${t('fleet.activeMission')}: ${m.label}`, roles, { tone: 'primary' });
    line(ctx, c, `${m.phase}${m.eta ? `  ${m.eta}` : ''}`, roles, { tone: 'dim' });
    if (m.pct > 0) { drawBar(ctx, c.x, c.y, c.w, Math.min(1, m.pct), roles); c.y += 6; }
    const list = (key, rows) => {
      if (!rows.length) return;
      line(ctx, c, t(key), roles, { tone: 'dim', size: THEME.fontSizeSmall - 1 });
      for (const r of rows.slice(0, 4)) kv(ctx, c, r.text, r.qty, roles, 'primary');
      if (rows.length > 4) line(ctx, c, t('fleet.manifestMore', rows.length - 4), roles, { tone: 'dim' });
    };
    list('fleet.manifestPlanned', m.planned);
    list('fleet.manifestOnBoard', m.onBoard);
    list('fleet.manifestReturn', m.ret);
  }
  if (info.interstellar) line(ctx, c, info.interstellar, roles, { tone: 'primary' });
  if (facts.foreign) line(ctx, c, t('cmdInsp.orbitingBody', facts.foreign.bodyName), roles, { tone: 'primary' });
  if (info.recon) {
    line(ctx, c, info.recon.label, roles, { tone: 'primary' });
    if (info.recon.progress) line(ctx, c, info.recon.progress, roles, { tone: 'dim' });
  }
  if (info.loop) {
    line(ctx, c, `${t('cmdInsp.loop')}: ${info.loop.route}`, roles, { tone: 'primary' });
    if (info.loop.waitKey) line(ctx, c, t(info.loop.waitKey), roles, { tone: 'alert' });
  }
}

// ── Flota ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function drawFleetBody(ov, ctx, c, roles, fleet) {
  const mx = ov._regMouseX, my = ov._regMouseY;
  titleRow(ov, ctx, c, roles, { name: fleet.name ?? '—', renameType: 'fleetRename', renameData: { fleetId: fleet.id },
    linkLabel: t('cmdInsp.backToList'), linkType: 'fleetBackToList', linkData: {} });
  const st = ov._computeFleetStatus(fleet);
  line(ctx, c, `${t('fleet.statusLabel')}: ${st.label}`, roles, { tone: fleet.activeOrder ? 'primary' : 'dim' });
  // podsumowanie członków (najwolniejszy, zasięg, paliwo)
  const ids = fleet.memberIds ?? [];
  const members = ov._inspectorMemberStats(ids);
  summaryRows(ctx, c, roles, groupStats(members, ids.length));
  // rozkazy floty (2×2) + tryb wskazania celu
  const engagePick = ov._fleetEngagePickMode?.fleetId === fleet.id;
  const g = fleetActionGroups({ fleetId: fleet.id, hasOrder: !!fleet.activeOrder, engagePick });
  eyebrow(ctx, c, t('cmdInsp.actions'), roles);
  chips(ov, ctx, c, g.orders, roles, 2);
  if (engagePick) {
    line(ctx, c, `⏳ ${t('fleet.pickModeActive')}`, roles, { tone: 'alert', bold: true });
    line(ctx, c, t('fleet.pickModeHint'), roles, { tone: 'dim' });
  }
  // doktryna: lista wyboru (aktywna w nawiasach); próg odwrotu dla retreat_at_50
  eyebrow(ctx, c, t('fleet.doctrineLabel'), roles);
  for (const d of ALL_DOCTRINES) {
    const active = fleet.doctrine === d;
    const rr = { x: c.x, y: c.y, w: c.w, h: CONSOLE_KIT.ROW_H };
    const hov = inside(rr, mx, my);
    if (hov && !active) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1; }
    ctx.font = F(THEME.fontSizeSmall, active);
    ctx.fillStyle = active ? roles.primary : roles.dim;
    ctx.fillText(fit(ctx, t(doctrineNameKey(d)), c.w - 2 * CONSOLE_KIT.ROW_PAD_X), c.x + CONSOLE_KIT.ROW_PAD_X, c.y + rr.h / 2);
    if (active) drawSelectBrackets(ctx, rr, roles);
    push(ov, rr.x, rr.y, rr.w, rr.h, 'fleetSetDoctrine', { fleetId: fleet.id, doctrine: d });
    c.y += rr.h + 2;
  }
  if (fleet.doctrine === 'retreat_at_50') {
    const thr = typeof fleet.retreatThreshold === 'number' ? fleet.retreatThreshold : 0.5;
    kv(ctx, c, t('fleet.retreatThreshold.label'), `${Math.round(thr * 100)}%`, roles, 'primary');
    const normFrac = Math.max(0, Math.min(1, (thr - 0.05) / 0.9));
    drawBar(ctx, c.x, c.y + 5, c.w, normFrac, roles);
    ctx.fillStyle = roles.primary;
    ctx.fillRect(Math.round(c.x + (c.w - 2) * normFrac) - 1, c.y + 1, 3, 10);
    // ta sama strefa co dziś: klik mapuje x na próg (`sliderX`, `sliderW`)
    push(ov, c.x, c.y - 2, c.w, 16, 'fleetRetreatThreshold', { fleetId: fleet.id, sliderX: c.x, sliderW: c.w });
    c.y += 18;
  }
  // członkowie: nazwa w roli statusu + znacznik rozkazu (flota / własny)
  eyebrow(ctx, c, `${t('fleet.fleetMembers')} · ${ids.length}`, roles);
  if (ids.length === 0) line(ctx, c, t('fleet.fleetMembersEmpty'), roles, { tone: 'dim' });
  const vMgr = window.KOSMOS?.vesselManager;
  const ao = fleet.activeOrder;
  for (const vid of ids) {
    const v = vMgr?.getVessel?.(vid);
    const rr = { x: c.x, y: c.y, w: c.w, h: CONSOLE_KIT.ROW_H };
    const hov = inside(rr, mx, my);
    if (hov) { ctx.globalAlpha = CONSOLE_KIT.HOVER_ALPHA; ctx.fillStyle = roles.primary; ctx.fillRect(rr.x, rr.y, rr.w, rr.h); ctx.globalAlpha = 1; }
    let badge = null, bTone = 'dim';
    if (v?.movementOrder) {
      const tracked = ao?.memberOrderIds?.[vid];
      if (tracked && v.movementOrder.id === tracked) { badge = t('cmdInsp.badgeFleet'); bTone = 'primary'; }
      else { badge = t('cmdInsp.badgeOwn'); bTone = 'alert'; }
    }
    ctx.font = F(THEME.fontSizeSmall);
    let bw = 0;
    if (badge) {
      ctx.fillStyle = roles[bTone]; ctx.textAlign = 'right';
      ctx.fillText(badge, c.x + c.w - 4, c.y + rr.h / 2); ctx.textAlign = 'left';
      bw = ctx.measureText(badge).width + 8;
    }
    const tok = v ? resolveVesselStatus(v).token : 'unknown';
    ctx.fillStyle = !v ? roles.dim : v.damaged ? roles.alert : (tok === 'unknown' ? roles.dim : roles.primary);
    ctx.fillText(fit(ctx, v?.name ?? vid, c.w - 8 - bw), c.x + 4, c.y + rr.h / 2);
    push(ov, rr.x, rr.y, rr.w, rr.h, 'fleetMemberSelect', { vesselId: vid });
    c.y += rr.h;
  }
  c.y += INSP.GAP;
  chips(ov, ctx, c, g.destructive, roles, 1);
}

/** Wiersze podsumowania grupy (flota / zaznaczenie): liczba, najwolniejszy, zasięg, najmniej paliwa. */
export function summaryRows(ctx, c, roles, s) {
  kv(ctx, c, t('cmdInsp.members'), s.present === s.count ? String(s.count) : `${s.present}/${s.count}`, roles, 'primary');
  kv(ctx, c, t('cmdInsp.slowest'), s.slowestSpeed == null ? '—' : `${s.slowestSpeed.toFixed(1)} AU/r`, roles, 'primary');
  kv(ctx, c, t('cmdInsp.minRange'), s.minRange == null ? '—' : `${s.minRange.toFixed(1)} AU`, roles, 'primary');
  kv(ctx, c, t('cmdInsp.minFuel'), s.minFuelPct == null ? '—' : `${Math.round(s.minFuelPct * 100)}%`, roles,
    s.minFuelPct != null && s.minFuelPct < LOW_FRAC ? 'alert' : 'primary');
}

// ── Wrak (raport bitwy — ta sama treść co dziś) ────────────────────────────────────────────────────────────────────

function drawWreck(ov, ctx, r, roles, v) {
  const c = { x: r.x, y: r.y, w: r.w - INSP.PAD_R };
  ctx.save();
  ctx.textBaseline = 'middle';
  line(ctx, c, `${t('cmdInsp.wreck')} · ${v.name ?? v.id}`, roles, { tone: 'primary', bold: true, size: INSP.NAME_FONT });
  c.y += 4;
  const wy = Number.isFinite(v.wreckedAt) ? Math.floor(v.wreckedAt) : (Number.isFinite(v.lastBattleYear) ? Math.floor(v.lastBattleYear) : null);
  if (wy != null) line(ctx, c, t('registry.wreckYear', wy), roles, { tone: 'dim' });
  const rec = window.KOSMOS?.warSystem?.getBattleRecord?.(v.lastBattleId);
  eyebrow(ctx, c, t('cmdInsp.battle'), roles);
  if (rec) {
    const a = rec.participantA?.count ?? rec.participantA?.vesselIds?.length ?? '?';
    const b = rec.participantB?.count ?? rec.participantB?.vesselIds?.length ?? '?';
    line(ctx, c, t('fleet.battleHeader', rec.year != null ? Math.floor(rec.year) : '?'), roles, { tone: 'primary' });
    kv(ctx, c, 'A : B', `${a} : ${b}`, roles, 'primary');
    kv(ctx, c, t('fleet.battleResult'), rec.winner ?? '?', roles, 'alert');
  } else {
    line(ctx, c, t('fleet.battleNoRecord'), roles, { tone: 'dim' });
  }
  ctx.restore();
}
