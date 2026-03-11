// EconomyOverlay — panel Gospodarki (klawisz E)
//
// Trójdzielny overlay: bilans surowców (L), fabryki/handel (C), energia + alerty (R).
// Dane czytane LIVE z ColonyManager / ResourceSystem / FactorySystem.
// Zakładka FABRYKI: filtr kolonii + przegląd (góra) + zarządzanie produkcją (dół).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME }         from '../config/ThemeConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES, ALL_RESOURCES }
                         from '../data/ResourcesData.js';
import { COMMODITIES, formatRecipe, COMMODITY_BY_TIER }
                         from '../data/CommoditiesData.js';
import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';

const LEFT_W   = 220;
const RIGHT_W  = 260;
const CAT_H    = 24;
const ROW_H    = 22;
const TAB_H    = 32;
const FILTER_H = 28;       // wysokość paska filtra kolonii
const BTN_S    = 16;        // mały przycisk 16×16
const MGMT_ROW_H = 32;     // wiersz alokacji w zarządzaniu
const QUEUE_ROW_H = 22;    // wiersz kolejki
const ADD_ROW_H = 20;      // wiersz dostępnego towaru

// ══════════════════════════════════════════════════════════════════════════════
// EconomyOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class EconomyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._centerTab = 'factories'; // 'factories' | 'flows' | 'trade'
    this._scrollLeft = 0;          // scroll lewej kolumny
    this._scrollCenter = 0;        // scroll środkowej kolumny (flows/trade)
    this._scrollRight = 0;         // scroll prawej kolumny (alerty)
    this._collapsed = {            // zwijane kategorie lewej kolumny
      mined: false,
      harvested: false,
      commodities: false,
    };
    // Fabryki — filtr kolonii i podwójny scroll
    this._selectedColonyId = null; // null = globalny, string = konkretna kolonia
    this._scrollCenterTop = 0;     // scroll przeglądu produkcji
    this._scrollCenterBot = 0;     // scroll zarządzania produkcją
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    const centerW = ow - LEFT_W - RIGHT_W;

    // Tło
    ctx.fillStyle = 'rgba(2,4,5,0.97)';
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separatory kolumn
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy); ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.moveTo(ox + ow - RIGHT_W, oy); ctx.lineTo(ox + ow - RIGHT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknięcia [X]
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    // Rysuj 3 kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh);
    this._drawCenter(ctx, ox + LEFT_W, oy, centerW, oh);
    this._drawRight(ctx, ox + ow - RIGHT_W, oy, RIGHT_W, oh);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEWA KOLUMNA — bilans surowców globalny
  // ══════════════════════════════════════════════════════════════════════════

  _drawLeft(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, 44);
    this._drawText(ctx, 'EKONOMIA', x + pad, y + 18, THEME.accent, THEME.fontSizeMedium);

    const colMgr = window.KOSMOS?.colonyManager;
    const selCol = this._selectedColonyId
      ? colMgr?.getColony(this._selectedColonyId) : null;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(selCol ? `📍 ${selCol.name ?? selCol.planetId}` : 'globalne · wszystkie kolonie', x + pad, y + 32);

    // Zbierz dane: per-kolonia lub globalne
    const colonies = colMgr?.getAllColonies() ?? [];
    const sourceColonies = selCol ? [selCol] : colonies;
    const globalInv = {};   // id → amount
    const globalRate = {};  // id → perYear

    for (const col of sourceColonies) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      // Inventory
      if (rs.inventory) {
        for (const [id, amt] of rs.inventory) {
          globalInv[id] = (globalInv[id] ?? 0) + amt;
        }
      }
      // Rates — preferuj obserwowane delty (jak TopBar), fallback na _inventoryPerYear
      const observed = rs._deltaTracker?.observedPerYear;
      if (observed && observed.size > 0) {
        for (const [id, rate] of observed) {
          globalRate[id] = (globalRate[id] ?? 0) + rate;
        }
      } else if (rs._inventoryPerYear) {
        for (const [id, rate] of rs._inventoryPerYear) {
          globalRate[id] = (globalRate[id] ?? 0) + rate;
        }
      }
    }

    // Clip i scroll
    const listY = y + 44;
    const energyH = 48;
    const listH = h - 44 - energyH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollLeft;

    // ── Kategoria: WYDOBYWALNE ────────────────────────────
    ry = this._drawCategory(ctx, x, ry, w, '⛏ WYDOBYWALNE', 'mined',
      Object.values(MINED_RESOURCES), globalInv, globalRate);

    // ── Kategoria: ZBIERALNE ──────────────────────────────
    ry = this._drawCategory(ctx, x, ry, w, '🌾 ZBIERALNE', 'harvested',
      Object.values(HARVESTED_RESOURCES), globalInv, globalRate);

    // ── Kategoria: TOWARY ─────────────────────────────────
    // Przy wybranej kolonii pokaż WSZYSTKIE towary (widać stan zapasów)
    const comItems = Object.values(COMMODITIES).filter(c =>
      selCol ? true : ((globalInv[c.id] ?? 0) > 0 || (globalRate[c.id] ?? 0) !== 0)
    );
    ry = this._drawCategory(ctx, x, ry, w, '🔧 TOWARY', 'commodities',
      comItems, globalInv, globalRate);

    ctx.restore();

    // ── Dolna sekcja — bilans energii ─────────────────────
    const eY = y + h - energyH;
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, eY, w, energyH);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x, eY); ctx.lineTo(x + w, eY); ctx.stroke();

    // Energia (globalna lub per-kolonia)
    let totalEnergyBal = 0;
    let anyBrownout = false;
    for (const col of sourceColonies) {
      const e = col.resourceSystem?.energy;
      if (e) {
        totalEnergyBal += e.balance;
        if (e.brownout) anyBrownout = true;
      }
    }

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('ENERGIA (bilans)', x + pad, eY + 14);

    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    if (totalEnergyBal > 0) {
      ctx.fillStyle = THEME.success;
      ctx.fillText(`+${totalEnergyBal.toFixed(1)}`, x + pad, eY + 32);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.success;
      ctx.fillText('NADWYŻKA', x + pad + 70, eY + 32);
    } else if (totalEnergyBal < 0) {
      ctx.fillStyle = THEME.danger;
      ctx.fillText(`${totalEnergyBal.toFixed(1)}`, x + pad, eY + 32);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('DEFICYT', x + pad + 70, eY + 32);
    } else {
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText('0.0', x + pad, eY + 32);
    }

    if (anyBrownout) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('⚠ BROWNOUT', x + pad, eY + 44);
    }
  }

  // Rysuje nagłówek kategorii + wiersze surowców, zwraca nową pozycję Y
  _drawCategory(ctx, x, ry, w, label, catKey, items, globalInv, globalRate) {
    const pad = 14;

    // Nagłówek kategorii
    ctx.fillStyle = 'rgba(0,255,180,0.07)';
    ctx.fillRect(x, ry, w, CAT_H);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(label, x + pad, ry + 16);

    // Strzałka zwijania
    const arrow = this._collapsed[catKey] ? '▸' : '▾';
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(arrow, x + w - 8, ry + 16);
    ctx.textAlign = 'left';

    this._addHit(x, ry, w, CAT_H, 'toggle_cat', { catKey });
    ry += CAT_H;

    if (this._collapsed[catKey]) return ry;

    // Wiersze surowców
    for (const res of items) {
      const amt = globalInv[res.id] ?? 0;
      const rate = globalRate[res.id] ?? 0;

      // Ikona
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(res.icon ?? '·', x + pad, ry + 15);

      // Nazwa (skrócona)
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText((res.namePL ?? res.id).slice(0, 10), x + 30, ry + 15);

      // Ilość
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(_fmtAmt(amt), x + 150, ry + 15);
      ctx.textAlign = 'left';

      // Rate
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const rateColor = rate > 0 ? THEME.success : rate < 0 ? THEME.danger : THEME.textDim;
      ctx.fillStyle = rateColor;
      const rateStr = rate > 0 ? `+${rate.toFixed(1)}` : rate < 0 ? rate.toFixed(1) : '0';
      ctx.fillText(rateStr, x + 155, ry + 15);

      ry += ROW_H;
    }

    return ry;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ŚRODKOWA KOLUMNA — fabryki / przepływy / handel
  // ══════════════════════════════════════════════════════════════════════════

  _drawCenter(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek z zakładkami
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, TAB_H);

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText('🏭 PRODUKCJA TOWARÓW', x + pad, y + 20);

    const tabs = [
      { id: 'factories', label: 'FABRYKI' },
      { id: 'flows',     label: 'PRZEPŁYWY' },
      { id: 'trade',     label: 'HANDEL' },
    ];
    let tx = x + w - pad;
    for (let i = tabs.length - 1; i >= 0; i--) {
      const t = tabs[i];
      const tw = 62;
      tx -= tw + 4;
      const active = this._centerTab === t.id;
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, y + 6, tw, 20);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(t.label, tx + tw / 2, y + 20);
      ctx.textAlign = 'left';
      this._addHit(tx, y + 4, tw, 24, 'tab', { tab: t.id });
    }

    const cy = y + TAB_H;
    const ch = h - TAB_H;

    if (this._centerTab === 'factories') this._drawFactoriesTab(ctx, x, cy, w, ch);
    else if (this._centerTab === 'flows') this._drawFlowsTab(ctx, x, cy, w, ch);
    else this._drawTradeTab(ctx, x, cy, w, ch);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Zakładka FABRYKI — filtr + przegląd + zarządzanie
  // ══════════════════════════════════════════════════════════════════════════

  _drawFactoriesTab(ctx, x, y, w, h) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getAllColonies() ?? [];

    // ── Filtr kolonii (góra) ──────────────────────────────
    this._drawColonyFilter(ctx, x, y, w, FILTER_H, colonies);

    const contentY = y + FILTER_H;
    const contentH = h - FILTER_H;

    // Wyfiltrowane kolonie
    const filtered = this._selectedColonyId
      ? colonies.filter(c => c.planetId === this._selectedColonyId)
      : colonies;

    // Podział: przegląd (góra) + zarządzanie (dół)
    // Gdy globalny — cała przestrzeń na przegląd
    // Gdy kolonia — 45% przegląd, 55% zarządzanie
    const hasManagement = this._selectedColonyId !== null;
    const overviewH = hasManagement ? Math.floor(contentH * 0.45) : contentH;
    const mgmtH     = hasManagement ? contentH - overviewH : 0;

    // ── Przegląd produkcji (góra) ─────────────────────────
    this._drawProductionOverview(ctx, x, contentY, w, overviewH, filtered);

    // ── Separator + Zarządzanie (dół) ─────────────────────
    if (hasManagement) {
      const sepY = contentY + overviewH;
      ctx.strokeStyle = THEME.border;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x + 10, sepY);
      ctx.lineTo(x + w - 10, sepY);
      ctx.stroke();
      ctx.setLineDash([]);

      const selCol = colonies.find(c => c.planetId === this._selectedColonyId);
      if (selCol) {
        this._drawFactoryManagement(ctx, x, sepY + 2, w, mgmtH - 2, selCol);
      }
    }
  }

  // ── Pasek filtra kolonii ──────────────────────────────────────────────────

  _drawColonyFilter(ctx, x, y, w, h, colonies) {
    const pad = 10;
    ctx.fillStyle = 'rgba(0,255,180,0.05)';
    ctx.fillRect(x, y, w, h);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    let cx = x + pad;

    // Chip: GLOBALNY
    const globalActive = this._selectedColonyId === null;
    const glW = 72;
    ctx.fillStyle = globalActive ? 'rgba(0,255,180,0.12)' : 'rgba(0,255,180,0.04)';
    ctx.fillRect(cx, y + 4, glW, h - 8);
    ctx.strokeStyle = globalActive ? THEME.accent : THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, y + 4, glW, h - 8);
    ctx.fillStyle = globalActive ? THEME.accent : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.fillText('🌍 GLOBALNY', cx + glW / 2, y + h - 7);
    ctx.textAlign = 'left';
    this._addHit(cx, y + 2, glW, h - 4, 'colony_filter', { colonyId: null });
    cx += glW + 4;

    // Chipy per kolonia (wszystkie, w tym bez fabryk)
    for (const col of colonies) {
      const label = (col.name ?? col.planetId).slice(0, 12);
      const cw = Math.min(ctx.measureText(label).width + 14, 100);
      if (cx + cw > x + w - pad) break; // nie mieści się

      const active = this._selectedColonyId === col.planetId;
      ctx.fillStyle = active ? 'rgba(0,255,180,0.12)' : 'rgba(0,255,180,0.04)';
      ctx.fillRect(cx, y + 4, cw, h - 8);
      ctx.strokeStyle = active ? THEME.accent : THEME.border;
      ctx.strokeRect(cx, y + 4, cw, h - 8);
      ctx.fillStyle = active ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'center';
      ctx.fillText(label, cx + cw / 2, y + h - 7);
      ctx.textAlign = 'left';
      this._addHit(cx, y + 2, cw, h - 4, 'colony_filter', { colonyId: col.planetId });
      cx += cw + 4;
    }
  }

  // ── Przegląd produkcji (read-only, filtrowany) ────────────────────────────

  _drawProductionOverview(ctx, x, y, w, h, colonies) {
    const pad = 14;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    let ry = y - this._scrollCenterTop + 6;
    let hasContent = false;

    for (const col of colonies) {
      const fs = col.factorySystem;
      if (!fs || fs.totalPoints <= 0) continue;
      hasContent = true;

      const allocs = fs.getAllocations();
      const queue = fs.getQueue();

      // Nagłówek kolonii
      ctx.fillStyle = THEME.bgSecondary;
      ctx.fillRect(x, ry, w, 20);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`🏛 ${col.name ?? col.planetId}`, x + pad, ry + 14);

      // Punkty fabryczne
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`FP: ${fs.usedPoints}/${fs.totalPoints}`, x + w - pad, ry + 14);
      ctx.textAlign = 'left';
      ry += 24;

      // Aktywne alokacje
      if (allocs.length === 0 && queue.length === 0) {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('Brak aktywnej produkcji', x + pad + 10, ry + 12);
        ry += 22;
      }

      for (const a of allocs) {
        this._drawAllocRow(ctx, x + pad, ry, w - pad * 2, a, col);
        ry += 40;
      }

      // Kolejka
      if (queue.length > 0) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        ctx.fillText('KOLEJKA:', x + pad + 10, ry + 10);
        ry += 14;
        for (const q of queue) {
          const def = COMMODITIES[q.commodityId];
          if (!def) continue;
          ctx.fillStyle = THEME.textSecondary;
          ctx.fillText(`${def.icon} ${def.namePL} ×${q.qty}`, x + pad + 20, ry + 10);
          ry += 16;
        }
      }

      ry += 8;
    }

    // Jeśli żadna kolonia nie ma fabryk
    if (!hasContent) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak fabryk w żadnej kolonii', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

  _drawAllocRow(ctx, x, y, w, alloc, col) {
    const def = COMMODITIES[alloc.commodityId];
    if (!def) return;

    // Stall = FactorySystem ustawił _paused bo brak surowców (lub target osiągnięty)
    const isStall = !!alloc.paused;

    // Ikona
    ctx.font = `${THEME.fontSizeNormal + 4}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(def.icon, x, y + 16);

    // Nazwa + receptura
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(def.namePL, x + 24, y + 12);

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(formatRecipe(def.recipe), x + 24, y + 24);

    // Target info
    if (alloc.targetQty !== null) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`${alloc.produced}/${alloc.targetQty}`, x + 24, y + 34);
    }

    // Pasek postępu
    const barX = x + w - 200;
    const barW = 80;
    const pct = alloc.pctComplete / 100;
    const barColor = isStall ? THEME.danger : pct < 0.2 ? THEME.warning : THEME.accent;
    this._drawBar(ctx, barX, y + 8, barW, 4, pct, barColor, THEME.border);

    if (isStall) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('BRAK SUROWCÓW', barX, y + 24);
    }

    // Output / rok
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const outputX = barX + barW + 8;
    if (isStall) {
      ctx.fillStyle = THEME.danger;
      ctx.fillText('STALL', outputX, y + 12);
    } else {
      const rate = alloc.points / (def.baseTime || 1);
      ctx.fillStyle = THEME.success;
      ctx.fillText(`+${rate.toFixed(1)}/rok`, outputX, y + 12);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Panel ZARZĄDZANIA produkcją (dolna połowa, tylko gdy kolonia wybrana)
  // ══════════════════════════════════════════════════════════════════════════

  _drawFactoryManagement(ctx, x, y, w, h, colony) {
    const pad = 14;
    const fs = colony.factorySystem;
    if (!fs) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    let ry = y - this._scrollCenterBot + 4;

    // ── Nagłówek zarządzania ──────────────────────────────
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('ZARZĄDZANIE PRODUKCJĄ', x + pad, ry + 12);
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`FP: ${fs.freePoints} wolnych / ${fs.totalPoints} łącznie`, x + pad + 160, ry + 12);
    ry += 20;

    // ── Aktywne alokacje z przyciskami ────────────────────
    const allocs = fs.getAllocations();
    if (allocs.length > 0) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('AKTYWNE:', x + pad, ry + 10);
      ry += 14;

      for (const a of allocs) {
        ry = this._drawMgmtAllocRow(ctx, x + pad, ry, w - pad * 2, a, colony);
      }
    }

    // ── Kolejka z reorderem ───────────────────────────────
    const queue = fs.getQueue();
    if (queue.length > 0) {
      ry += 4;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('KOLEJKA:', x + pad, ry + 10);
      ry += 14;

      for (let i = 0; i < queue.length; i++) {
        ry = this._drawMgmtQueue(ctx, x + pad, ry, w - pad * 2, queue[i], i, queue.length, colony);
      }
    }

    // ── Dostępne towary do uruchomienia ───────────────────
    ry += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(x + pad, ry);
    ctx.lineTo(x + w - pad, ry);
    ctx.stroke();
    ry += 6;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('URUCHOM PRODUKCJĘ:', x + pad, ry + 10);
    ry += 14;

    ry = this._drawAddProduction(ctx, x + pad, ry, w - pad * 2, colony);

    ctx.restore();
  }

  // ── Wiersz alokacji z przyciskami [+][-][🎯][✕] ──────────────────────────

  _drawMgmtAllocRow(ctx, x, y, w, alloc, colony) {
    const def = COMMODITIES[alloc.commodityId];
    if (!def) return y + MGMT_ROW_H;

    const isStall = !!alloc.paused;
    const colId = colony.planetId;

    // Ikona + nazwa
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = isStall ? THEME.danger : THEME.textPrimary;
    ctx.fillText(`${def.icon} ${def.namePL}`, x, y + 12);

    // Punkty (np. "3 FP")
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${alloc.points} FP`, x + 140, y + 12);

    // Target info
    if (alloc.targetQty !== null) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(`${alloc.produced}/${alloc.targetQty}`, x + 180, y + 12);
    }

    // Przyciski z prawej: [-] [+] [+5] [+10] [+50] [∞] [✕]
    const btnY = y + 1;
    let bx = x + w - (BTN_S + 2) * 7;

    // [-] zmniejsz punkty
    this._drawSmallBtn(ctx, bx, btnY, '−', 'secondary');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'allocate_minus', colonyId: colId, commodityId: alloc.commodityId,
      label: '−', x: bx,
    });
    bx += BTN_S + 2;

    // [+] zwiększ punkty
    this._drawSmallBtn(ctx, bx, btnY, '+', 'primary');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'allocate_plus', colonyId: colId, commodityId: alloc.commodityId,
      label: '+', x: bx,
    });
    bx += BTN_S + 2;

    // [+5] cel +5
    this._drawSmallBtn(ctx, bx, btnY, '+5', 'unique');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'setTarget', colonyId: colId, commodityId: alloc.commodityId, amount: 5,
      label: '+5', x: bx,
    });
    bx += BTN_S + 2;

    // [+10] cel +10
    this._drawSmallBtn(ctx, bx, btnY, '+10', 'unique');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'setTarget', colonyId: colId, commodityId: alloc.commodityId, amount: 10,
      label: '+10', x: bx,
    });
    bx += BTN_S + 2;

    // [+50] cel +50
    this._drawSmallBtn(ctx, bx, btnY, '+50', 'unique');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'setTarget', colonyId: colId, commodityId: alloc.commodityId, amount: 50,
      label: '+50', x: bx,
    });
    bx += BTN_S + 2;

    // [∞] wyczyść cel (nieskończona)
    const hasTarget = alloc.targetQty !== null;
    this._drawSmallBtn(ctx, bx, btnY, '∞', hasTarget ? 'secondary' : 'unique');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'clearTarget', colonyId: colId, commodityId: alloc.commodityId,
      label: '∞', x: bx,
    });
    bx += BTN_S + 2;

    // [✕] usuń alokację
    this._drawSmallBtn(ctx, bx, btnY, '✕', 'danger');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'allocate_remove', colonyId: colId, commodityId: alloc.commodityId,
      label: '✕', x: bx,
    });

    return y + MGMT_ROW_H;
  }

  // ── Wiersz kolejki z [↑][↓][✕] ───────────────────────────────────────────

  _drawMgmtQueue(ctx, x, y, w, item, index, total, colony) {
    const def = COMMODITIES[item.commodityId];
    if (!def) return y + QUEUE_ROW_H;
    const colId = colony.planetId;

    // Numer + ikona + nazwa + ilość
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${index + 1}. ${def.icon} ${def.namePL} ×${item.qty}`, x + 4, y + 12);

    // Przyciski z prawej: [↑] [↓] [✕]
    const btnY = y;
    let bx = x + w - (BTN_S + 2) * 3;

    // [↑]
    const canUp = index > 0;
    this._drawSmallBtn(ctx, bx, btnY, '↑', canUp ? 'secondary' : 'disabled');
    if (canUp) {
      this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
        action: 'queueUp', colonyId: colId, index, label: '↑', x: bx,
      });
    }
    bx += BTN_S + 2;

    // [↓]
    const canDown = index < total - 1;
    this._drawSmallBtn(ctx, bx, btnY, '↓', canDown ? 'secondary' : 'disabled');
    if (canDown) {
      this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
        action: 'queueDown', colonyId: colId, index, label: '↓', x: bx,
      });
    }
    bx += BTN_S + 2;

    // [✕]
    this._drawSmallBtn(ctx, bx, btnY, '✕', 'danger');
    this._addHit(bx, btnY, BTN_S, BTN_S, 'factory_btn', {
      action: 'dequeue', colonyId: colId, index, label: '✕', x: bx,
    });

    return y + QUEUE_ROW_H;
  }

  // ── Dostępne towary pogrupowane po tier ───────────────────────────────────

  _drawAddProduction(ctx, x, y, w, colony) {
    const fs = colony.factorySystem;
    let ry = y;

    for (const tier of [1, 2, 3, 4]) {
      const ids = COMMODITY_BY_TIER[tier];
      if (!ids || ids.length === 0) continue;

      // Filtruj: pokaż tylko towary z recepturą, nie już alokowane
      const allocs = fs.getAllocations();
      const available = ids.filter(cId => {
        const def = COMMODITIES[cId];
        if (!def) return false;
        if (!def.recipe) return false;
        // Sprawdź czy towar jest już alokowany
        if (allocs.some(a => a.commodityId === cId)) return false;
        return true;
      });

      if (available.length === 0) continue;

      // Nagłówek tieru
      ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(`TIER ${tier}`, x, ry + 10);
      ry += 14;

      for (const cId of available) {
        const def = COMMODITIES[cId];
        const hasFree = fs.freePoints > 0;

        // Ikona + nazwa
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = hasFree ? THEME.textSecondary : THEME.textDim;
        ctx.fillText(`${def.icon} ${def.namePL}`, x + 4, ry + 12);

        // Receptura
        ctx.fillStyle = THEME.textDim;
        ctx.fillText(formatRecipe(def.recipe), x + 140, ry + 12);

        // Przycisk [▶] uruchom (1 FP) / [+Q] do kolejki
        const colId = colony.planetId;
        if (hasFree) {
          const bx = x + w - BTN_S * 2 - 6;
          this._drawSmallBtn(ctx, bx, ry, '▶', 'primary');
          this._addHit(bx, ry, BTN_S, BTN_S, 'factory_btn', {
            action: 'allocate_new', colonyId: colId, commodityId: cId,
            label: '▶', x: bx,
          });
          // [+Q] do kolejki
          const qx = bx + BTN_S + 2;
          this._drawSmallBtn(ctx, qx, ry, '+Q', 'secondary');
          this._addHit(qx, ry, BTN_S, BTN_S, 'factory_btn', {
            action: 'enqueue_new', colonyId: colId, commodityId: cId,
            label: '+Q', x: qx,
          });
        } else {
          // Brak wolnych FP — tylko do kolejki
          const qx = x + w - BTN_S - 2;
          this._drawSmallBtn(ctx, qx, ry, '+Q', 'secondary');
          this._addHit(qx, ry, BTN_S, BTN_S, 'factory_btn', {
            action: 'enqueue_new', colonyId: colId, commodityId: cId,
            label: '+Q', x: qx,
          });
        }

        ry += ADD_ROW_H;
      }

      ry += 4;
    }

    return ry;
  }

  // ── Mały przycisk 16×16 ───────────────────────────────────────────────────

  _drawSmallBtn(ctx, bx, by, label, style) {
    const isHover = this._hoverZone?.data?.label === label &&
                    this._hoverZone?.data?.x === bx;

    let bgColor, borderColor, textColor;
    switch (style) {
      case 'primary':
        bgColor = isHover ? 'rgba(0,255,180,0.15)' : 'rgba(0,255,180,0.05)';
        borderColor = THEME.accent;
        textColor = THEME.accent;
        break;
      case 'danger':
        bgColor = isHover ? 'rgba(255,51,68,0.15)' : 'rgba(255,51,68,0.05)';
        borderColor = THEME.danger;
        textColor = THEME.danger;
        break;
      case 'unique':
        bgColor = isHover ? 'rgba(0,204,255,0.15)' : 'rgba(0,204,255,0.05)';
        borderColor = '#00ccff';
        textColor = '#00ccff';
        break;
      case 'disabled':
        bgColor = 'transparent';
        borderColor = 'rgba(0,255,180,0.07)';
        textColor = 'rgba(160,200,190,0.25)';
        break;
      default: // secondary
        bgColor = isHover ? 'rgba(0,255,180,0.07)' : 'rgba(0,255,180,0.03)';
        borderColor = THEME.border;
        textColor = THEME.textSecondary;
    }

    ctx.fillStyle = bgColor;
    ctx.fillRect(bx, by, BTN_S, BTN_S);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, BTN_S, BTN_S);

    ctx.font = `${BTN_S - 6}px ${THEME.fontFamily}`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.fillText(label, bx + BTN_S / 2, by + BTN_S - 4);
    ctx.textAlign = 'left';
  }

  // ── Router kliknięć fabryki ───────────────────────────────────────────────

  _handleFactoryBtn(data) {
    const colMgr = window.KOSMOS?.colonyManager;
    const col = colMgr?.getColony(data.colonyId);
    if (!col) return;
    const fs = col.factorySystem;
    if (!fs) return;

    switch (data.action) {
      case 'allocate_plus': {
        // Zwiększ o 1 FP
        const cur = fs.getAllocations().find(a => a.commodityId === data.commodityId);
        if (cur) fs.allocate(data.commodityId, cur.points + 1);
        break;
      }
      case 'allocate_minus': {
        // Zmniejsz o 1 FP (min 0 = usuń)
        const cur = fs.getAllocations().find(a => a.commodityId === data.commodityId);
        if (cur) fs.allocate(data.commodityId, cur.points - 1);
        break;
      }
      case 'allocate_new': {
        // Nowa alokacja z 1 FP + domyślny target 10
        fs.allocate(data.commodityId, 1);
        fs.setTarget(data.commodityId, 10);
        break;
      }
      case 'allocate_remove': {
        // Usuń alokację (0 FP)
        fs.allocate(data.commodityId, 0);
        break;
      }
      case 'setTarget': {
        // Zwiększ cel o podaną ilość (+5/+10/+50)
        const cur = fs.getAllocations().find(a => a.commodityId === data.commodityId);
        const amt = data.amount ?? 10;
        const newTarget = (cur?.targetQty ?? 0) + amt;
        fs.setTarget(data.commodityId, newTarget);
        break;
      }
      case 'clearTarget': {
        // Wyczyść cel (nieskończona produkcja)
        fs.setTarget(data.commodityId, null);
        break;
      }
      case 'enqueue_new': {
        // Dodaj 10 szt. do kolejki
        fs.enqueue(data.commodityId, 10);
        break;
      }
      case 'dequeue': {
        fs.dequeue(data.index);
        break;
      }
      case 'queueUp': {
        fs.moveUp(data.index);
        break;
      }
      case 'queueDown': {
        fs.moveDown(data.index);
        break;
      }
    }
  }

  // ── Zakładka PRZEPŁYWY ──────────────────────────────────────────────────

  _drawFlowsTab(ctx, x, y, w, h) {
    const pad = 14;
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getAllColonies() ?? [];

    // Zbierz globalne per-resource produkcja i konsumpcja
    const flows = {};
    for (const col of colonies) {
      const rs = col.resourceSystem;
      if (!rs?._producers) continue;
      for (const [pid, p] of rs._producers) {
        for (const [resId, rate] of Object.entries(p.rates ?? {})) {
          if (resId === 'energy' || resId === 'research') continue;
          if (!flows[resId]) flows[resId] = { prod: 0, cons: 0 };
          if (rate > 0) flows[resId].prod += rate;
          else flows[resId].cons += Math.abs(rate);
        }
      }
    }

    // Filtruj tylko te z ruchem
    const items = Object.entries(flows).filter(([, f]) => f.prod > 0 || f.cons > 0);

    if (items.length === 0) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak przepływów surowców', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    let ry = y + 8;

    // Nagłówki kolumn
    ctx.fillText('SUROWIEC', x + pad, ry + 10);
    ctx.textAlign = 'center';
    ctx.fillText('PRODUKCJA', x + w * 0.45, ry + 10);
    ctx.fillText('KONSUMPCJA', x + w * 0.65, ry + 10);
    ctx.fillText('BILANS', x + w * 0.85, ry + 10);
    ctx.textAlign = 'left';
    ry += 18;

    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 4;

    for (const [resId, f] of items) {
      const def = ALL_RESOURCES[resId] ?? COMMODITIES[resId];
      const icon = def?.icon ?? '·';
      const name = (def?.namePL ?? resId).slice(0, 10);
      const balance = f.prod - f.cons;

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${icon} ${name}`, x + pad, ry + 12);

      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = THEME.success;
      ctx.fillText(`+${f.prod.toFixed(1)}`, x + w * 0.45, ry + 12);
      ctx.fillStyle = THEME.danger;
      ctx.fillText(`-${f.cons.toFixed(1)}`, x + w * 0.65, ry + 12);
      ctx.fillStyle = balance >= 0 ? THEME.success : THEME.danger;
      ctx.fillText(`${balance >= 0 ? '+' : ''}${balance.toFixed(1)}`, x + w * 0.85, ry + 12);
      ctx.textAlign = 'left';

      ry += 20;
    }
  }

  // ── Zakładka HANDEL ─────────────────────────────────────────────────────

  _drawTradeTab(ctx, x, y, w, h) {
    const pad = 14;
    const trm = window.KOSMOS?.tradeRouteManager;
    const routes = trm?.getRoutes() ?? [];

    if (routes.length === 0) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak aktywnych tras handlowych', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    let ry = y + 8;
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr = window.KOSMOS?.vesselManager;

    for (const route of routes) {
      const sourceCol = colMgr?.getColony(route.sourceColonyId);
      const sourceName = sourceCol?.name ?? route.sourceColonyId;
      const targetBody = this._findBody(route.targetBodyId);
      const targetName = targetBody?.name ?? route.targetBodyId;
      const vessel = vMgr?.getVessel(route.vesselId);

      // Ikona + skąd → dokąd
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`📦 ${sourceName}`, x + pad, ry + 12);
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('→', x + pad + 120, ry + 12);
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(targetName, x + pad + 135, ry + 12);

      // Ładunek
      const cargoStr = Object.entries(route.cargo ?? {})
        .map(([id, qty]) => `${qty}t ${id}`)
        .join(', ') || '—';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.warning;
      ctx.fillText(cargoStr.slice(0, 30), x + pad + 10, ry + 26);

      // Status
      const status = route.status === 'active' ? 'AKTYWNA'
                   : route.status === 'paused' ? 'WSTRZYMANA' : 'UKOŃCZONA';
      const statusColor = route.status === 'active' ? THEME.accent
                        : route.status === 'paused' ? THEME.warning : THEME.textDim;

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = statusColor;
      ctx.textAlign = 'right';
      ctx.fillText(status, x + w - pad, ry + 12);

      // Kursy
      const trips = route.tripsTotal !== null
        ? `${route.tripsCompleted}/${route.tripsTotal}`
        : `${route.tripsCompleted}/∞`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(trips, x + w - pad, ry + 26);
      ctx.textAlign = 'left';

      // Przyciski: ⏸/▶ + ✕
      const btnW = 20; const btnH2 = 16;
      const delX = x + w - pad - btnW;
      const pauseX = delX - btnW - 4;

      // ⏸ / ▶ (pause/resume)
      const isPaused = route.status === 'paused';
      ctx.fillStyle = isPaused ? 'rgba(20,60,40,0.6)' : 'rgba(60,50,10,0.6)';
      ctx.fillRect(pauseX, ry + 30, btnW, btnH2);
      ctx.strokeStyle = isPaused ? THEME.success : THEME.warning;
      ctx.strokeRect(pauseX, ry + 30, btnW, btnH2);
      ctx.fillStyle = isPaused ? THEME.success : THEME.warning;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(isPaused ? '▶' : '⏸', pauseX + btnW / 2, ry + 30 + btnH2 - 3);
      ctx.textAlign = 'left';
      this._addHit(pauseX, ry + 30, btnW, btnH2, 'trade_toggle_pause', { routeId: route.id, paused: isPaused });

      // ✕ (delete)
      ctx.fillStyle = 'rgba(80,20,20,0.6)';
      ctx.fillRect(delX, ry + 30, btnW, btnH2);
      ctx.strokeStyle = THEME.danger;
      ctx.strokeRect(delX, ry + 30, btnW, btnH2);
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText('✕', delX + btnW / 2, ry + 30 + btnH2 - 3);
      ctx.textAlign = 'left';
      this._addHit(delX, ry + 30, btnW, btnH2, 'trade_delete', { routeId: route.id });

      // Separator
      ry += 34 + btnH2 + 4;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
      ry += 6;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRAWA KOLUMNA — bilans energii + alerty
  // ══════════════════════════════════════════════════════════════════════════

  _drawRight(ctx, x, y, w, h) {
    const pad = 14;

    // Nagłówek
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('BILANS ENERGII · ALERTY', x + pad, y + 20);

    let cy = y + TAB_H + 8;

    // ── Bilans energii — aktywna kolonia ──────────────────
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const activeCol = colMgr?.getColony(activePid);
    const colName = activeCol?.name ?? 'Brak';

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`BILANS ENERGII — ${colName}`, x + pad, cy + 10);
    cy += 16;

    // Zbierz producentów/konsumentów energii
    const bs = activeCol?.buildingSystem;
    const energyItems = [];
    if (bs?._active) {
      // Pogrupuj wg buildingId
      const grouped = {};
      for (const [, entry] of bs._active) {
        const buildId = entry.building?.id ?? entry.def?.id ?? '?';
        const energyRate = entry.effectiveRates?.energy ?? entry.baseRates?.energy ?? 0;
        if (energyRate === 0) continue;
        if (!grouped[buildId]) grouped[buildId] = { name: entry.building?.namePL ?? entry.def?.namePL ?? buildId, count: 0, total: 0 };
        grouped[buildId].count++;
        grouped[buildId].total += energyRate;
      }
      for (const [, g] of Object.entries(grouped)) {
        energyItems.push(g);
      }
    }

    // POP konsumpcja energii
    const pop = activeCol?.civSystem?.population ?? 0;
    if (pop > 0) {
      energyItems.push({ name: `POPy (×${pop})`, count: 1, total: -(pop * 1.0) });
    }

    if (energyItems.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Brak danych', x + pad, cy + 10);
      cy += 18;
    } else {
      // Sortuj: producenci pierwsi, potem konsumenci
      energyItems.sort((a, b) => b.total - a.total);

      for (const item of energyItems) {
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        const label = item.count > 1 ? `${item.name} ×${item.count}` : item.name;
        ctx.fillText(label.slice(0, 22), x + pad, cy + 10);

        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = item.total >= 0 ? THEME.success : THEME.danger;
        ctx.textAlign = 'right';
        ctx.fillText(`${item.total >= 0 ? '+' : ''}${item.total.toFixed(1)}`, x + w - pad, cy + 10);
        ctx.textAlign = 'left';

        cy += 18;
      }

      // Suma
      const totalE = energyItems.reduce((s, i) => s + i.total, 0);
      cy += 2;
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
      cy += 10;

      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText('BILANS', x + pad, cy + 10);
      ctx.fillStyle = totalE >= 0 ? THEME.success : THEME.danger;
      ctx.textAlign = 'right';
      ctx.fillText(`${totalE >= 0 ? '+' : ''}${totalE.toFixed(1)}`, x + w - pad, cy + 10);
      ctx.textAlign = 'left';
      cy += 18;
    }

    // ── Alerty produkcji ──────────────────────────────────
    cy += 10;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 10;

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('ALERTY PRODUKCJI', x + pad, cy + 8);
    cy += 16;

    const alerts = this._generateAlerts();

    if (alerts.length === 0) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak alertów', x + w / 2, cy + 20);
      ctx.textAlign = 'left';
    } else {
      // Clip alerty
      const alertH = h - (cy - y);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, cy, w, alertH);
      ctx.clip();

      let ay = cy - this._scrollRight;

      for (const alert of alerts) {
        const isCrit = alert.level === 'critical';
        const borderC = isCrit ? 'rgba(255,51,68,0.2)' : 'rgba(255,204,68,0.2)';
        const bgC = isCrit ? 'rgba(255,51,68,0.04)' : 'rgba(255,204,68,0.04)';
        const textC = isCrit ? THEME.danger : THEME.warning;

        ctx.fillStyle = bgC;
        ctx.fillRect(x + 6, ay, w - 12, 46);
        ctx.strokeStyle = borderC;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 6, ay, w - 12, 46);

        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = textC;
        ctx.fillText(alert.title.slice(0, 28), x + pad, ay + 14);

        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(alert.desc.slice(0, 36), x + pad, ay + 28);
        if (alert.desc.length > 36) {
          ctx.fillText(alert.desc.slice(36, 72), x + pad, ay + 38);
        }

        ay += 52;
      }

      ctx.restore();
    }
  }

  // ── Generuj alerty dynamicznie ──────────────────────────────────────────

  _generateAlerts() {
    const alerts = [];
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getAllColonies() ?? [];

    for (const col of colonies) {
      if (col.isOutpost) continue;
      const fs = col.factorySystem;
      const rs = col.resourceSystem;
      if (!fs || !rs) continue;

      const allocs = fs.getAllocations();
      for (const a of allocs) {
        const def = COMMODITIES[a.commodityId];
        if (!def?.recipe) continue;

        // Stall — FactorySystem ustawił paused (brak surowców lub target)
        if (a.paused && (a.targetQty === null || a.produced < a.targetQty)) {
          // Znajdź brakujący składnik
          let missingRes = null;
          for (const [resId, qty] of Object.entries(def.recipe)) {
            if ((rs.inventory?.get?.(resId) ?? 0) < qty) { missingRes = resId; break; }
          }
          alerts.push({
            level: 'critical',
            title: `⚠ ${def.icon} ${def.namePL} — STALL`,
            desc: `${col.name}: brak ${missingRes ?? 'surowców'} do produkcji`,
          });
        } else if (!a.paused) {
          // Ostrzeżenie o niskich stanach składników
          let lowIngredient = null;
          for (const [resId, qty] of Object.entries(def.recipe)) {
            if ((rs.inventory?.get?.(resId) ?? 0) < qty * 10) { lowIngredient = resId; break; }
          }
          if (lowIngredient) {
            alerts.push({
              level: 'warning',
              title: `⚡ ${def.icon} ${def.namePL} — niskie stany`,
              desc: `${col.name}: niski zapas ${lowIngredient}`,
            });
          }
        }
      }

      // Brownout
      if (rs.energy?.brownout) {
        alerts.push({
          level: 'critical',
          title: `⚠ Brownout — ${col.name}`,
          desc: 'Deficyt energii — produkcja wstrzymana',
        });
      }
    }

    return alerts;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _findBody(id) {
    if (!id) return null;
    for (const t of ['planet', 'moon', 'asteroid', 'comet', 'planetoid']) {
      for (const b of EntityManager.getByType(t)) {
        if (b.id === id) return b;
      }
    }
    return null;
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'tab':
        this._centerTab = zone.data.tab;
        this._scrollCenter = 0;
        this._scrollCenterTop = 0;
        this._scrollCenterBot = 0;
        break;
      case 'toggle_cat':
        this._collapsed[zone.data.catKey] = !this._collapsed[zone.data.catKey];
        break;
      case 'colony_filter':
        this._selectedColonyId = zone.data.colonyId;
        this._scrollLeft = 0;
        this._scrollCenterTop = 0;
        this._scrollCenterBot = 0;
        break;
      case 'factory_btn':
        this._handleFactoryBtn(zone.data);
        break;
      case 'trade_toggle_pause':
        if (zone.data.paused) {
          EventBus.emit('tradeRoute:resume', { routeId: zone.data.routeId });
        } else {
          EventBus.emit('tradeRoute:pause', { routeId: zone.data.routeId });
        }
        break;
      case 'trade_delete':
        EventBus.emit('tradeRoute:delete', { routeId: zone.data.routeId });
        break;
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    this._hoverZone = this._hitTest(x, y);
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    // Lewa kolumna
    if (x < ox + LEFT_W) {
      this._scrollLeft = Math.max(0, this._scrollLeft + delta * 0.5);
      return true;
    }
    // Prawa kolumna
    if (x > ox + ow - RIGHT_W) {
      this._scrollRight = Math.max(0, this._scrollRight + delta * 0.5);
      return true;
    }
    // Środkowa kolumna — fabryki: podwójny scroll
    if (this._centerTab === 'factories' && this._selectedColonyId !== null) {
      // Oblicz pozycję separatora (45% dostępnej wysokości pod filtrem)
      const centerX = ox + LEFT_W;
      const tabBottom = oy + TAB_H;
      const contentY = tabBottom + FILTER_H;
      const contentH = oh - TAB_H - FILTER_H;
      const splitY = contentY + Math.floor(contentH * 0.45);

      if (y < splitY) {
        this._scrollCenterTop = Math.max(0, this._scrollCenterTop + delta * 0.5);
      } else {
        this._scrollCenterBot = Math.max(0, this._scrollCenterBot + delta * 0.5);
      }
      return true;
    }
    // Inne zakładki / globalny widok fabryk
    if (this._centerTab === 'factories') {
      this._scrollCenterTop = Math.max(0, this._scrollCenterTop + delta * 0.5);
    } else {
      this._scrollCenter = Math.max(0, this._scrollCenter + delta * 0.5);
    }
    return true;
  }
}

// ── Formatowanie ilości ───────────────────────────────────────────────────
function _fmtAmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}
