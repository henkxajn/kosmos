// PopulationOverlay — panel Populacji (klawisz P)
//
// Trójdzielny overlay: lista kolonii (L), szczegóły populacji (C), prosperity + zdarzenia (R).
// Dane czytane LIVE z ColonyManager / CivilizationSystem / ResourceSystem.

import { BaseOverlay } from './BaseOverlay.js';
import { THEME }       from '../config/ThemeConfig.js';
import EventBus        from '../core/EventBus.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { PROSPERITY_WEIGHTS } from '../data/ConsumerGoodsData.js';

const LEFT_W   = 260;
const RIGHT_W  = 260;
const ROW_H    = 52;
const HDR_H    = 52;
const STAT_H   = 60;
const TAB_H    = 32;

// Maksymalna liczba wpisów historii populacji per kolonia
const MAX_HISTORY = 20;

// ── Cache historii populacji (per kolonia, nie serializowany) ────────────
// Klucz = planetId, wartość = [{ year, pop, housing, prosperity }]
const _popHistory = {};

function _recordHistory(planetId, year, pop, housing, prosperity) {
  if (!_popHistory[planetId]) _popHistory[planetId] = [];
  const h = _popHistory[planetId];
  // Tylko 1 wpis na rok
  if (h.length > 0 && h[h.length - 1].year >= year) return;
  h.push({ year, pop, housing, prosperity });
  if (h.length > MAX_HISTORY) h.shift();
}

// Nasłuchuj corocznych zmian populacji — rejestruj historię dla WSZYSTKICH kolonii
let _historyListenerActive = false;
function _ensureHistoryListener() {
  if (_historyListenerActive) return;
  _historyListenerActive = true;

  EventBus.on('civ:populationChanged', (data) => {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    const ts = window.KOSMOS?.timeSystem;
    const year = Math.floor(ts?.gameTime ?? 0);

    // Rejestruj dla aktywnej kolonii (dane z eventu)
    const pid = colMgr.activePlanetId;
    const prosp = Math.round(window.KOSMOS?.prosperitySystem?.prosperity ?? 50);
    if (pid) _recordHistory(pid, year, data.population, data.housing, prosp);

    // Rejestruj dla WSZYSTKICH pozostałych kolonii (dane bezpośrednio z civSystem)
    for (const col of colMgr.getAllColonies()) {
      if (col.planetId === pid || col.isOutpost) continue;
      const civ = col.civSystem;
      if (civ) {
        const colProsp = Math.round(col.prosperitySystem?.prosperity ?? 50);
        _recordHistory(col.planetId, year, civ.population, civ.housing, colProsp);
      }
    }
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// PopulationOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class PopulationOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedColonyId = null;
    this._centerTab = 'needs';   // 'needs' | 'history' | 'slots'
    this._scrollOffset = 0;      // scroll listy kolonii (LEFT)
    this._hoverRowId = null;     // hover nad wierszem kolonii
    _ensureHistoryListener();
  }

  show() {
    super.show();
    // Auto-wybierz aktywną kolonię
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr && !this._selectedColonyId) {
      this._selectedColonyId = colMgr.activePlanetId;
    }
  }

  hide() {
    super.hide();
    this._hoverRowId = null;
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

    // Dane
    const colMgr = window.KOSMOS?.colonyManager;
    const colonies = colMgr?.getAllColonies()?.filter(c => !c.isOutpost) ?? [];

    // Rysuj 3 kolumny
    this._drawLeft(ctx, ox, oy, LEFT_W, oh, colonies);
    this._drawCenter(ctx, ox + LEFT_W, oy, centerW, oh, colonies);
    this._drawRight(ctx, ox + ow - RIGHT_W, oy, RIGHT_W, oh);
  }

  // ── LEWA KOLUMNA: lista kolonii ─────────────────────────────────────────

  _drawLeft(ctx, x, y, w, h, colonies) {
    const pad = 14;

    // ── Nagłówek ──────────────────────────────────────────
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, HDR_H);

    this._drawText(ctx, 'POPULACJA', x + pad, y + 20, THEME.accent, THEME.fontSizeMedium);

    const totalPop = colonies.reduce((s, c) => s + (c.civSystem?.population ?? 0), 0);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${colonies.length} kolonii · łącznie ${totalPop} POP`, x + pad, y + 36);

    // ── Siatka statystyk 2×2 ──────────────────────────────
    const sy = y + HDR_H;
    const cellW = Math.floor((w - 2) / 2);
    const cellH = Math.floor(STAT_H / 2);

    const totalHousing = colonies.reduce((s, c) => s + (c.civSystem?.housing ?? 0), 0);
    const avgProsperity = colonies.length > 0
      ? Math.round(colonies.reduce((s, c) => s + (c.prosperitySystem?.prosperity ?? 50), 0) / colonies.length)
      : 50;
    const totalGrowth = colonies.reduce((s, c) => s + (c.civSystem?._growthProgress ?? 0), 0);

    const stats = [
      { label: 'ŁĄCZNIE POP', value: `${totalPop}`, color: THEME.textPrimary },
      { label: 'WZROST/ROK',  value: `+${totalGrowth.toFixed(2)}`, color: THEME.success },
      { label: 'PROSPERITY śr.',  value: `${avgProsperity}`, color: avgProsperity > 60 ? THEME.success : avgProsperity > 30 ? THEME.warning : THEME.danger },
      { label: 'SLOTY MIESZK.', value: `${totalPop}/${totalHousing}`, color: THEME.textPrimary },
    ];

    for (let i = 0; i < 4; i++) {
      const cx = x + 1 + (i % 2) * cellW;
      const cy = sy + Math.floor(i / 2) * cellH;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(cx, cy, cellW - 1, cellH - 1);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(cx, cy, cellW - 1, cellH - 1);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(stats[i].label, cx + 4, cy + 11);
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = stats[i].color;
      ctx.fillText(stats[i].value, cx + 4, cy + 24);
    }

    // ── Lista kolonii ─────────────────────────────────────
    const listY = sy + STAT_H;
    const listH = h - (HDR_H + STAT_H);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    let ry = listY - this._scrollOffset;
    for (const col of colonies) {
      if (ry + ROW_H < listY) { ry += ROW_H; continue; }
      if (ry > listY + listH) break;

      const isSel = col.planetId === this._selectedColonyId;
      const isHov = col.planetId === this._hoverRowId;
      const civ = col.civSystem;
      const pop = civ?.population ?? 0;
      const housing = civ?.housing ?? 0;

      // Tło wiersza
      if (isSel) {
        ctx.fillStyle = 'rgba(0,255,180,0.05)';
        ctx.fillRect(x, ry, w, ROW_H);
        ctx.fillStyle = THEME.accent;
        ctx.fillRect(x, ry, 2, ROW_H);
      } else if (isHov) {
        ctx.fillStyle = 'rgba(0,255,180,0.03)';
        ctx.fillRect(x, ry, w, ROW_H);
      }

      // Nazwa
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(col.name ?? col.planetId, x + pad, ry + 14);

      // POP / sloty
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`POP: ${pop} / ${housing} slotów`, x + pad, ry + 28);

      // Pasek housing
      const barW = w - pad * 2 - 50;
      const barX = x + pad;
      const barY = ry + 34;
      const pct = housing > 0 ? pop / housing : 1;
      const barColor = pct >= 1 ? THEME.danger : pct >= 0.8 ? THEME.warning : THEME.success;
      this._drawBar(ctx, barX, barY, barW, 3, Math.min(1, pct), barColor, THEME.border);

      // Wzrost delta
      const growth = civ?._growthProgress ?? 0;
      const growthStr = growth > 0 ? `+${growth.toFixed(2)}/rok` : '0/rok';
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = growth > 0 ? THEME.success : THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(growthStr, x + w - 8, ry + 14);
      ctx.textAlign = 'left';

      // Separator
      ctx.strokeStyle = THEME.border;
      ctx.beginPath(); ctx.moveTo(x + 8, ry + ROW_H - 1); ctx.lineTo(x + w - 8, ry + ROW_H - 1); ctx.stroke();

      // Hit zone
      this._addHit(x, ry, w, ROW_H, 'colony', { colonyId: col.planetId });

      ry += ROW_H;
    }

    ctx.restore();
  }

  // ── ŚRODKOWA KOLUMNA: szczegóły wybranej kolonii ────────────────────────

  _drawCenter(ctx, x, y, w, h, colonies) {
    const pad = 14;
    const col = colonies.find(c => c.planetId === this._selectedColonyId);
    if (!col) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Wybierz kolonię z listy', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    const civ = col.civSystem;
    const rs = col.resourceSystem;

    // ── Nagłówek z zakładkami ──────────────────────────────
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, TAB_H);

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(col.name ?? col.planetId, x + pad, y + 20);

    // Zakładki
    const tabs = [
      { id: 'needs',   label: 'POTRZEBY' },
      { id: 'history', label: 'HISTORIA' },
      { id: 'slots',   label: 'SLOTY' },
    ];
    let tx = x + w - pad;
    for (let i = tabs.length - 1; i >= 0; i--) {
      const t = tabs[i];
      const tw = 60;
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

    // ── Zawartość zakładki ─────────────────────────────────
    const cy = y + TAB_H;
    const ch = h - TAB_H;

    if (this._centerTab === 'needs') {
      this._drawNeedsTab(ctx, x, cy, w, ch, col, civ, rs);
    } else if (this._centerTab === 'history') {
      this._drawHistoryTab(ctx, x, cy, w, ch, col);
    } else {
      this._drawSlotsTab(ctx, x, cy, w, ch, col);
    }
  }

  // ── Zakładka POTRZEBY ───────────────────────────────────────────────────

  _drawNeedsTab(ctx, x, y, w, h, col, civ, rs) {
    const pad = 14;
    let cy = y + 8;

    // ── Sparkline: historia populacji ──────────────────────
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('WZROST — OSTATNIE 20 LAT', x + pad, cy + 10);
    cy += 16;

    const hist = _popHistory[this._selectedColonyId] ?? [];
    const sparkW = w - pad * 2;
    const sparkH = 50;

    if (hist.length > 1) {
      const maxPop = Math.max(1, ...hist.map(h => h.pop));
      const barW = Math.floor(sparkW / hist.length);

      for (let i = 0; i < hist.length; i++) {
        const bh = Math.max(1, Math.round((hist[i].pop / maxPop) * sparkH));
        const bx = x + pad + i * barW;
        const by = cy + sparkH - bh;
        const isLast = i === hist.length - 1;
        const alpha = isLast ? 1.0 : 0.3 + (i / hist.length) * 0.3;
        ctx.fillStyle = `rgba(0,255,180,${alpha})`;
        ctx.fillRect(bx, by, Math.max(2, barW - 1), bh);
      }
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText('Zbierane dane...', x + pad, cy + sparkH / 2);
    }
    cy += sparkH + 10;

    // ── Siatka 3 statystyk ────────────────────────────────
    const pop = civ?.population ?? 0;
    const housing = civ?.housing ?? 0;
    const prosp = Math.round(col?.prosperitySystem?.prosperity ?? 50);

    const cellW = Math.floor((w - pad * 2) / 3);
    const statItems = [
      { label: 'POP AKTUALNA', value: `${pop}`, color: THEME.textPrimary },
      { label: 'SLOTY MIESZK.', value: `${pop}/${housing}`, color: pop >= housing ? THEME.danger : THEME.textPrimary },
      { label: 'PROSPERITY', value: `${prosp}`, color: prosp > 60 ? THEME.success : prosp > 30 ? THEME.warning : THEME.danger },
    ];

    for (let i = 0; i < 3; i++) {
      const sx = x + pad + i * cellW;
      ctx.fillStyle = THEME.bgPrimary;
      ctx.fillRect(sx, cy, cellW - 4, 40);
      ctx.strokeStyle = THEME.border;
      ctx.strokeRect(sx, cy, cellW - 4, 40);

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(statItems[i].label, sx + 6, cy + 14);
      ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillStyle = statItems[i].color;
      ctx.fillText(statItems[i].value, sx + 6, cy + 32);
    }
    cy += 50;

    // ── Sekcja POTRZEBY POPULACJI ─────────────────────────
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('POTRZEBY POPULACJI', x + pad, cy + 10);
    cy += 18;

    // Oblicz satisfaction z resource ratios
    const needs = this._calcNeeds(civ, rs, pop);

    for (const need of needs) {
      const nx = x + pad;
      // Ikona + nazwa
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(need.icon, nx, cy + 12);
      ctx.fillText(need.name, nx + 18, cy + 12);

      // Pasek
      const barX = nx + 100;
      const barW = w - pad * 2 - 150;
      const barColor = need.ratio > 0.8 ? THEME.success : need.ratio > 0.5 ? THEME.warning : THEME.danger;
      this._drawBar(ctx, barX, cy + 5, barW, 6, need.ratio, barColor, THEME.border);

      // Procent
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = barColor;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(need.ratio * 100)}%`, x + w - pad, cy + 12);
      ctx.textAlign = 'left';

      cy += 22;

      // Alert deficytu
      if (need.ratio < 0.5) {
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.danger;
        ctx.fillText(`⚠ Deficyt ${need.name} — prosperity ${need.penalty}`, nx + 18, cy + 2);
        cy += 12;
      }
    }

    // ── Kryzysy aktywne ───────────────────────────────────
    cy += 10;
    if (civ?.isUnrest) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('🔥 ZAMIESZKI — efektywność -30%', x + pad, cy + 10);
      cy += 16;
    }
    if (civ?.isFamine) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.danger;
      ctx.fillText('💀 GŁÓD — populacja umiera', x + pad, cy + 10);
      cy += 16;
    }

    // ── Sekcja PROSPERITY BREAKDOWN ──────────────────────────
    const ps = col?.prosperitySystem;
    if (ps) {
      cy += 10;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText('PROSPERITY', x + pad, cy + 10);
      cy += 16;

      // Pasek główny prosperity (0-100)
      const pVal = Math.round(ps.prosperity ?? 50);
      const pColor = pVal < 30 ? THEME.danger : pVal < 60 ? THEME.warning : THEME.success;
      this._drawBar(ctx, x + pad, cy, w - pad * 2, 8, pVal / 100, pColor, THEME.border);
      ctx.fillStyle = pColor;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${pVal} / 100`, x + w - pad, cy + 8);
      ctx.textAlign = 'left';
      cy += 16;

      // Warstwy (5 wierszy)
      const layers = ps.getLayerScores?.() ?? {};
      const layerData = [
        { key: 'survival',       label: '🍎 Przetrwanie',    max: PROSPERITY_WEIGHTS.survival },
        { key: 'infrastructure', label: '🏠 Infrastruktura', max: PROSPERITY_WEIGHTS.infrastructure },
        { key: 'functioning',    label: '🔩 Funkcjonowanie', max: PROSPERITY_WEIGHTS.functioning },
        { key: 'comfort',        label: '👕 Komfort',        max: PROSPERITY_WEIGHTS.comfort },
        { key: 'luxury',         label: '🍽️ Luksus',         max: PROSPERITY_WEIGHTS.luxury },
      ];

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      for (const layer of layerData) {
        const score = layers[layer.key] ?? 0;
        const ratio = score;  // score jest już 0-1 (satisfaction)
        const weighted = Math.round(score * layer.max * 10) / 10;
        const color = ratio >= 0.7 ? THEME.success : ratio >= 0.3 ? THEME.warning : THEME.danger;

        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(layer.label, x + pad, cy + 9);

        const mbX = x + pad + 110;
        const mbW = w - pad * 2 - 150;
        this._drawBar(ctx, mbX, cy + 3, mbW, 4, ratio, color, THEME.border);

        ctx.fillStyle = color;
        ctx.textAlign = 'right';
        ctx.fillText(`${weighted.toFixed(0)}/${layer.max}`, x + w - pad, cy + 9);
        ctx.textAlign = 'left';

        cy += 14;
      }

      // Dobra konsumpcyjne
      cy += 8;
      ctx.fillStyle = THEME.textHeader;
      ctx.fillText('DOBRA KONSUMPCYJNE', x + pad, cy + 10);
      cy += 14;

      const epoch = ps._getCurrentEpoch?.() ?? { unlockedGoods: [] };
      const allConsumerGoods = [
        'spare_parts', 'pharmaceuticals', 'life_support_filters',
        'synthetics', 'personal_electronics',
        'gourmet_food', 'stimulants', 'semiconductors',
      ];

      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      for (const goodId of allConsumerGoods) {
        const unlocked = epoch.unlockedGoods?.includes(goodId);
        const commodity = COMMODITIES[goodId];
        if (!commodity) continue;

        if (!unlocked) {
          ctx.fillStyle = THEME.textDim;
          ctx.fillText(`${commodity.icon ?? '?'} ${commodity.namePL ?? goodId}  🔒`, x + pad, cy + 9);
        } else {
          const demand = ps.getDemand?.(goodId) ?? 0;
          const production = ps.getProduction?.(goodId) ?? 0;
          const satisfaction = ps.getSatisfaction?.(goodId) ?? 0;
          const sColor = satisfaction >= 0.8 ? THEME.success
                       : satisfaction >= 0.5 ? THEME.warning
                       : THEME.danger;

          ctx.fillStyle = THEME.textPrimary;
          ctx.fillText(`${commodity.icon ?? '?'} ${commodity.namePL ?? goodId}`, x + pad, cy + 9);

          ctx.fillStyle = sColor;
          ctx.textAlign = 'right';
          ctx.fillText(`${production.toFixed(1)}/rok  dem: ${demand.toFixed(1)}`, x + w - pad, cy + 9);
          ctx.textAlign = 'left';
        }
        cy += 14;
      }

      // Podsumowanie
      cy += 8;
      ctx.fillStyle = THEME.textDim;
      const totalCFP = ps._getTotalCFP?.() ?? 0;
      ctx.fillText(`Consumer Factory: ${totalCFP} CFP`, x + pad, cy + 9);
      cy += 14;
      const epochNames = { early: 'Wczesna', developing: 'Rozwijająca', advanced: 'Zaawansowana', cosmic: 'Kosmiczna' };
      ctx.fillText(`Epoka: ${epochNames[epoch.key] ?? epoch.key} (score: ${Math.round(ps.epochScore ?? 0)})`, x + pad, cy + 9);
    }
  }

  // ── Zakładka HISTORIA ───────────────────────────────────────────────────

  _drawHistoryTab(ctx, x, y, w, h, col) {
    const pad = 14;
    const hist = _popHistory[this._selectedColonyId] ?? [];

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('HISTORIA POPULACJI', x + pad, y + 18);

    if (hist.length < 2) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Zbyt mało danych — odczekaj kilka lat', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Wykres liniowy — populacja w czasie
    const chartX = x + pad + 30;
    const chartY = y + 34;
    const chartW = w - pad * 2 - 40;
    const chartH = Math.min(h - 80, 200);
    const maxPop = Math.max(2, ...hist.map(h => h.pop));
    const minYear = hist[0].year;
    const maxYear = hist[hist.length - 1].year;
    const yearSpan = Math.max(1, maxYear - minYear);

    // Oś Y (POP)
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(chartX, chartY); ctx.lineTo(chartX, chartY + chartH);
    ctx.moveTo(chartX, chartY + chartH); ctx.lineTo(chartX + chartW, chartY + chartH);
    ctx.stroke();

    // Etykiety Y
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`${maxPop}`, chartX - 4, chartY + 4);
    ctx.fillText('0', chartX - 4, chartY + chartH + 4);
    ctx.textAlign = 'left';

    // Linia populacji
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const hx = chartX + ((hist[i].year - minYear) / yearSpan) * chartW;
      const hy = chartY + chartH - (hist[i].pop / maxPop) * chartH;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();

    // Punkty
    for (let i = 0; i < hist.length; i++) {
      const hx = chartX + ((hist[i].year - minYear) / yearSpan) * chartW;
      const hy = chartY + chartH - (hist[i].pop / maxPop) * chartH;
      ctx.beginPath();
      ctx.arc(hx, hy, 2, 0, Math.PI * 2);
      ctx.fillStyle = THEME.accent;
      ctx.fill();
    }

    // Linia prosperity (szara, na tym samym wykresie, skala 0-100)
    ctx.strokeStyle = THEME.warning;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const hx = chartX + ((hist[i].year - minYear) / yearSpan) * chartW;
      const hy = chartY + chartH - ((hist[i].prosperity ?? 50) / 100) * chartH;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Legenda
    const legY = chartY + chartH + 16;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText('── Populacja', chartX, legY);
    ctx.fillStyle = THEME.warning;
    ctx.fillText('--- Prosperity', chartX + 90, legY);
  }

  // ── Zakładka SLOTY ──────────────────────────────────────────────────────

  _drawSlotsTab(ctx, x, y, w, h, col) {
    const pad = 14;
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('BUDYNKI MIESZKALNE', x + pad, y + 18);

    const bs = col.buildingSystem;
    if (!bs) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak danych budynków', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Zbierz budynki dające housing
    const housingBuildings = [];
    const active = bs._active;
    if (active) {
      for (const [key, entry] of active) {
        const def = entry.def;
        if (def && def.housing && def.housing > 0) {
          housingBuildings.push({
            name: def.namePL ?? def.id,
            level: entry.level ?? 1,
            housing: def.housing * (entry.level ?? 1),
          });
        }
      }
    }

    if (housingBuildings.length === 0) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak budynków mieszkalnych', x + w / 2, y + 60);
      ctx.textAlign = 'left';
      return;
    }

    let ry = y + 28;
    const totalHousing = housingBuildings.reduce((s, b) => s + b.housing, 0);
    for (const b of housingBuildings) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(`${b.name} Lv${b.level}`, x + pad, ry + 12);

      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.accent;
      ctx.textAlign = 'right';
      ctx.fillText(`+${b.housing} slotów`, x + w - pad, ry + 12);
      ctx.textAlign = 'left';

      ry += 20;
    }

    // Suma
    ry += 6;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, ry); ctx.lineTo(x + w - pad, ry); ctx.stroke();
    ry += 10;
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText('RAZEM', x + pad, ry + 10);
    ctx.fillStyle = THEME.accent;
    ctx.textAlign = 'right';
    ctx.fillText(`${totalHousing} slotów`, x + w - pad, ry + 10);
    ctx.textAlign = 'left';
  }

  // ── PRAWA KOLUMNA: prosperity + zdarzenia ───────────────────────────────────

  _drawRight(ctx, x, y, w, h) {
    const pad = 14;
    const col = this._getSelectedColony();
    const civ = col?.civSystem;
    const pSys = col?.prosperitySystem;

    // ── Nagłówek ──────────────────────────────────────────
    ctx.fillStyle = THEME.bgSecondary;
    ctx.fillRect(x, y, w, TAB_H);
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText('ZDARZENIA SPOŁECZNE', x + pad, y + 20);

    let cy = y + TAB_H + 8;

    // ── Sekcja prosperity ─────────────────────────────────────
    const prosperity = Math.round(pSys?.prosperity ?? 50);
    const target = Math.round(pSys?.targetProsperity ?? 50);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('PROSPERITY', x + pad, cy + 10);
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = prosperity > 60 ? THEME.success : prosperity > 30 ? THEME.warning : THEME.danger;
    ctx.textAlign = 'right';
    ctx.fillText(`${prosperity}`, x + w - pad, cy + 10);
    ctx.textAlign = 'left';
    cy += 18;

    // Pasek gradientowy prosperity
    const barX = x + pad;
    const barW = w - pad * 2;
    const barH = 10;

    // Gradient tło (czerwony → żółty → zielony)
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0.0, '#cc4422');
    grad.addColorStop(0.5, '#ffaa44');
    grad.addColorStop(1.0, '#44ff88');
    ctx.fillStyle = grad;
    ctx.fillRect(barX, cy, barW, barH);

    // Przykryj część za wartością prosperity ciemnym prostokątem
    const prospX = barX + (prosperity / 100) * barW;
    ctx.fillStyle = 'rgba(2,4,5,0.75)';
    ctx.fillRect(prospX, cy, barX + barW - prospX, barH);

    // Notch na 50%
    const notchX = barX + barW * 0.5;
    ctx.strokeStyle = THEME.textDim;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(notchX, cy); ctx.lineTo(notchX, cy + barH); ctx.stroke();

    // Wskaźnik pozycji prosperity
    ctx.fillStyle = THEME.textPrimary;
    ctx.beginPath();
    ctx.moveTo(prospX, cy - 2);
    ctx.lineTo(prospX - 3, cy - 6);
    ctx.lineTo(prospX + 3, cy - 6);
    ctx.fill();

    cy += barH + 8;

    // Rozbicie warstw prosperity
    const layerScores = pSys?.getLayerScores?.() ?? {};
    const LAYER_LABELS = {
      survival:       '🛡 Przetrwanie',
      infrastructure: '🏗 Infrastruktura',
      functioning:    '⚙ Funkcjonowanie',
      comfort:        '🛋 Komfort',
      luxury:         '💎 Luksus',
    };

    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    for (const [key, label] of Object.entries(LAYER_LABELS)) {
      const val = layerScores[key] ?? 0;
      const pct = Math.round(val * 100);
      const color = val >= 0.7 ? THEME.success : val >= 0.3 ? THEME.warning : THEME.danger;

      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(label, x + pad, cy + 9);

      // Mini pasek
      const mbX = x + pad + 110;
      const mbW = w - pad * 2 - 140;
      this._drawBar(ctx, mbX, cy + 3, mbW, 4, val, color, THEME.border);

      ctx.fillStyle = color;
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, x + w - pad, cy + 9);
      ctx.textAlign = 'left';

      cy += 14;
    }

    cy += 6;

    // Epoka i wzrost POP
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const epochNames = { early: 'Wczesna', developing: 'Rozwijająca', advanced: 'Zaawansowana', cosmic: 'Kosmiczna' };
    const epochKey = pSys?._getCurrentEpoch?.()?.key ?? 'early';
    ctx.fillText(`Epoka: ${epochNames[epochKey] ?? epochKey}`, x + pad, cy + 8);
    cy += 14;
    const growthMult = pSys?.getGrowthMultiplier?.() ?? 1.0;
    ctx.fillText(`Wzrost POP: x${growthMult.toFixed(1)}`, x + pad, cy + 8);
    cy += 14;

    // Separator
    cy += 4;
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x + pad, cy); ctx.lineTo(x + w - pad, cy); ctx.stroke();
    cy += 10;

    // ── Lista zdarzeń społecznych ─────────────────────────
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('ZDARZENIA AKTYWNE', x + pad, cy + 8);
    cy += 16;

    // Zbierz kryzysy jako "zdarzenia"
    const events = [];
    if (civ?.isUnrest) {
      events.push({ icon: '🔥', name: 'Zamieszki', desc: 'Efektywność produkcji -30%', active: true });
    }
    if (civ?.isFamine) {
      events.push({ icon: '💀', name: 'Głód', desc: 'Populacja umiera z głodu', active: true });
    }
    // Brownout z resource system
    const rs = col?.resourceSystem;
    if (rs?.energy?.brownout) {
      events.push({ icon: '⚡', name: 'Brownout', desc: 'Deficyt energii — produkcja wstrzymana', active: true });
    }

    if (events.length === 0) {
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText('Brak zdarzeń', x + w / 2, cy + 30);
      ctx.textAlign = 'left';
    } else {
      for (const ev of events) {
        // Ikona + nazwa
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textPrimary;
        ctx.fillText(`${ev.icon} ${ev.name}`, x + pad, cy + 12);

        // Badge
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        if (ev.active) {
          ctx.fillStyle = THEME.danger;
          ctx.textAlign = 'right';
          ctx.fillText('AKTYWNE', x + w - pad, cy + 12);
        }
        ctx.textAlign = 'left';

        // Opis
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(ev.desc, x + pad + 4, cy + 26);

        cy += 36;
      }
    }
  }

  // ── Oblicz satisfaction potrzeb ──────────────────────────────────────────

  _calcNeeds(civ, rs, pop) {
    if (!rs || pop <= 0) {
      return [
        { icon: '🍖', name: 'Żywność', ratio: 1, penalty: '-15/rok' },
        { icon: '💧', name: 'Woda',    ratio: 1, penalty: '-10/rok' },
        { icon: '⚡', name: 'Energia', ratio: 1, penalty: '-15/rok' },
      ];
    }

    // Konsumpcja per POP per rok
    const foodCons  = pop * 3.0;
    const waterCons = pop * 1.5;
    const energyCons = pop * 1.0;

    // Produkcja / zapas
    const foodAmt = (rs.getAmount?.('food') ?? rs.inventory?.get?.('food') ?? 0);
    const waterAmt = (rs.getAmount?.('water') ?? rs.inventory?.get?.('water') ?? 0);
    const energyBal = rs.energy?.balance ?? 0;

    // Ratio: ilość / (roczna konsumpcja × 10) — jak w CivSystem._resourceRatio
    const foodRatio  = foodCons > 0 ? Math.min(1, foodAmt / (foodCons * 10)) : 1;
    const waterRatio = waterCons > 0 ? Math.min(1, waterAmt / (waterCons * 10)) : 1;
    // Energia to flow — ratio z bilansu
    const energyRatio = energyCons > 0 ? Math.min(1, Math.max(0, (energyBal + energyCons) / (energyCons * 2))) : 1;

    return [
      { icon: '🍖', name: 'Żywność', ratio: foodRatio,   penalty: '-15/rok' },
      { icon: '💧', name: 'Woda',    ratio: waterRatio,  penalty: '-10/rok' },
      { icon: '⚡', name: 'Energia', ratio: energyRatio, penalty: '-15/rok' },
    ];
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  _getSelectedColony() {
    const colMgr = window.KOSMOS?.colonyManager;
    return colMgr?.getColony(this._selectedColonyId) ?? null;
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    const { ox, oy, ow, oh } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    // Pochłoń kliknięcia w obszarze overlay
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const hit = this._hitTest(x, y);
    if (hit) {
      this._onHit(hit);
      return true;
    }
    return true; // pochłoń klik w overlayu
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'colony':
        this._selectedColonyId = zone.data.colonyId;
        break;
      case 'tab':
        this._centerTab = zone.data.tab;
        break;
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) return;
    this._hoverZone = this._hitTest(x, y);
    // Wykryj hover nad wierszem kolonii
    this._hoverRowId = null;
    if (this._hoverZone?.type === 'colony') {
      this._hoverRowId = this._hoverZone.data.colonyId;
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const { ox, oy } = this._getOverlayBounds(
      Math.round(window.innerWidth / (Math.min(window.innerWidth / 1280, window.innerHeight / 720))),
      Math.round(window.innerHeight / (Math.min(window.innerWidth / 1280, window.innerHeight / 720)))
    );
    // Scroll w lewej kolumnie
    if (x >= ox && x < ox + LEFT_W) {
      this._scrollOffset = Math.max(0, this._scrollOffset + delta * 0.5);
      return true;
    }
    return false;
  }
}
