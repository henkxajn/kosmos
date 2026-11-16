// DiplomacyConsoleView — Dyplomacja na zestawie konsoli (ARC KONSOLE K2, docs/design/CONSOLES_PLAN.md §1.2; FEATURES.consoleDiplomacy).
//
// Wołane przez `DiplomacyOverlay.draw`, gdy `isKitScreen('diplomacy')`. Szablon 4-strefowy (D-K-1):
//  (1) nagłówek — DYPLOMACJA + czipy grupy [ DYPLOMACJA ] [ WYWIAD ] [ WOJNY ] (klik = openPanel, jak pas subnav) + [ x ];
//  (2) lista — WSPÓLNA lista imperiów K0b (`empireRowView` + `drawEmpireList`), dzisiejszy zbiór i kolejność Dyplomacji;
//      prawy napis wiersza = stan relacji · napięcie (dziś widoczne od `rumor`);
//  (3) bohater — tożsamość jak w Wywiadzie, linia statusu (pokój / wojna / rozejm z latami / sojusz) + postawa AI (etykieta, 724),
//      instrumenty: opinia (−100…+100, od kontaktu — jak dziś) i napięcie (0…100); niżej mini-mapa K0b-1 (ta sama mgła);
//  (4) inspektor — rozbicie opinii, traktaty (+ reparacje), pamięć relacji (etykiety, 724), czipy akcji z dzisiejszymi regułami
//      (wyłączone — powód w podpowiedzi); czipy kończą się nad klastrem zegara (strefy `consoleZones`, Finding 727);
//  pas — ultimatum / komunikat akcji, tylko gdy są.
// Strefy trafień: dzisiejsze typy (`close`, `select`, akcje, `bg`) + `tab` i `action_blocked` (podpowiedź, bez skutku). Geometria —
// wyłącznie `consoleZones` (bez window.inner*). Kolory — wyłącznie role (`consoleRoles`).

import { THEME } from '../config/ThemeConfig.js';
import { t, getName, getDesc } from '../i18n/i18n.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { canDoEnvoy } from '../entities/Vessel.js';
import { NAP_RENEW_WINDOW_YEARS } from '../data/OpinionModifierData.js';
import { treatyExpiryYear } from '../systems/diplomacy/RelationsModel.js';
import { consoleZones, consoleClockRect, insetRect, CONSOLE_SCREEN_SPECS } from './ConsoleLayoutLogic.js';
import { drawConsoleHeader, drawZoneFrame, drawZoneRule, drawEyebrow, drawKvRow, drawBar, drawInstrument, drawActionChip,
  drawConsoleTooltip, CONSOLE_KIT } from './ConsoleKit.js';
import { consoleRoles } from './ConsoleRolesLogic.js';
import { NAV_GROUPS, CIV_TABS, getNavGroup } from './CivPanelDrawer.js';
import { empireRowView, intelDossier, systemMapPoints, INTEL_MASK } from './EmpireListLogic.js';
import { drawEmpireList, revealEmpire } from './ConsoleEmpireList.js';
import { drawEmpireMiniMap } from './ConsoleEmpireMap.js';
import { HOME_SYSTEM_ID } from '../utils/SystemExploration.js';
import { truncateText } from './HudLabelLogic.js';
import { diplomacyEntries, relationStatusView, opinionFrac, tensionFrac, opinionTone, tensionTone, diplomacyActions,
  stanceLabelKey, memoryLabelKey, flashTone, DIPLO_CONSOLE } from './DiplomacyConsoleLogic.js';

// Wymiary widoku (px logiczne)
const DV = Object.freeze({
  HERO_INSET: 18,
  STRIP_H: 46,        // pas komunikatów (tylko gdy jest ultimatum / komunikat)
  SCALE_H: 4,         // pasek skali instrumentu
  TICK_H: 8,          // kreska skali
  MAP_MIN_H: 120,     // mini-mapa tylko, gdy zostaje tyle wysokości bohatera
  LINE_H: 16,
});

const F = (sz, b = false) => `${b ? 'bold ' : ''}${sz}px ${THEME.fontFamily}`;
const fits = (ctx) => (s) => ctx.measureText(s).width;
function text(ctx, s, x, y, color, font = null, align = 'left') {
  if (font) ctx.font = font;
  ctx.fillStyle = color; ctx.textAlign = align;
  ctx.fillText(s, x, y);
  ctx.textAlign = 'left';
}

/** Pasek skali instrumentu: tor dim, wypełnienie od `from` (0 = lewy brzeg, 0.5 = środek) do `frac`, znacznik, kreski skali. */
function scaleBar(ctx, x, y, w, frac, roles, { tone = 'primary', from = 0, ticks = [] } = {}) {
  drawBar(ctx, x, y, w, 0, roles, { h: DV.SCALE_H });
  const f = Math.max(0, Math.min(1, frac));
  const a = Math.min(from, f), b = Math.max(from, f);
  ctx.save();
  ctx.fillStyle = roles[tone] ?? roles.primary;
  ctx.fillRect(Math.round(x + w * a), y, Math.max(1, Math.round(w * (b - a))), DV.SCALE_H);
  ctx.strokeStyle = roles.dim; ctx.lineWidth = 1;
  for (const tk of ticks) {
    const tx = Math.round(x + w * tk) + 0.5;
    ctx.beginPath(); ctx.moveTo(tx, y - 2); ctx.lineTo(tx, y + DV.SCALE_H + 2); ctx.stroke();
  }
  ctx.strokeStyle = roles[tone] ?? roles.primary;
  const mx = Math.round(x + w * f) + 0.5;
  ctx.beginPath(); ctx.moveTo(mx, y - DV.TICK_H / 2); ctx.lineTo(mx, y + DV.SCALE_H + DV.TICK_H / 2); ctx.stroke();
  ctx.restore();
}

/** Zbiera dane świata dla zaznaczonej relacji (te same odczyty co `DiplomacyOverlay._drawRight`). */
function relationData(ov, K) {
  const dipl = K?.diplomacySystem;
  const intelSys = K?.intelSystem;
  const reg = K?.empireRegistry;
  const id = ov._selectedId;
  if (!id || !dipl) return null;
  const rel = dipl.listPlayerRelations().find((r) => r.empireId === id);
  const emp = reg?.get(id);
  if (!rel || !emp) return null;
  const level = intelSys?.getLevel(id) ?? 'unknown';
  const rec = K?.gameState?.get('intel')?.[id] ?? { level };
  const arch = ARCHETYPES[emp.archetype] ?? null;
  const galaxySys = (sid) => K?.galaxyData?.systems?.find((s) => s.id === sid) ?? null;
  const d = intelDossier({ rec: { ...rec, level }, emp, arch, archName: getName, archDesc: getDesc,
    systemName: (sid) => galaxySys(sid)?.name ?? sid });
  return { dipl, id, rel, emp, level, isContact: d.contact, d, galaxySys };
}

/**
 * Konsola Dyplomacji. `deps.treatyNameKey` — mapa id traktatu → klucz i18n z `DiplomacyOverlay` (jedno miejsce, DS-1/C3).
 */
export function drawDiplomacyConsole(ov, ctx, W, H, { treatyNameKey = {} } = {}) {
  const roles = consoleRoles(THEME);
  const K = window.KOSMOS;
  const data = relationData(ov, K);
  // pas tylko z treścią: ultimatum zaznaczonego imperium albo żywy komunikat akcji
  const ultimatum = data && data.rel.ultimatumStartYear != null;
  const flash = ov._flash && Date.now() < ov._flash.until ? ov._flash : null;
  const stripH = ultimatum || flash ? DV.STRIP_H : 0;
  const spec = { ...(CONSOLE_SCREEN_SPECS.diplomacy ?? {}), stripH, clock: consoleClockRect(W, H, NAV_GROUPS.length) };
  const z = consoleZones(ov._getOverlayBounds(W, H), spec);
  ov.consoleZones = z;
  ov._consoleTooltip = null;
  const hz = ov._hoverZone;

  // (1) Nagłówek
  const hoverHdr = hz?.type === 'tab' ? hz.data?.id : hz?.type === 'close' ? 'close' : null;
  const grp = getNavGroup('diplomacy');
  const chips = (grp?.members ?? ['diplomacy']).map((id) => {
    const tab = CIV_TABS.find((tb) => tb.id === id);
    return { id, label: tab ? t(tab.labelKey) : id, active: id === 'diplomacy' };
  });
  for (const h of drawConsoleHeader(ctx, z, roles, { title: t('diplo.console.title'), chips, hoverId: hoverHdr })) {
    if (h.type === 'close') ov._addHit(h.x, h.y, h.w, h.h, 'close');
    else ov._addHit(h.x, h.y, h.w, h.h, 'tab', { id: h.id });
  }

  // (2) Lista imperiów
  drawList(ov, ctx, z, roles, K, hz);

  // (3) Bohater + (4) inspektor
  drawZoneFrame(ctx, z.hero, roles);
  if (!data) {
    drawZoneRule(ctx, z.inspector, '', roles);
    ctx.save();
    ctx.textBaseline = 'middle';
    text(ctx, t('diplo.selectEmpire'), z.hero.x + z.hero.w / 2, z.hero.y + z.hero.h / 2, roles.dim, F(THEME.fontSizeMedium), 'center');
    ctx.restore();
  } else {
    drawHero(ctx, insetRect(z.hero, DV.HERO_INSET), data, roles, K);
    drawInspector(ov, ctx, z, data, roles, hz, treatyNameKey, K);
  }
  if (z.strip) drawStrip(ctx, z.strip, data, ultimatum, flash, roles);
  if (ov._consoleTooltip) drawConsoleTooltip(ctx, ov._consoleTooltip, z.frame, roles);
  // tło-absorber NA KOŃCU (first-match) — jak dziś (`bg`)
  ov._addHit(z.frame.x, z.frame.y, z.frame.w, z.frame.h, 'bg');
}

function drawList(ov, ctx, z, roles, K, hz) {
  const dipl = K?.diplomacySystem;
  const intelSys = K?.intelSystem;
  const reg = K?.empireRegistry;
  const lz = z.list;
  const lh = drawZoneRule(ctx, lz, t('diplo.console.empires'), roles);
  const listRect = { x: lz.x, y: lz.y + lh + 4, w: lz.w, h: Math.max(0, lz.h - lh - 4) };
  ov._consoleListRect = listRect;
  if (!dipl || !reg) return;
  const entries = diplomacyEntries(dipl.listPlayerRelations(), intelSys ? (id) => intelSys.getLevel(id) : null);
  if (entries.length === 0) {
    ctx.save();
    ctx.font = F(THEME.fontSizeSmall); ctx.textBaseline = 'alphabetic';
    const cx = listRect.x + listRect.w / 2;
    ['diplo.empty1', 'diplo.empty2', 'diplo.empty3', 'diplo.empty4'].forEach((k, i) =>
      text(ctx, t(k), cx, listRect.y + 34 + i * 17, roles.dim, null, 'center'));
    ctx.restore();
    return;
  }
  const relById = new Map(entries.map((r) => [r.empireId, r]));
  const views = entries.map((rel) => {
    const emp = reg.get(rel.empireId);
    return empireRowView({ empireId: rel.empireId, level: intelSys?.getLevel(rel.empireId) ?? 'unknown', emp,
      arch: emp ? ARCHETYPES[emp.archetype] : null, archName: getName });
  });
  if (ov._revealPending) {
    ov._scrollLeft = revealEmpire(views, ov._selectedId, ov._scrollLeft, listRect.h);
    ov._revealPending = false;
  }
  const hoverRow = hz?.type === 'select' ? hz.data?.empireId : null;
  const res = drawEmpireList(ctx, listRect, views, roles, {
    selectedId: ov._selectedId, hoverId: hoverRow, scroll: ov._scrollLeft, levelLabel: (v) => t(v.levelKey),
    line1Right: (v) => {
      const rel = relById.get(v.id);
      const st = relationStatusView({ status: rel?.status });
      return { text: `${t(st.key)} · ${Math.round(rel?.tension ?? 0)}`, tone: st.tone };
    },
  });
  ov._scrollLeft = res.scroll;
  for (const r of res.zones) ov._addHit(r.x, r.y, r.w, r.h, 'select', { empireId: r.id });
}

function drawHero(ctx, r, data, roles, K) {
  const { dipl, id, rel, d, isContact } = data;
  const big = THEME.fontSizeInstrument ?? 2 * THEME.fontSizeLarge;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x - 8, r.y - 8, r.w + 16, r.h + 16); ctx.clip();
  ctx.textBaseline = 'alphabetic';
  let y = r.y;
  y += drawEyebrow(ctx, r.x, y, r.w, t('diplo.console.relation'), roles) + 6;
  // tożsamość (jak w Wywiadzie): kropka archetypu od kontaktu, nazwa w mgle, archetyp
  let nx = r.x;
  if (d.archColor) {
    ctx.fillStyle = d.archColor;
    ctx.beginPath(); ctx.arc(r.x + 6, y + big * 0.62, 6, 0, Math.PI * 2); ctx.fill();
    nx += 22;
  }
  ctx.font = F(big, true);
  text(ctx, truncateText(d.name, r.x + r.w - nx, fits(ctx)), nx, y + big, d.contact ? roles.primary : roles.dim);
  y += big + 14;
  text(ctx, `${t('intel.archetype').toUpperCase()}   ${d.archName ?? INTEL_MASK}`, r.x, y + THEME.fontSizeNormal,
    d.archName ? roles.primary : roles.dim, F(THEME.fontSizeNormal));
  y += THEME.fontSizeNormal + 14;

  // linia statusu: [ STATUS ] (+ sojusz) · postawa AI (od kontaktu, etykieta — Finding 724)
  const st = relationStatusView(rel, { alliance: dipl.hasTreaty?.(id, 'alliance') === true });
  ctx.font = F(THEME.fontSizeNormal, true);
  let sx = r.x;
  const stTxt = `[ ${t(st.key, ...st.args)} ]`;
  text(ctx, stTxt, sx, y + THEME.fontSizeNormal, roles[st.tone]);
  sx += ctx.measureText(stTxt).width + 12;
  if (st.alliance) {
    const al = `[ ${t('treaty.alliance').toUpperCase()} ]`;
    text(ctx, al, sx, y + THEME.fontSizeNormal, roles.primary);
  }
  const stance = isContact ? t(stanceLabelKey(data.emp.fsm?.state ?? 'IDLE')) : INTEL_MASK;
  ctx.font = F(THEME.fontSizeSmall);
  const stW = ctx.measureText(stance).width;
  text(ctx, stance, r.x + r.w, y + THEME.fontSizeNormal, isContact ? roles.primary : roles.dim, null, 'right');
  text(ctx, t('diplo.aiStance').toUpperCase(), r.x + r.w - stW - 10, y + THEME.fontSizeNormal, roles.dim, null, 'right');
  y += THEME.fontSizeNormal + 22;

  // instrumenty: opinia (−100…+100) | napięcie (0…100)
  const gap = 28, cw = Math.floor((r.w - gap) / 2);
  const opinion = dipl.getOpinionOfPlayer(id);
  const band = dipl.getOpinionBand(id);
  const opVal = isContact ? `${opinion > 0 ? '+' : ''}${Math.round(opinion)}` : INTEL_MASK;
  const i1 = drawInstrument(ctx, r.x, y, roles, { label: t('diplo.opinionLabel'), value: opVal, tone: isContact ? opinionTone(opinion) : 'dim' });
  const tension = rel.tension ?? 0;
  const i2 = drawInstrument(ctx, r.x + cw + gap, y, roles, { label: t('diplo.tensionFull'), value: String(Math.round(tension)), unit: '/ 100',
    tone: tensionTone(tension) });
  let by = y + Math.max(i1.h, i2.h) + 4;
  ctx.font = F(THEME.fontSizeSmall);
  text(ctx, isContact ? t(`diplo.status.${band}`) : INTEL_MASK, r.x, by + 10, isContact ? roles[opinionTone(opinion)] : roles.dim);
  by += 22;
  if (isContact) scaleBar(ctx, r.x, by, cw, opinionFrac(opinion), roles, { tone: opinionTone(opinion), from: 0.5, ticks: [0, 0.5, 1] });
  else drawBar(ctx, r.x, by, cw, 0, roles, { h: DV.SCALE_H });
  scaleBar(ctx, r.x + cw + gap, by, cw, tensionFrac(tension), roles, { tone: tensionTone(tension), from: 0, ticks: [0.4, 0.6, 0.8] });
  ctx.font = F(THEME.fontSizeSmall);
  const ly = by + DV.SCALE_H + 16;
  text(ctx, '−100', r.x, ly, roles.dim); text(ctx, '0', r.x + cw / 2, ly, roles.dim, null, 'center'); text(ctx, '+100', r.x + cw, ly, roles.dim, null, 'right');
  text(ctx, '0', r.x + cw + gap, ly, roles.dim); text(ctx, '100', r.x + cw + gap + cw, ly, roles.dim, null, 'right');
  y = ly + 26;

  // mini-mapa K0b-1 (ta sama mgła: znane układy z rekordu wywiadu + układy gracza)
  const mapRect = { x: r.x, y, w: r.w, h: r.y + r.h - y };
  if (mapRect.h >= DV.MAP_MIN_H) {
    const playerCols = K?.colonyManager?.getPlayerColonies?.() ?? [];
    const mineIds = new Set(playerCols.map((c) => c.systemId ?? 'sys_home'));
    const homeId = K?.galaxyData?.systems?.find((s) => s?.isHome === true)?.id ?? HOME_SYSTEM_ID;
    const pts = systemMapPoints({ known: d.systems, mineIds, posOf: data.galaxySys, homeId });
    drawEmpireMiniMap(ctx, mapRect, pts, roles);
  }
  ctx.restore();
}

function drawInspector(ov, ctx, z, data, roles, hz, treatyNameKey, K) {
  const { dipl, id, rel, isContact } = data;
  const iz = z.inspector, x = iz.x, w = iz.w;
  const KIT = CONSOLE_KIT;
  // akcje przypięte do DOŁU inspektora (nad klastrem zegara — strefa kończy się nad nim, Finding 727)
  const vMgr = K?.vesselManager;
  const civTrade = K?.civilianTradeSystem;
  const hasPact = dipl.hasTreaty(id, 'non_aggression');
  const actions = diplomacyActions({
    empireId: id, rel, isContact,
    hasEnvoyVessel: !!vMgr?.getAllVessels?.().find((v) => v.status === 'idle' && canDoEnvoy(v)),
    hasTreaty: (tid) => dipl.hasTreaty(id, tid),
    canRenewPact: isContact && dipl.canRenewTreaty?.(id, 'non_aggression') === true,
    pactLeft: hasPact ? dipl.getTreatyYearsLeft?.(id, 'non_aggression') : null,
    pactRefusalLeft: dipl.getRefusalYearsLeft?.(id, 'non_aggression') ?? 0,
    napWindowYears: NAP_RENEW_WINDOW_YEARS,
    autoTradeOn: civTrade?.isCrossEmpireTradeEnabled?.(id) ?? true,
  }, t);
  const actH = KIT.EYEBROW_H + 2 + actions.length * (KIT.CHIP_H + KIT.CHIP_GAP);
  const actY = iz.y + iz.h - actH;

  ctx.save();
  ctx.beginPath(); ctx.rect(iz.x, iz.y, iz.w, Math.max(0, actY - 8 - iz.y)); ctx.clip();
  ctx.textBaseline = 'middle';
  let y = iz.y + drawZoneRule(ctx, iz, t('diplo.console.file'), roles) + 6;
  const dimLine = (s, yy, tone = 'dim') => { text(ctx, s, x, yy + 8, roles[tone] ?? roles.dim, F(THEME.fontSizeSmall)); return DV.LINE_H; };
  // rozbicie opinii — TOP N po |wartości| (dziś: od kontaktu; poniżej „(brak)”)
  y += drawEyebrow(ctx, x, y, w, t('diplo.opinionBreakdown'), roles) + 2;
  const breakdown = isContact ? dipl.getOpinionBreakdown(id, 'player') : [];
  if (!breakdown.length) y += dimLine(t('diplo.none').trim(), y);
  else {
    for (const e of breakdown.slice(0, DIPLO_CONSOLE.MAX_BREAKDOWN_ROWS)) {
      const fade = e.yearsLeft === Infinity ? '∞' : t('diplo.fadesIn', Math.max(1, e.yearsLeft).toFixed(0));
      y += drawKvRow(ctx, x, y, w, e.label, `${e.value > 0 ? '+' : ''}${Math.round(e.value)}`, roles,
        { tone: e.value >= 0 ? 'primary' : 'alert', unit: fade });
    }
    const rest = breakdown.length - DIPLO_CONSOLE.MAX_BREAKDOWN_ROWS;
    if (rest > 0) y += dimLine(t('diplo.breakdownMore', String(rest)).trim(), y);
  }
  y += 10;
  // traktaty (+ reparacje)
  y += drawEyebrow(ctx, x, y, w, t('diplo.treaties'), roles) + 2;
  const treaties = rel.treaties ?? [];
  if (!treaties.length) y += dimLine(t('diplo.noTreaties').trim(), y);
  for (const tr of treaties) {
    const nameKey = treatyNameKey[tr.id];
    const name = nameKey ? t(nameKey) : (tr.id ?? '?');
    const expires = treatyExpiryYear(tr);
    const until = expires == null ? '' : ', ' + t('diplo.treatyUntil', Math.round(expires));
    const line = t('diplo.treatyItem', name, (tr.signedYear ?? 0).toFixed(0), until).trim();
    y += dimLine(truncateText(line, w, fits(ctx)), y, 'primary');
  }
  if (rel.reparationsUntilYear != null) y += dimLine(`⚙ ${t('diplo.reparationsUntil', Math.round(rel.reparationsUntilYear))}`, y, 'alert');
  y += 10;
  // pamięć relacji — 3 najnowsze, etykiety (Finding 724)
  y += drawEyebrow(ctx, x, y, w, t('diplo.memory'), roles) + 2;
  const mem = rel.memory ?? [];
  if (!mem.length) y += dimLine(t('diplo.none').trim(), y);
  else for (const ev of mem.slice(-DIPLO_CONSOLE.MEMORY_ROWS).reverse()) {
    y += drawKvRow(ctx, x, y, w, t(memoryLabelKey(ev.type)), (ev.year ?? 0).toFixed(0), roles, { tone: 'dim' });
  }
  ctx.restore();

  // akcje: czipy z dzisiejszymi typami stref; wyłączone — strefa podpowiedzi z powodem
  let ay = actY + drawEyebrow(ctx, x, actY, w, t('diplo.console.actions'), roles) + 2;
  for (const a of actions) {
    const hover = a.enabled ? hz?.type === a.type && hz.y === ay : hz?.type === 'action_blocked' && hz.y === ay;
    const r = drawActionChip(ctx, x, ay, w, roles, { label: a.label, enabled: a.enabled, danger: a.tone === 'danger', hover });
    if (a.enabled) ov._addHit(r.x, r.y, r.w, r.h, a.type, a.data);
    else {
      ov._addHit(r.x, r.y, r.w, r.h, 'action_blocked', { action: a.type, reason: a.reason });
      if (hover && a.reason) ov._consoleTooltip = { x: r.x, y: r.y + r.h + 2, text: a.reason };
    }
    ay += KIT.CHIP_H + KIT.CHIP_GAP;
  }
}

function drawStrip(ctx, sr, data, ultimatum, flash, roles) {
  let y = sr.y + drawZoneRule(ctx, sr, t('diplo.console.notices'), roles) + 2;
  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.font = F(THEME.fontSizeSmall, true);
  if (ultimatum) {
    const remaining = data.dipl.getUltimatumYearsLeft?.(data.id) ?? 0;
    text(ctx, t('diplo.ultimatumWarn', remaining.toFixed(1)), sr.x, y + 7, roles.alert);
    y += DV.LINE_H;
  }
  if (flash) text(ctx, flash.text, sr.x, y + 7, roles[flashTone(flash.color)]);
  ctx.restore();
}
