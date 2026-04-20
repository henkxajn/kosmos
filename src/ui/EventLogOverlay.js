// EventLogOverlay — pełnoekranowy dziennik zdarzeń (Opcja B/3, klawisz L)
//
// Lewa kolumna: lista kanałów z checkboxami, licznikami, przyciskiem "Pokaż wszystko".
// Prawa kolumna: scrollowalna lista wpisów (najnowsze na górze), ikona kanału +
// rok + tekst z kolorem severity (info/warn/alert).
//
// Korzysta z window.KOSMOS.eventLogSystem jako źródła prawdy — żadnej własnej pamięci.

import { BaseOverlay } from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { getLocale } from '../i18n/i18n.js';
import { CHANNELS, CHANNEL_IDS } from '../systems/EventLogSystem.js';
import EntityManager from '../core/EntityManager.js';
import EventBus from '../core/EventBus.js';

const LEFT_W       = 240;  // szerokość lewej kolumny filtrów
const HEADER_H     = 44;   // wysokość nagłówka
const ROW_H        = 22;   // wysokość wiersza (wpis lub kanał)
const CHANNEL_PAD  = 10;

function _shortYear(y) {
  if (y >= 1e9)  return (y / 1e9).toFixed(1) + 'G';
  if (y >= 1e6)  return (y / 1e6).toFixed(1) + 'M';
  if (y >= 1000) return (y / 1000).toFixed(0) + 'k';
  return String(Math.floor(y));
}

function _wrapText(ctx, text, maxWidth) {
  // Prosta obcinanka — overlay ma dość miejsca że zwykle się mieści,
  // ale broni przed bardzo długimi wpisami.
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(0, Math.max(1, lo - 1)) + '…';
}

function _severityColor(sev) {
  if (sev === 'alert') return THEME.danger;
  if (sev === 'warn')  return THEME.warning;
  return null;
}

function _entryColor(entry) {
  const sevColor = _severityColor(entry.severity);
  if (sevColor) return sevColor;
  const chanColors = {
    fleet:  THEME.info,
    civ:    THEME.accent,
    life:   THEME.success,
    combat: THEME.danger,
    trade:  THEME.mint,
    intel:  THEME.purple ?? THEME.accent,
    system: THEME.textSecondary,
  };
  return chanColors[entry.channel] ?? THEME.textSecondary;
}

export class EventLogOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._scrollOffset = 0;  // index najwyższego widocznego wpisu
  }

  show() {
    super.show();
    this._scrollOffset = 0;
  }

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło overlay
    ctx.fillStyle = bgAlpha(0.40);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, ow, oh);

    // Separator lewej kolumny
    ctx.beginPath();
    ctx.moveTo(ox + LEFT_W, oy);
    ctx.lineTo(ox + LEFT_W, oy + oh);
    ctx.stroke();

    // Przycisk zamknij
    const closeX = ox + ow - 24;
    const closeY = oy + 4;
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText('✕', closeX, closeY + 14);
    this._addHit(closeX - 4, closeY, 22, 22, 'close');

    const logSys = window.KOSMOS?.eventLogSystem;
    if (!logSys) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.fillText('Dziennik niedostępny — EventLogSystem niezarejestrowany', ox + 20, oy + 60);
      return;
    }

    this._drawLeft(ctx, ox, oy, LEFT_W, oh, logSys);
    this._drawRight(ctx, ox + LEFT_W, oy, ow - LEFT_W, oh, logSys);
  }

  // ── Lewa kolumna: tytuł + kanały + Pokaż wszystko ──
  _drawLeft(ctx, x, y, w, h, logSys) {
    const pad = 12;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, HEADER_H);
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    const pl = getLocale() === 'pl';
    ctx.fillText(pl ? '📜 DZIENNIK' : '📜 LOG', x + pad, y + 28);

    // Lista kanałów
    const counts = logSys.getCountsByChannel();
    let cy = y + HEADER_H + 8;

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    for (const chanId of CHANNEL_IDS) {
      const chan = CHANNELS[chanId];
      const hidden = logSys.isChannelHidden(chanId);
      const cnt = counts[chanId] ?? 0;

      // Tło wiersza (hover oznaczone)
      const isHover = this._hoverZone?.type === 'channel_toggle' && this._hoverZone?.data?.channelId === chanId;
      if (isHover) {
        ctx.fillStyle = 'rgba(0,255,180,0.05)';
        ctx.fillRect(x, cy, w, ROW_H);
      }

      // Checkbox (prosty: ▣ włączony, ☐ wyłączony)
      const boxX = x + pad;
      ctx.fillStyle = hidden ? THEME.textDim : THEME.accent;
      ctx.fillText(hidden ? '☐' : '▣', boxX, cy + 16);

      // Ikona + nazwa kanału
      ctx.fillStyle = hidden ? THEME.textDim : THEME.textPrimary;
      ctx.fillText(`${chan.icon} ${pl ? chan.labelPL : chan.labelEN}`, boxX + 20, cy + 16);

      // Liczba wpisów w kanale (prawy wyrównany)
      ctx.textAlign = 'right';
      ctx.fillStyle = hidden ? THEME.textDim : THEME.textSecondary;
      ctx.fillText(String(cnt), x + w - pad, cy + 16);
      ctx.textAlign = 'left';

      this._addHit(x, cy, w, ROW_H, 'channel_toggle', { channelId: chanId });
      cy += ROW_H;
    }

    // Separator + przycisk "Pokaż wszystko"
    const anyHidden = CHANNEL_IDS.some(c => logSys.isChannelHidden(c));
    cy += 8;
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + pad, cy);
    ctx.lineTo(x + w - pad, cy);
    ctx.stroke();
    cy += 8;

    if (anyHidden) {
      const btnH = 26;
      const btnX = x + pad;
      const btnW = w - pad * 2;
      const isHover = this._hoverZone?.type === 'show_all';
      ctx.fillStyle = isHover ? 'rgba(255,200,50,0.18)' : 'rgba(255,200,50,0.10)';
      ctx.fillRect(btnX, cy, btnW, btnH);
      ctx.strokeStyle = THEME.warning;
      ctx.lineWidth = 1;
      ctx.strokeRect(btnX + 0.5, cy + 0.5, btnW - 1, btnH - 1);
      ctx.fillStyle = THEME.warning;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(pl ? '↻ Pokaż wszystkie kanały' : '↻ Show all channels', btnX + btnW / 2, cy + 17);
      ctx.textAlign = 'left';
      this._addHit(btnX, cy, btnW, btnH, 'show_all');
    } else {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(pl ? 'Wszystkie kanały aktywne' : 'All channels active', x + pad, cy + 14);
    }
  }

  // ── Prawa kolumna: lista wpisów ──
  _drawRight(ctx, x, y, w, h, logSys) {
    const pad = 12;

    // Nagłówek
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, HEADER_H);
    const visible = logSys.getVisible();
    const totalAll = logSys._entries.length;
    const pl = getLocale() === 'pl';
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent;
    ctx.fillText(pl ? 'HISTORIA ZDARZEŃ' : 'EVENT HISTORY', x + pad, y + 20);
    // Licznik widocznych/wszystkich
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${visible.length}/${totalAll} ${pl ? 'wpisów' : 'entries'}`, x + pad, y + 36);

    // Lista wpisów — scrollowalny obszar
    const listY = y + HEADER_H;
    const listH = h - HEADER_H;
    const rowsVisible = Math.floor(listH / ROW_H);
    const maxScroll = Math.max(0, visible.length - rowsVisible);
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, maxScroll));

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listY, w, listH);
    ctx.clip();

    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    const startIdx = this._scrollOffset;
    const endIdx = Math.min(visible.length, startIdx + rowsVisible);

    for (let i = startIdx; i < endIdx; i++) {
      const entry = visible[i];
      const rowY = listY + (i - startIdx) * ROW_H;
      const clickable = !!entry.entityRef;
      const isHover = clickable
        && this._hoverZone?.type === 'entry'
        && this._hoverZone?.data?.entryId === entry.id;

      // Zebra striping + hover highlight
      if (isHover) {
        ctx.fillStyle = 'rgba(0,255,180,0.08)';
        ctx.fillRect(x + 1, rowY, w - 2, ROW_H);
      } else if ((i - startIdx) % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x + 1, rowY, w - 2, ROW_H);
      }

      // Rok (lewy wyrównany, szary)
      ctx.fillStyle = THEME.textDim;
      const yr = entry.year > 0 ? _shortYear(entry.year) : '---';
      ctx.fillText(yr, x + pad, rowY + 15);

      // Ikona kanału
      const chan = CHANNELS[entry.channel] ?? CHANNELS.system;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(chan.icon, x + pad + 56, rowY + 15);

      // Znacznik severity — kropka po lewej przy alert/warn
      if (entry.severity === 'alert') {
        ctx.fillStyle = THEME.danger;
        ctx.fillRect(x + 2, rowY, 3, ROW_H);
      } else if (entry.severity === 'warn') {
        ctx.fillStyle = THEME.warning;
        ctx.fillRect(x + 2, rowY, 3, ROW_H);
      }

      // Tekst wpisu
      const textX = x + pad + 82;
      const textMaxW = w - pad * 2 - 82 - 14;  // -14 miejsca na scrollbar
      ctx.fillStyle = _entryColor(entry);
      ctx.fillText(_wrapText(ctx, entry.text, textMaxW), textX, rowY + 15);

      // Ikona "klikalne" dla wpisów z entityRef (strzałka przejścia)
      if (clickable) {
        ctx.fillStyle = isHover ? THEME.accent : THEME.textDim;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillText('↗', x + w - 24, rowY + 15);
        ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        // Hit zone dla całego wiersza
        this._addHit(x + 1, rowY, w - 2, ROW_H, 'entry', {
          entryId:   entry.id,
          entityRef: entry.entityRef,
        });
      }
    }

    ctx.restore();

    // Scrollbar
    if (visible.length > rowsVisible) {
      const sbX = x + w - 10;
      const sbY = listY + 4;
      const sbH = listH - 8;
      ctx.fillStyle = THEME.bgTertiary;
      ctx.fillRect(sbX, sbY, 4, sbH);
      const thumbH = Math.max(24, sbH * (rowsVisible / visible.length));
      const thumbY = sbY + (sbH - thumbH) * (startIdx / Math.max(1, maxScroll));
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(sbX, thumbY, 4, thumbH);
    }

    // Komunikat gdy pusto
    if (visible.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      const msg = totalAll > 0
        ? (pl ? 'Brak wpisów po aktywnych filtrach' : 'No entries match active filters')
        : (pl ? 'Dziennik pusty' : 'Log is empty');
      ctx.fillText(msg, x + w / 2, listY + listH / 2);
      ctx.textAlign = 'left';
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const step = delta > 0 ? 1 : -1;
    this._scrollOffset = Math.max(0, this._scrollOffset + step);
    return true;
  }

  _onHit(zone) {
    const logSys = window.KOSMOS?.eventLogSystem;
    if (zone.type === 'close') {
      this.hide();
      if (window.KOSMOS?.overlayManager && window.KOSMOS.overlayManager.active === 'eventLog') {
        window.KOSMOS.overlayManager.active = null;
      }
      return;
    }
    if (zone.type === 'channel_toggle' && logSys) {
      logSys.toggleChannel(zone.data.channelId);
      this._scrollOffset = 0;
      return;
    }
    if (zone.type === 'show_all' && logSys) {
      for (const c of CHANNEL_IDS) {
        if (logSys.isChannelHidden(c)) logSys.toggleChannel(c);
      }
      this._scrollOffset = 0;
      return;
    }
    if (zone.type === 'entry' && zone.data?.entityRef) {
      this._navigateToEntity(zone.data.entityRef);
      return;
    }
  }

  /**
   * Przejście z klikniętego wpisu do encji:
   *  - jeśli encja jest kolonią → switchActiveColony + otwórz ColonyOverlay
   *  - w innym wypadku → emituj body:selected (fokus kamery + BottomContext)
   */
  _navigateToEntity(entityRef) {
    const entity = EntityManager.get(entityRef);
    if (!entity) return;

    const colMgr = window.KOSMOS?.colonyManager;
    const ovMgr  = window.KOSMOS?.overlayManager;

    // Zamknij dziennik
    this.hide();
    if (ovMgr && ovMgr.active === 'eventLog') ovMgr.active = null;

    // Kolonia gracza → przełącz i otwórz Colony Overlay
    if (colMgr?.getColony(entityRef)) {
      colMgr.switchActiveColony(entityRef);
      EventBus.emit('body:selected', { entity });
      if (ovMgr) ovMgr.openPanel('colony');
      return;
    }

    // Inne encje (planeta obca, ciało bez kolonii) → tylko fokus
    EventBus.emit('body:selected', { entity });
  }
}
