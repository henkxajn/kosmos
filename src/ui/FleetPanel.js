// FleetPanel — panel floty (Canvas 2D)
//
// Rysuje listę statków z informacjami o misjach i akcje.
// Zastępuje inline fleet code w UIManager._drawExpeditionsTab().
//
// API:
//   draw(ctx, x, y, w, maxH, state) → finalY
//   handleClick(mx, my) → boolean
//   handleScroll(delta, mx, my) → boolean

import { THEME }              from '../config/ThemeConfig.js';
import { SHIPS }              from '../data/ShipsData.js';
import { HULLS }              from '../data/HullsData.js';
import { effectiveRange }     from '../entities/Vessel.js';
import { getAvailableActions } from '../data/FleetActions.js';
import EventBus               from '../core/EventBus.js';

const ROW_H        = 22;  // wysokość wiersza listy
const DETAIL_H     = 200; // wysokość panelu szczegółów
const ACTION_BTN_H = 22;  // wysokość przycisku akcji
const ACTION_BTN_W = 100; // szerokość przycisku
const PADDING      = 6;
const SCROLL_SPEED = 3;   // wiersze na scroll

// Ikony statusu misji
const PHASE_ICONS = {
  transit_to:   '→',
  executing:    '⊙',
  transit_back: '←',
  complete:     '✓',
  docked:       '⚓',
};

export class FleetPanel {
  constructor() {
    this._scrollOffset  = 0;    // offset listy (wiersze)
    this._selectedId    = null; // vesselId wybranego statku
    this._bounds        = null; // { x, y, w, h } — do hit-test
    this._listBounds    = null; // bounds samej listy
    this._detailBounds  = null; // bounds panelu szczegółów
    this._actionButtons = [];   // { x, y, w, h, action, ok, reason, vessel }
    this._targetPicker  = null; // { open, x, y, w, items[], scrollOffset }
    this._lastState     = null; // referencja do state z ostatniego draw
  }

  /**
   * Rysuj panel floty.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x — lewy górny róg
   * @param {number} y — górny offset
   * @param {number} w — szerokość
   * @param {number} maxH — max wysokość
   * @param {object} state — { vessels[], missionSystem, vesselManager, colonyManager, activePlanetId }
   * @returns {number} finalY — dolna krawędź
   */
  draw(ctx, x, y, w, maxH, state) {
    this._lastState = state;
    this._bounds = { x, y, w, h: maxH };
    this._actionButtons = [];

    const vessels = state.vessels ?? [];
    const ms = state.missionSystem;

    // ── Nagłówek ──
    let cy = y;
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';

    // Podsumowanie floty
    const idle = vessels.filter(v => v.status === 'idle' && v.position.state === 'docked').length;
    const onMission = vessels.filter(v => v.status === 'on_mission' || v.position.state === 'in_transit').length;
    const orbiting = vessels.filter(v => v.position.state === 'orbiting').length;

    ctx.fillText(`FLOTA [${vessels.length}]`, x + PADDING, cy + 14);

    // Status summary
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    const summaryParts = [];
    if (idle > 0)      summaryParts.push(`⚓${idle}`);
    if (onMission > 0) summaryParts.push(`→${onMission}`);
    if (orbiting > 0)  summaryParts.push(`⊙${orbiting}`);
    const summaryText = summaryParts.join('  ');
    ctx.fillText(summaryText, x + w - ctx.measureText(summaryText).width - PADDING, cy + 14);

    cy += 20;

    // Separator
    ctx.strokeStyle = THEME.border;
    ctx.beginPath();
    ctx.moveTo(x + PADDING, cy);
    ctx.lineTo(x + w - PADDING, cy);
    ctx.stroke();
    cy += 4;

    // ── Lista statków ──
    const listStartY = cy;
    const listH = this._selectedId ? Math.min(maxH * 0.4, (vessels.length + 1) * ROW_H) : maxH - (cy - y);
    this._listBounds = { x, y: listStartY, w, h: listH };

    const maxVisible = Math.floor(listH / ROW_H);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, Math.max(0, vessels.length - maxVisible)));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listStartY, w, listH);
    ctx.clip();

    for (let i = this._scrollOffset; i < vessels.length && (i - this._scrollOffset) < maxVisible; i++) {
      const vessel = vessels[i];
      const vy = listStartY + (i - this._scrollOffset) * ROW_H;
      const isSelected = vessel.id === this._selectedId;

      this._drawVesselRow(ctx, x, vy, w, vessel, ms, isSelected);
    }

    ctx.restore();

    cy = listStartY + listH;

    // Scroll indicator
    if (vessels.length > maxVisible) {
      const scrollRatio = this._scrollOffset / Math.max(1, vessels.length - maxVisible);
      const barH = Math.max(10, (maxVisible / vessels.length) * listH);
      const barY = listStartY + scrollRatio * (listH - barH);
      ctx.fillStyle = THEME.borderLight;
      ctx.fillRect(x + w - 3, barY, 2, barH);
    }

    // ── Panel szczegółów (gdy statek wybrany) ──
    if (this._selectedId) {
      const vessel = vessels.find(v => v.id === this._selectedId);
      if (vessel) {
        cy += 2;
        // Separator
        ctx.strokeStyle = THEME.borderActive;
        ctx.beginPath();
        ctx.moveTo(x + PADDING, cy);
        ctx.lineTo(x + w - PADDING, cy);
        ctx.stroke();
        cy += 4;

        cy = this._drawDetail(ctx, x, cy, w, maxH - (cy - y), vessel, state);
      }
    }

    this._bounds.h = cy - y;
    return cy;
  }

  // ── Rysowanie wiersza statku ──────────────────────────────────────────────
  _drawVesselRow(ctx, x, y, w, vessel, ms, isSelected) {
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const icon = ship?.icon ?? '🛸';

    // Tło (highlight dla wybranego)
    if (isSelected) {
      ctx.fillStyle = THEME.borderActive + '30';
      ctx.fillRect(x + 2, y, w - 4, ROW_H - 2);
    }

    // Ikona + nazwa
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = isSelected ? THEME.accent : THEME.textPrimary;
    ctx.textAlign = 'left';
    ctx.fillText(`${icon} ${vessel.name}`, x + PADDING, y + 14);

    // Status misji
    if (ms) {
      const active = ms.getActive().find(m => m.vesselId === vessel.id);
      if (active) {
        const { phase, progressPct } = ms.getMissionProgress(active);
        const phaseIcon = PHASE_ICONS[phase] ?? '?';

        // Cel
        const targetText = active.targetName ?? '???';
        ctx.fillStyle = THEME.textSecondary;
        const rightText = `${phaseIcon} ${targetText}`;
        const rtW = ctx.measureText(rightText).width;

        // Progress bar
        const barW = 50;
        const barH = 6;
        const barX = x + w - PADDING - barW;
        const barY = y + 8;

        // Cel text
        ctx.fillText(rightText, barX - rtW - 6, y + 14);

        // Bar background
        ctx.fillStyle = THEME.border;
        ctx.fillRect(barX, barY, barW, barH);
        // Bar fill
        const fillColor = phase === 'transit_back' ? THEME.warning : THEME.accent;
        ctx.fillStyle = fillColor;
        ctx.fillRect(barX, barY, barW * progressPct, barH);

        // Percent text
        ctx.fillStyle = THEME.textSecondary;
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(progressPct * 100)}%`, x + w - PADDING, y + 14);
        ctx.textAlign = 'left';
      } else {
        // Idle
        ctx.fillStyle = THEME.textSecondary;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.textAlign = 'right';

        // Paliwo
        const fuelPct = vessel.fuel.max > 0 ? Math.round((vessel.fuel.current / vessel.fuel.max) * 100) : 100;
        const fuelColor = fuelPct > 50 ? THEME.success : fuelPct > 20 ? THEME.warning : THEME.danger;
        ctx.fillStyle = fuelColor;
        ctx.fillText(`⛽${fuelPct}%`, x + w - PADDING, y + 14);
        ctx.textAlign = 'left';
      }
    }
  }

  // ── Panel szczegółów ──────────────────────────────────────────────────────
  _drawDetail(ctx, x, y, w, maxH, vessel, state) {
    let cy = y;
    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const ms = state.missionSystem;

    // Nagłówek — nazwa + typ
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${ship?.icon ?? '🛸'} ${vessel.name}`, x + PADDING, cy + 14);

    ctx.fillStyle = THEME.textSecondary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(ship?.namePL ?? vessel.shipId, x + w - PADDING, cy + 14);
    ctx.textAlign = 'left';
    cy += 20;

    // ── Info wiersz: paliwo, zasięg, cargo ──
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const fuelPct = vessel.fuel.max > 0 ? (vessel.fuel.current / vessel.fuel.max) : 1;
    const fuelColor = fuelPct > 0.5 ? THEME.success : fuelPct > 0.2 ? THEME.warning : THEME.danger;

    // Pasek paliwa
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText('Paliwo:', x + PADDING, cy + 10);
    const fuelBarX = x + PADDING + 45;
    const fuelBarW = 60;
    ctx.fillStyle = THEME.border;
    ctx.fillRect(fuelBarX, cy + 2, fuelBarW, 8);
    ctx.fillStyle = fuelColor;
    ctx.fillRect(fuelBarX, cy + 2, fuelBarW * fuelPct, 8);
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(`${vessel.fuel.current.toFixed(1)}/${vessel.fuel.max}`, fuelBarX + fuelBarW + 4, cy + 10);

    // Zasięg
    const range = effectiveRange(vessel);
    ctx.fillStyle = THEME.textSecondary;
    const rangeText = `Zasięg: ${range === Infinity ? '∞' : range.toFixed(1)} AU`;
    ctx.textAlign = 'right';
    ctx.fillText(rangeText, x + w - PADDING, cy + 10);
    ctx.textAlign = 'left';
    cy += 16;

    // Cargo (jeśli ma ładownię)
    if (ship?.cargoCapacity > 0) {
      const cargoUsed = vessel.cargoUsed ?? 0;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`Cargo: ${cargoUsed}/${ship.cargoCapacity} t`, x + PADDING, cy + 10);
      cy += 14;
    }

    // ── Aktywna misja ──
    const active = ms?.getActive().find(m => m.vesselId === vessel.id);
    if (active) {
      const { phase, progressPct } = ms.getMissionProgress(active);
      const eta = ms.getMissionETA(active);
      const mType = ms.getMissionType(active);

      ctx.fillStyle = THEME.borderLight;
      ctx.fillRect(x + PADDING, cy, w - PADDING * 2, 1);
      cy += 4;

      ctx.fillStyle = THEME.accent;
      ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const typeLabels = {
        survey: '🔭 Rozpoznanie', deep_scan: '📡 Skan układu',
        mining: '⛏ Wydobycie',
        transport: '📦 Transport', colonize: '🏗 Kolonizacja',
      };
      ctx.fillText(typeLabels[mType] ?? mType, x + PADDING, cy + 10);

      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(`→ ${active.targetName ?? '???'}`, x + w - PADDING, cy + 10);
      ctx.textAlign = 'left';
      cy += 14;

      // Pasek postępu fazy
      const barX = x + PADDING;
      const barW = w - PADDING * 2;
      ctx.fillStyle = THEME.border;
      ctx.fillRect(barX, cy, barW, 8);
      const pColor = phase === 'transit_back' ? THEME.warning
                   : phase === 'executing'    ? THEME.success
                   : THEME.accent;
      ctx.fillStyle = pColor;
      ctx.fillRect(barX, cy, barW * progressPct, 8);

      // Etykiety fazy
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      const phaseLabels = {
        transit_to: 'W drodze', executing: 'Na orbicie',
        transit_back: 'Powrót', complete: 'Zakończona',
      };
      ctx.fillText(phaseLabels[phase] ?? phase, barX, cy + 18);
      ctx.textAlign = 'right';
      if (eta.transit_to > 0 && phase === 'transit_to') {
        ctx.fillText(`ETA: ${eta.transit_to.toFixed(2)} lat`, barX + barW, cy + 18);
      }
      ctx.textAlign = 'left';
      cy += 22;
    }

    // ── Przyciski akcji ──
    ctx.fillStyle = THEME.borderLight;
    ctx.fillRect(x + PADDING, cy, w - PADDING * 2, 1);
    cy += 6;

    const actions = getAvailableActions(vessel, state);
    const btnPerRow = Math.floor((w - PADDING * 2) / (ACTION_BTN_W + 4));

    for (let i = 0; i < actions.length; i++) {
      const col = i % btnPerRow;
      const row = Math.floor(i / btnPerRow);
      const bx = x + PADDING + col * (ACTION_BTN_W + 4);
      const by = cy + row * (ACTION_BTN_H + 3);

      this._drawActionBtn(ctx, bx, by, ACTION_BTN_W, ACTION_BTN_H, actions[i], vessel);
    }

    const actionRows = Math.ceil(actions.length / btnPerRow);
    cy += actionRows * (ACTION_BTN_H + 3) + 4;

    // ── Mission log (5 ostatnich) ──
    if (vessel.missionLog && vessel.missionLog.length > 0) {
      ctx.fillStyle = THEME.borderLight;
      ctx.fillRect(x + PADDING, cy, w - PADDING * 2, 1);
      cy += 4;

      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText('Dziennik:', x + PADDING, cy + 8);
      cy += 12;

      const logEntries = vessel.missionLog.slice(-5);
      for (const entry of logEntries) {
        const typeColors = {
          info: THEME.textSecondary, success: THEME.success,
          warning: THEME.warning, danger: THEME.danger,
        };
        ctx.fillStyle = typeColors[entry.type] ?? THEME.textSecondary;
        const yearStr = entry.year != null ? `[${entry.year.toFixed(1)}]` : '';
        const logText = `${yearStr} ${entry.text}`;
        // Utnij jeśli za długi
        const maxW = w - PADDING * 2;
        let displayText = logText;
        while (ctx.measureText(displayText).width > maxW && displayText.length > 10) {
          displayText = displayText.slice(0, -4) + '…';
        }
        ctx.fillText(displayText, x + PADDING, cy + 8);
        cy += 11;
      }
    }

    // ── Stats ──
    if (vessel.stats && vessel.stats.missionsComplete > 0) {
      cy += 2;
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillText(
        `Misje: ${vessel.stats.missionsComplete} | ${vessel.stats.distanceTraveled.toFixed(1)} AU | Zasoby: ${vessel.stats.resourcesHauled}`,
        x + PADDING, cy + 8
      );
      cy += 12;
    }

    this._detailBounds = { x, y, w, h: cy - y };
    return cy;
  }

  // ── Przycisk akcji ────────────────────────────────────────────────────────
  _drawActionBtn(ctx, x, y, w, h, actionInfo, vessel) {
    const { action, ok, reason } = actionInfo;

    // Tło
    ctx.fillStyle = ok ? (THEME.borderActive + '40') : (THEME.border + '30');
    ctx.fillRect(x, y, w, h);

    // Ramka
    ctx.strokeStyle = ok ? THEME.borderActive : THEME.border;
    ctx.strokeRect(x, y, w, h);

    // Tekst
    ctx.fillStyle = ok ? THEME.textPrimary : THEME.textSecondary + '80';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${action.icon} ${action.label}`, x + w / 2, y + h / 2 + 3);
    ctx.textAlign = 'left';

    // Zapisz do hit-test
    this._actionButtons.push({ x, y, w, h, action, ok, reason, vessel });
  }

  // ── Obsługa kliknięcia ────────────────────────────────────────────────────
  handleClick(mx, my) {
    if (!this._bounds) return false;
    const { x, y, w, h } = this._bounds;
    if (mx < x || mx > x + w || my < y || my > y + h) return false;

    // Sprawdź kliknięcia na przyciski akcji
    for (const btn of this._actionButtons) {
      if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
        if (btn.ok && btn.action.execute && this._lastState) {
          btn.action.execute(btn.vessel, this._lastState);
        }
        return true;
      }
    }

    // Sprawdź kliknięcia na listę statków
    if (this._listBounds) {
      const lb = this._listBounds;
      if (mx >= lb.x && mx <= lb.x + lb.w && my >= lb.y && my <= lb.y + lb.h) {
        const rowIdx = Math.floor((my - lb.y) / ROW_H) + this._scrollOffset;
        const vessels = this._lastState?.vessels ?? [];
        if (rowIdx >= 0 && rowIdx < vessels.length) {
          const clicked = vessels[rowIdx];
          this._selectedId = (this._selectedId === clicked.id) ? null : clicked.id;
          return true;
        }
      }
    }

    return true; // konsumuj kliknięcie jeśli w bounds
  }

  // ── Obsługa scrolla ───────────────────────────────────────────────────────
  handleScroll(delta, mx, my) {
    if (!this._listBounds) return false;
    const lb = this._listBounds;
    if (mx < lb.x || mx > lb.x + lb.w || my < lb.y || my > lb.y + lb.h) return false;

    this._scrollOffset += delta > 0 ? SCROLL_SPEED : -SCROLL_SPEED;
    this._scrollOffset = Math.max(0, this._scrollOffset);
    return true;
  }

  // ── Reset selekcji ────────────────────────────────────────────────────────
  clearSelection() {
    this._selectedId = null;
  }

  get selectedVesselId() {
    return this._selectedId;
  }

  set selectedVesselId(id) {
    this._selectedId = id;
  }
}
