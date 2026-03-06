// CivPanelDrawer — ekstrakcja logiki rysowania CivPanel z UIManager
//
// Czyste funkcje importowane przez UIManager i PlanetGlobeScene.
// Rysuje sidebar + 5 zakładek: Gospodarka, Populacja, Technologie, Budowle, Ekspedycje.

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS, RESOURCE_ICONS, formatRates, formatCost } from '../data/BuildingsData.js';
import { SHIPS }            from '../data/ShipsData.js';
import { COMMODITIES, COMMODITY_SHORT } from '../data/CommoditiesData.js';
import { showTransportModal } from '../ui/TransportModal.js';
import EventBus              from '../core/EventBus.js';

// ── Stałe ──────────────────────────────────────────────────
export const CIV_SIDEBAR_W    = 40;
export const CIV_SIDEBAR_BTN  = 36;
export const CIV_SIDEBAR_GAP  = 2;
export const CIV_SIDEBAR_PAD  = 2;
export const CIV_PANEL_BODY_H = 280;

export const CIV_TABS = [
  { id: 'economy',     icon: '⚙', label: 'Gospodarka' },
  { id: 'population',  icon: '👤', label: 'Populacja' },
  { id: 'tech',        icon: '🧬', label: 'Technologie' },
  { id: 'buildings',   icon: '🔧', label: 'Budowle' },
  { id: 'fleet', icon: '🚀', label: 'Flota' },
];

const MORALE_MAX = { housing: 20, food: 20, water: 15, energy: 15, employment: 15, safety: 15 };
const MORALE_LABELS = {
  housing: '🏠 Mieszkania', food: '🌿 Żywność', water: '💧 Woda',
  energy: '⚡ Energia', employment: '👷 Zatrudnienie', safety: '🛡 Bezpiecz.',
};

const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get green()  { return THEME.success; },
  get red()    { return THEME.danger; },
  get orange() { return THEME.warning; },
  get yellow() { return THEME.yellow; },
  get blue()   { return THEME.info; },
  get purple() { return THEME.purple; },
  get mint()   { return THEME.mint; },
  get dim()    { return THEME.textDim; },
};

function _fmtNum(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

function _shortYear(y) {
  if (y >= 1e9)  return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6)  return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  return String(Math.floor(y));
}

// ── Sidebar ────────────────────────────────────────────────
export function drawCivPanelSidebar(ctx, panelY, activeTab) {
  const sx = 0;
  const sy = panelY;
  const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                 + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;

  ctx.fillStyle = bgAlpha(0.92);
  ctx.fillRect(sx, sy, CIV_SIDEBAR_W, sidebarH);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + CIV_SIDEBAR_W, sy);
  ctx.lineTo(sx + CIV_SIDEBAR_W, sy + sidebarH);
  ctx.stroke();

  CIV_TABS.forEach((tab, i) => {
    const btnY = sy + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
    const active = activeTab === tab.id;

    const _bAc = hexToRgb(THEME.borderActive);
    const _bPr = hexToRgb(THEME.bgPrimary);
    ctx.fillStyle = active
      ? `rgba(${_bAc.r},${_bAc.g},${_bAc.b},0.35)`
      : `rgba(${_bPr.r},${_bPr.g},${_bPr.b},0.80)`;
    ctx.fillRect(sx, btnY, CIV_SIDEBAR_W, CIV_SIDEBAR_BTN);

    if (active) {
      ctx.fillStyle = THEME.info;
      ctx.fillRect(sx, btnY, 3, CIV_SIDEBAR_BTN);
    }

    ctx.font = `${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? C.bright : C.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab.icon, sx + CIV_SIDEBAR_W / 2, btnY + CIV_SIDEBAR_BTN / 2);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Tło panelu treści ──────────────────────────────────────
export function drawCivPanelBody(ctx, bodyX, bodyY, bodyW, bodyH) {
  ctx.fillStyle = bgAlpha(0.88);
  ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bodyX, bodyY + bodyH); ctx.lineTo(bodyX + bodyW, bodyY + bodyH); ctx.stroke();
}

// ── Hit test sidebar ───────────────────────────────────────
export function hitTestSidebar(x, y, panelY) {
  const sidebarH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                 + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;

  if (x >= 0 && x <= CIV_SIDEBAR_W && y >= panelY && y <= panelY + sidebarH) {
    for (let i = 0; i < CIV_TABS.length; i++) {
      const btnY = panelY + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
      if (y >= btnY && y <= btnY + CIV_SIDEBAR_BTN) {
        return CIV_TABS[i].id;
      }
    }
    return 'sidebar'; // klik w sidebar ale nie na przycisk
  }
  return null;
}

// ── Mini pasek (reusable) ──────────────────────────────────
export function drawMiniBar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = THEME.bgTertiary;
  ctx.fillRect(x, y, w, h);
  const fillW = Math.round(Math.max(0, Math.min(1, frac)) * w);
  if (fillW > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, fillW, h);
  }
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}

// ── Zakładki (eksport dla UIManager) ──────────────────────
// Każda zwraca hit-rects (przyciski fabryk, tech, itp.)

export function drawEconomyTab(ctx, bodyY, bodyX, bodyW, state) {
  const { inventory, invPerYear, energyFlow, factoryData } = state;
  const colW = Math.floor(bodyW / 3);
  const PAD = 10;
  const LH = 13;
  const factoryBtns = [];

  const inv = inventory || {};
  const perYear = invPerYear || {};

  // ── Kolumna 1: SUROWCE ──
  const x1 = bodyX + PAD;
  let y1 = bodyY + 14;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText('SUROWCE', x1, y1);
  y1 += LH + 2;

  const ALL_RES = [
    { id: 'Fe', label: 'Fe Żelazo' }, { id: 'C', label: 'C  Węgiel' },
    { id: 'Si', label: 'Si Krzem' }, { id: 'Cu', label: 'Cu Miedź' },
    { id: 'Ti', label: 'Ti Tytan' }, { id: 'Li', label: 'Li Lit' },
    { id: 'W', label: 'W  Wolfram' }, { id: 'Pt', label: 'Pt Platyna' },
    { id: 'Xe', label: 'Xe Ksenon' }, { id: 'Nt', label: 'Nt Neutr.' },
    { id: 'food', label: '🍖 Żywność' }, { id: 'water', label: '💧 Woda' },
  ];

  for (const r of ALL_RES) {
    const amt = inv[r.id] ?? 0;
    const dlt = perYear[r.id] ?? 0;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    ctx.fillText(r.label, x1, y1);
    ctx.fillStyle = amt < 1 ? C.dim : C.bright;
    ctx.fillText(_fmtNum(amt), x1 + 80, y1);
    if (Math.abs(dlt) > 0.01) {
      ctx.fillStyle = dlt >= 0 ? THEME.successDim : THEME.dangerDim;
      ctx.fillText(`${dlt >= 0 ? '+' : ''}${dlt.toFixed(1)}`, x1 + 120, y1);
    }
    y1 += LH;
  }

  // ── Kolumna 2: TOWARY + ENERGIA ──
  const x2 = bodyX + colW + PAD;
  let y2 = bodyY + 14;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText('TOWARY', x2, y2);
  y2 += LH + 2;

  const COMM_LIST = [
    'steel_plates', 'polymer_composites', 'concrete_mix', 'copper_wiring',
    'power_cells', 'electronics', 'food_synthesizers', 'mining_drills', 'hull_armor',
    'habitat_modules', 'water_recyclers', 'robots',
    'prefab_mine', 'prefab_solar_farm', 'prefab_habitat', 'prefab_autonomous_mine',
    'semiconductors', 'ion_thrusters', 'fusion_cores', 'nanotech_filters',
    'quantum_cores', 'antimatter_cells',
  ];

  for (const cid of COMM_LIST) {
    const def = COMMODITIES[cid];
    const amt = inv[cid] ?? 0;
    const icon = def?.icon ?? '📦';
    const name = COMMODITY_SHORT[cid] ?? cid;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    ctx.fillText(`${icon} ${name}`, x2, y2);
    ctx.fillStyle = amt < 1 ? C.dim : C.bright;
    ctx.fillText(`${Math.floor(amt)}`, x2 + 90, y2);
    // Hit rect do tooltipa (commodity info)
    factoryBtns.push({ x: x2, y: y2 - 10, w: colW - PAD * 2, h: LH, commodityId: cid, isTooltipOnly: true });
    y2 += LH;
  }

  // Separator + Energia
  y2 += 4;
  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x2, y2 - 2); ctx.lineTo(x2 + colW - PAD * 2, y2 - 2); ctx.stroke();
  y2 += 4;

  const ef = energyFlow || {};
  if (ef.brownout) {
    ctx.fillStyle = 'rgba(100,0,0,0.25)';
    ctx.fillRect(x2 - 4, y2 - 6, colW - PAD, 38);
  }
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = ef.brownout ? C.red : C.title;
  ctx.fillText(`⚡ ENERGIA${ef.brownout ? ' ⚠ BROWNOUT!' : ''}`, x2, y2);
  y2 += LH + 2;
  ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.successDim;
  ctx.fillText(`Produkcja:  +${_fmtNum(ef.production ?? 0)}/r`, x2, y2);
  y2 += LH;
  ctx.fillStyle = THEME.dangerDim;
  ctx.fillText(`Konsumpcja: -${_fmtNum(ef.consumption ?? 0)}/r`, x2, y2);
  y2 += LH;
  const bal = ef.balance ?? 0;
  ctx.fillStyle = bal >= 0 ? THEME.successDim : THEME.danger;
  ctx.fillText(`Bilans:     ${bal >= 0 ? '+' : ''}${_fmtNum(bal)}/r`, x2, y2);

  // ── Kolumna 3: FABRYKI ──
  const x3 = bodyX + colW * 2 + PAD;
  let y3 = bodyY + 14;
  const fd = factoryData ?? window.KOSMOS?.factorySystem;
  const totalPts = fd?.totalPoints ?? 0;
  const usedPts = fd?.usedPoints ?? 0;
  const freePts = fd?.freePoints ?? (totalPts - usedPts);

  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText(`🏭 FABRYKI [${usedPts}/${totalPts}]`, x3, y3);
  y3 += LH + 4;

  if (totalPts <= 0) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.dim;
    ctx.fillText('Brak fabryk', x3, y3);
    y3 += LH;
    ctx.fillText('Zbuduj Fabrykę', x3, y3);
    ctx.fillText('(wymaga Metalurgia)', x3, y3 + LH);
  } else {
    const allocs = factoryData?.allocations
      ?? window.KOSMOS?.factorySystem?.getAllocations?.() ?? [];
    const barW = Math.max(40, colW - PAD * 2 - 60);

    for (const a of allocs) {
      const icon = a.icon ?? COMMODITIES[a.commodityId]?.icon ?? '📦';
      const name = COMMODITY_SHORT[a.commodityId] ?? a.namePL ?? a.commodityId;
      const pct = Math.min(100, a.pctComplete ?? 0);
      const produced = a.produced ?? 0;
      const targetQty = a.targetQty;
      const targetDone = targetQty !== null && produced >= targetQty;

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = targetDone ? THEME.successDim : a.paused ? THEME.dangerDim : C.bright;
      // Nazwa + licznik produced/target
      const targetStr = targetQty !== null ? ` ${produced}/${targetQty}` : (produced > 0 ? ` ×${produced}` : '');
      ctx.fillText(`${icon} ${name}${targetStr}`, x3, y3);

      const btnSize = 14;
      const btnY = y3 - 9;
      const plusBtnX = x3 + colW - PAD * 2 - btnSize;
      const minusBtnX = plusBtnX - btnSize - 4;
      // Przycisk celu (target) — przed [-] i [+]
      // Gdy target aktywny: [✕] do wyzerowania + [🎯+10]
      const targetBtnSize = btnSize;
      const clearBtnX = targetQty !== null ? (minusBtnX - btnSize - 4 - btnSize - 2) : 0;
      const targetBtnX = minusBtnX - btnSize - 4;

      // [✕] — wyczyść target (tylko gdy aktywny)
      if (targetQty !== null) {
        ctx.fillStyle = 'rgba(80,30,30,0.8)';
        ctx.fillRect(clearBtnX, btnY, targetBtnSize, targetBtnSize);
        ctx.strokeStyle = THEME.dangerDim;
        ctx.strokeRect(clearBtnX, btnY, targetBtnSize, targetBtnSize);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.danger;
        ctx.textAlign = 'center';
        ctx.fillText('✕', clearBtnX + targetBtnSize / 2, btnY + targetBtnSize - 3);
      }

      // [🎯] — dodaj +10 do target
      ctx.fillStyle = targetQty !== null ? 'rgba(80,60,20,0.8)' : 'rgba(30,30,15,0.5)';
      ctx.fillRect(targetBtnX, btnY, targetBtnSize, targetBtnSize);
      ctx.strokeStyle = targetQty !== null ? THEME.warning : THEME.textLabel;
      ctx.strokeRect(targetBtnX, btnY, targetBtnSize, targetBtnSize);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = targetQty !== null ? THEME.warning : THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('🎯', targetBtnX + targetBtnSize / 2, btnY + targetBtnSize - 3);

      // [-]
      ctx.fillStyle = a.points > 0 ? 'rgba(100,40,40,0.8)' : 'rgba(30,15,15,0.5)';
      ctx.fillRect(minusBtnX, btnY, btnSize, btnSize);
      ctx.strokeStyle = a.points > 0 ? THEME.dangerDim : THEME.textLabel;
      ctx.strokeRect(minusBtnX, btnY, btnSize, btnSize);
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = a.points > 0 ? THEME.warning : THEME.textLabel;
      ctx.fillText('−', minusBtnX + btnSize / 2, btnY + btnSize - 3);

      // [+]
      ctx.fillStyle = freePts > 0 ? 'rgba(30,80,50,0.8)' : 'rgba(15,30,15,0.5)';
      ctx.fillRect(plusBtnX, btnY, btnSize, btnSize);
      ctx.strokeStyle = freePts > 0 ? THEME.successDim : THEME.textLabel;
      ctx.strokeRect(plusBtnX, btnY, btnSize, btnSize);
      ctx.fillStyle = freePts > 0 ? THEME.accent : THEME.textLabel;
      ctx.fillText('+', plusBtnX + btnSize / 2, btnY + btnSize - 3);
      ctx.textAlign = 'left';

      factoryBtns.push(
        { x: targetBtnX, y: btnY, w: targetBtnSize, h: targetBtnSize, commodityId: a.commodityId, action: 'setTarget' },
        { x: minusBtnX, y: btnY, w: btnSize, h: btnSize, commodityId: a.commodityId, delta: -1 },
        { x: plusBtnX, y: btnY, w: btnSize, h: btnSize, commodityId: a.commodityId, delta: +1 },
      );
      // Przycisk [✕] czyszczenia targetu (tylko gdy aktywny)
      if (targetQty !== null) {
        factoryBtns.push(
          { x: clearBtnX, y: btnY, w: targetBtnSize, h: targetBtnSize, commodityId: a.commodityId, action: 'clearTarget' },
        );
      }

      y3 += LH + 2;

      // Pasek postępu
      const barX = x3;
      const barY2 = y3 - 8;
      const barH = 7;
      const fillW = Math.max(0, Math.round(barW * pct / 100));
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(barX, barY2, barW, barH);
      ctx.fillStyle = targetDone ? THEME.successDim : a.paused ? THEME.dangerDim : THEME.successDim;
      ctx.fillRect(barX, barY2, fillW, barH);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(barX, barY2, barW, barH);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.text;
      ctx.fillText(`${Math.round(pct)}% (${a.points}pkt)`, barX + barW + 4, y3 - 1);
      y3 += LH;
    }

    // Kolejka produkcji
    const queue = window.KOSMOS?.factorySystem?.getQueue?.() ?? [];
    if (queue.length > 0) {
      y3 += 4;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.fillText(`📋 KOLEJKA (${queue.length}):`, x3, y3);
      y3 += LH;

      for (let qi = 0; qi < queue.length; qi++) {
        const q = queue[qi];
        const qicon = COMMODITIES[q.commodityId]?.icon ?? '📦';
        const qname = COMMODITY_SHORT[q.commodityId] ?? q.commodityId;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = C.text;
        ctx.fillText(`${qi + 1}. ${qicon} ${qname} ×${q.qty}`, x3, y3);

        // Przyciski kolejki: [↑] [↓] [✕]
        const qBtnSize = 12;
        const qy = y3 - 8;
        const delX = x3 + colW - PAD * 2 - qBtnSize;
        const downX = delX - qBtnSize - 2;
        const upX = downX - qBtnSize - 2;

        // [↑]
        if (qi > 0) {
          ctx.fillStyle = 'rgba(20,40,60,0.7)'; ctx.fillRect(upX, qy, qBtnSize, qBtnSize);
          ctx.strokeStyle = THEME.textLabel; ctx.strokeRect(upX, qy, qBtnSize, qBtnSize);
          ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
          ctx.fillText('↑', upX + qBtnSize / 2, qy + qBtnSize - 2);
          factoryBtns.push({ x: upX, y: qy, w: qBtnSize, h: qBtnSize, action: 'queueUp', queueIndex: qi });
        }
        // [↓]
        if (qi < queue.length - 1) {
          ctx.fillStyle = 'rgba(20,40,60,0.7)'; ctx.fillRect(downX, qy, qBtnSize, qBtnSize);
          ctx.strokeStyle = THEME.textLabel; ctx.strokeRect(downX, qy, qBtnSize, qBtnSize);
          ctx.fillStyle = THEME.textPrimary; ctx.textAlign = 'center';
          ctx.fillText('↓', downX + qBtnSize / 2, qy + qBtnSize - 2);
          factoryBtns.push({ x: downX, y: qy, w: qBtnSize, h: qBtnSize, action: 'queueDown', queueIndex: qi });
        }
        // [✕]
        ctx.fillStyle = 'rgba(80,20,20,0.7)'; ctx.fillRect(delX, qy, qBtnSize, qBtnSize);
        ctx.strokeStyle = THEME.dangerDim; ctx.strokeRect(delX, qy, qBtnSize, qBtnSize);
        ctx.fillStyle = THEME.warning;
        ctx.fillText('✕', delX + qBtnSize / 2, qy + qBtnSize - 2);
        ctx.textAlign = 'left';
        factoryBtns.push({ x: delX, y: qy, w: qBtnSize, h: qBtnSize, action: 'dequeue', queueIndex: qi });

        y3 += LH;
      }
    }

    // Dodaj produkcję / Do kolejki
    if (freePts > 0 || allocs.length > 0) {
      y3 += 4;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.dim;
      ctx.fillText(freePts > 0 ? '+ Dodaj produkcję:' : '+ Do kolejki:', x3, y3);
      y3 += LH;

      const allocIds = new Set(allocs.map(a => a.commodityId));
      const available = Object.keys(COMMODITIES).filter(id => !allocIds.has(id));
      for (const cid of available) {
        const cicon = COMMODITIES[cid]?.icon ?? '';
        const cname = COMMODITY_SHORT[cid] ?? cid;
        const clabel = `${cicon} ${cname}`;
        const tw = Math.min(colW - PAD * 2, ctx.measureText(clabel).width + 12);
        ctx.fillStyle = freePts > 0 ? 'rgba(20,40,60,0.7)' : 'rgba(30,30,15,0.5)';
        ctx.fillRect(x3, y3 - 9, tw, 13);
        ctx.strokeStyle = freePts > 0 ? THEME.borderActive : THEME.textLabel;
        ctx.strokeRect(x3, y3 - 9, tw, 13);
        ctx.fillStyle = freePts > 0 ? C.blue : THEME.warning;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillText(clabel, x3 + 4, y3);
        // Jeśli free pts → alokuj od razu; jeśli nie → dodaj do kolejki
        if (freePts > 0) {
          factoryBtns.push({ x: x3, y: y3 - 9, w: tw, h: 13, commodityId: cid, delta: +1 });
        } else {
          factoryBtns.push({ x: x3, y: y3 - 9, w: tw, h: 13, commodityId: cid, action: 'enqueue' });
        }
        y3 += 16;
      }
    }
  }

  return factoryBtns;
}

// ── Populacja ──────────────────────────────────────────────
export function drawPopulationTab(ctx, bodyY, bodyX, bodyW, state) {
  const { civData, moraleData } = state;
  const civ = window.KOSMOS?.civSystem;
  const colW = Math.floor(bodyW / 2);
  const PAD = 14;
  const LH = 14;

  // Kolumna 1: Populacja
  const x1 = bodyX + PAD;
  let y1 = bodyY + 14;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText('POPULACJA', x1, y1);
  y1 += LH + 4;

  const pop = civ?.population ?? 0;
  const housing = civ?.housing ?? 0;
  const gp = civData?.growthProgress ?? 0;
  const freePop = civData?.freePops ?? 0;
  const empPop = civData?.employedPops ?? 0;
  const lockPop = civData?.lockedPops ?? 0;
  const epoch = civData?.epoch ?? civ?.epochName ?? '—';
  const isUnrest = civData?.isUnrest ?? false;
  const isFamine = civData?.isFamine ?? false;

  ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.bright;
  ctx.fillText(`👤 POP: ${pop} / ${housing}`, x1, y1);
  y1 += LH + 4;

  ctx.fillStyle = C.text;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillText('Wzrost:', x1, y1);
  drawMiniBar(ctx, x1 + 60, y1 - 8, 100, 8, gp, THEME.successDim);
  ctx.fillStyle = C.text;
  ctx.fillText(`${Math.round(gp * 100)}%`, x1 + 166, y1);
  y1 += LH + 4;

  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`Epoka: ${epoch}`, x1, y1);
  y1 += LH + 4;

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x1, y1 - 2); ctx.lineTo(x1 + colW - PAD * 2, y1 - 2); ctx.stroke();
  y1 += 4;

  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.text;
  ctx.fillText(`Wolni:      ${freePop.toFixed(2)}`, x1, y1); y1 += LH;
  ctx.fillText(`Zatrudnieni: ${empPop.toFixed(2)}`, x1, y1); y1 += LH;
  ctx.fillText(`Zablokowani: ${lockPop.toFixed(2)}`, x1, y1); y1 += LH + 8;

  if (isUnrest) { ctx.fillStyle = C.red; ctx.fillText('⚠ NIEPOKOJE SPOŁECZNE!', x1, y1); y1 += LH + 2; }
  if (isFamine) { ctx.fillStyle = C.orange; ctx.fillText('⚠ GŁÓD W KOLONII!', x1, y1); }

  // Kolumna 2: Morale
  const x2 = bodyX + colW + PAD;
  let y2 = bodyY + 14;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText('MORALE', x2, y2);
  y2 += LH + 4;

  const morale = Math.round(civ?.morale ?? 50);
  const mColor = morale >= 60 ? C.green : morale >= 30 ? C.orange : C.red;
  ctx.font = '14px monospace';
  ctx.fillStyle = mColor;
  ctx.fillText(`${morale}%`, x2, y2);
  drawMiniBar(ctx, x2 + 50, y2 - 9, 120, 9, morale / 100, mColor);
  y2 += LH + 8;

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x2, y2 - 2); ctx.lineTo(x2 + colW - PAD * 2, y2 - 2); ctx.stroke();
  y2 += 4;

  const comp = moraleData?.components ?? civ?.moraleComponents ?? {};
  for (const key of ['housing', 'food', 'water', 'energy', 'employment', 'safety']) {
    const val = comp[key] ?? 0;
    const max = MORALE_MAX[key];
    const frac = max > 0 ? val / max : 0;
    const cmpColor = frac >= 0.6 ? C.green : frac >= 0.3 ? C.orange : C.red;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    ctx.fillText(MORALE_LABELS[key] ?? key, x2, y2);
    ctx.fillStyle = cmpColor;
    ctx.fillText(`${val}/${max}`, x2 + 110, y2);
    drawMiniBar(ctx, x2 + 146, y2 - 6, 60, 6, frac, cmpColor);
    y2 += LH + 2;
  }
}

// ── Technologie ────────────────────────────────────────────
export function drawTechTab(ctx, bodyY, bodyX, bodyW) {
  const tSys = window.KOSMOS?.techSystem;
  const branches = Object.entries(TECH_BRANCHES);
  const colW = Math.floor(bodyW / branches.length);
  const PAD = 8;

  branches.forEach(([branchId, branch], bi) => {
    const bx = bodyX + bi * colW + PAD;
    let by = bodyY + 16;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = branch.color;
    ctx.fillText(`${branch.icon} ${branch.namePL}`, bx, by);
    by += 4;

    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + colW - PAD * 2, by); ctx.stroke();
    by += 10;

    const techs = Object.values(TECHS)
      .filter(t => t.branch === branchId)
      .sort((a, b) => a.tier - b.tier);

    techs.forEach(tech => {
      const researched = tSys?.isResearched(tech.id) ?? false;
      const available = !researched && tech.requires.every(r => tSys?.isResearched(r) ?? false);

      let statusIcon, statusColor;
      if (researched) { statusIcon = '✅'; statusColor = C.green; }
      else if (available) { statusIcon = '🔓'; statusColor = C.yellow; }
      else { statusIcon = '🔒'; statusColor = THEME.textDim; }

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = statusColor;
      ctx.fillText(`${statusIcon} ${_truncate(tech.namePL, 14)}`, bx, by);
      by += 12;

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      if (researched) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(_truncate(techEffectSummary(tech), 20), bx + 10, by);
      } else {
        ctx.fillStyle = available ? C.yellow : THEME.textLabel;
        ctx.fillText(`${tech.cost.research} 🔬`, bx + 10, by);
      }
      by += 14;
    });
  });
}

// ── Budowle ────────────────────────────────────────────────
export function drawBuildingsTab(ctx, bodyY, bodyX, bodyW) {
  const bSys = window.KOSMOS?.buildingSystem;
  const active = bSys?._active ?? new Map();
  const PAD = 14;
  const LH = 13;
  let y = bodyY + 16;

  ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText(`INSTALACJE AKTYWNE (${active.size})`, bodyX + PAD, y);
  y += 4;

  ctx.strokeStyle = C.border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + bodyW - PAD, y); ctx.stroke();
  y += 10;

  const { groups, totals } = getBuildingGroups(bSys);
  const icons = RESOURCE_ICONS;
  let rowCount = 0;

  for (const [, g] of groups) {
    if (rowCount >= 9) break;
    const b = g.building;
    const countStr = g.count > 1 ? ` ×${g.count}` : '';

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.fillText(`${b.icon} ${b.namePL}${countStr}`, bodyX + PAD, y);

    const rateStr = formatGroupRates(g.totalRates, icons);
    ctx.fillStyle = C.text;
    ctx.textAlign = 'right';
    ctx.fillText(rateStr, bodyX + bodyW - PAD, y);
    ctx.textAlign = 'left';

    y += LH;
    rowCount++;
  }

  // RAZEM
  y += 2;
  ctx.strokeStyle = C.border;
  ctx.beginPath(); ctx.moveTo(bodyX + PAD, y); ctx.lineTo(bodyX + bodyW - PAD, y); ctx.stroke();
  y += 12;

  ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
  ctx.fillStyle = C.title;
  ctx.fillText('RAZEM:', bodyX + PAD, y);

  let tx = bodyX + PAD + 54;
  for (const r of ['minerals', 'energy', 'organics', 'water', 'research']) {
    if (Math.abs(totals[r]) > 0.01) {
      const v = totals[r];
      ctx.fillStyle = v >= 0 ? THEME.successDim : THEME.dangerDim;
      const text = `${v >= 0 ? '+' : ''}${v.toFixed(1)}${icons[r]}`;
      ctx.fillText(text, tx, y);
      tx += ctx.measureText(text).width + 8;
    }
  }
}

// ── Helper: grupowanie budynków ────────────────────────────
export function getBuildingGroups(bSys) {
  const active = bSys?._active ?? new Map();
  const groups = new Map();
  const totals = { minerals: 0, energy: 0, organics: 0, water: 0, research: 0 };
  for (const [, entry] of active) {
    const bid = entry.building.id;
    if (!groups.has(bid)) {
      groups.set(bid, { count: 0, totalRates: {}, building: entry.building });
    }
    const g = groups.get(bid);
    g.count++;
    for (const [key, val] of Object.entries(entry.effectiveRates)) {
      g.totalRates[key] = (g.totalRates[key] ?? 0) + val;
      if (totals[key] !== undefined) totals[key] += val;
    }
  }
  return { groups, totals };
}

export function formatGroupRates(rates, icons) {
  const parts = [];
  for (const [key, val] of Object.entries(rates)) {
    if (Math.abs(val) < 0.01) continue;
    parts.push(`${val >= 0 ? '+' : ''}${val.toFixed(1)}${icons[key] ?? key}`);
  }
  return parts.join(' ') + '/r';
}

export function techEffectSummary(tech) {
  const parts = [];
  for (const fx of tech.effects) {
    if (fx.type === 'modifier') {
      const icon = RESOURCE_ICONS[fx.resource] ?? fx.resource;
      parts.push(`+${Math.round((fx.multiplier - 1) * 100)}%${icon}`);
    } else if (fx.type === 'unlockBuilding') {
      const b = BUILDINGS[fx.buildingId];
      parts.push(`→${b?.namePL ?? fx.buildingId}`);
    } else if (fx.type === 'unlockShip') {
      const s = SHIPS[fx.shipId];
      parts.push(`→${s?.icon ?? '🚀'}${s?.namePL ?? fx.shipId}`);
    } else if (fx.type === 'moraleBonus') {
      parts.push(`+${fx.amount} mor.`);
    } else if (fx.type === 'popGrowthBonus') {
      parts.push(`+${Math.round((fx.multiplier - 1) * 100)}% wzr.`);
    } else if (fx.type === 'consumptionMultiplier') {
      const icon = RESOURCE_ICONS[fx.resource] ?? fx.resource;
      parts.push(`${Math.round((fx.multiplier - 1) * 100)}%${icon}`);
    }
  }
  return parts.join(' ');
}

// ── Hit test technologii ───────────────────────────────────
export function handleTechClick(x, y, bodyY, bodyX, bodyW) {
  const tSys = window.KOSMOS?.techSystem;
  if (!tSys) return false;

  const branches = Object.entries(TECH_BRANCHES);
  const colW = Math.floor(bodyW / branches.length);
  const PAD = 8;

  for (let bi = 0; bi < branches.length; bi++) {
    const [branchId] = branches[bi];
    const bx = bodyX + bi * colW + PAD;
    const techs = Object.values(TECHS)
      .filter(t => t.branch === branchId)
      .sort((a, b) => a.tier - b.tier);

    let by = bodyY + 30;
    for (const tech of techs) {
      const rowH = 26;
      if (x >= bx && x <= bx + colW - PAD * 2 && y >= by - 10 && y <= by + rowH - 10) {
        const researched = tSys.isResearched(tech.id);
        const available = !researched && tech.requires.every(r => tSys.isResearched(r));
        if (available) {
          EventBus.emit('tech:researchRequest', { techId: tech.id });
        }
        return true;
      }
      by += rowH;
    }
  }
  return false;
}

// ── Hit test fabryk ────────────────────────────────────────
export function handleFactoryClick(x, y, factoryBtns) {
  for (const btn of factoryBtns) {
    if (btn.isTooltipOnly) continue; // Pomiń hit recty tylko do tooltipa
    if (x >= btn.x && x <= btn.x + btn.w && y >= btn.y && y <= btn.y + btn.h) {
      const fSys = window.KOSMOS?.factorySystem;
      if (!fSys) return false;

      // Obsługa akcji kolejki i targetu
      if (btn.action === 'setTarget') {
        const alloc = fSys._allocations.get(btn.commodityId);
        const curTarget = alloc?.targetQty;
        // Dodaj +10 za każdym kliknięciem; null → 10, potem +10
        const newTarget = (curTarget === null) ? 10 : curTarget + 10;
        EventBus.emit('factory:setTarget', { commodityId: btn.commodityId, qty: newTarget });
        return true;
      }
      if (btn.action === 'clearTarget') {
        EventBus.emit('factory:setTarget', { commodityId: btn.commodityId, qty: null });
        return true;
      }
      if (btn.action === 'enqueue') {
        EventBus.emit('factory:enqueue', { commodityId: btn.commodityId, qty: 10 });
        return true;
      }
      if (btn.action === 'dequeue') {
        EventBus.emit('factory:dequeue', { index: btn.queueIndex });
        return true;
      }
      if (btn.action === 'queueUp') {
        EventBus.emit('factory:reorderQueue', { index: btn.queueIndex, direction: 'up' });
        return true;
      }
      if (btn.action === 'queueDown') {
        EventBus.emit('factory:reorderQueue', { index: btn.queueIndex, direction: 'down' });
        return true;
      }

      // Standardowa zmiana alokacji punktów
      const existing = fSys._allocations.get(btn.commodityId);
      const curPts = existing?.points ?? 0;
      const newPts = Math.max(0, curPts + btn.delta);
      EventBus.emit('factory:allocate', { commodityId: btn.commodityId, points: newPts });
      return true;
    }
  }
  return false;
}
