// NavPeekCard — CAŁY przycisk (kafelek) wysuwa się w górę nad slotem dolnego paska nawigacji.
//
// Trzymany i sterowany przez BottomNavBar (kompozycja). Na hover slotu kafelek O SZEROKOŚCI SLOTU
// wyjeżdża CAŁY zza paska (translacja w górę, drawer). GRAFIKA przycisku ląduje NA GÓRZE karty jako
// baner z nazwą; dane domeny (NavPeekProviders) POD nią. Wysokość karty DYNAMICZNA — rośnie z liczbą
// wierszy (sekcje/nagłówki/alerty). Slot na pasku staje się pustym gniazdem (grafika „wysunęła się").
// Klik karty otwiera dedykowany overlay. Klip do obszaru NAD paskiem. Dane czytane na żywo co klatkę.

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';
import { CIV_TABS } from './CivPanelDrawer.js';
import { getPeekData } from './NavPeekProviders.js';
import {
  PEEK_CARD_GAP, PEEK_HIDE_DELAY, PEEK_BANNER_H, PEEK_ROW_H, PEEK_HEAD_H, PEEK_PAD_TOP, PEEK_PAD_BOT,
  PEEK_TOP_MARGIN, easeOutCubic, stepProgress, peekCardRestY, peekSlideOffset, peekContentHeight,
  peekRowsStartY, peekRowsTotalHeight, pointInRect,
} from './NavPeekCardLogic.js';

const PAD = 7;

function _toneColor(tone) {
  switch (tone) {
    case 'good':   return THEME.success;
    case 'bad':    return THEME.danger;
    case 'warn':   return THEME.warning;
    case 'accent': return THEME.accent;
    case 'dim':    return THEME.textDim;
    default:       return THEME.textPrimary;
  }
}

export class NavPeekCard {
  constructor() {
    this._groupId = null;
    this._p       = 0;
    this._target  = 0;
    this._lastMs  = 0;
    this._hideAt  = 0;
    this._slotRect = null;
    this._navRect  = null;
    this._img      = null;
    this._W = 0; this._H = 0;
    this._rect = null;
    this._visTopY = 0;
  }

  isActive() { return this._p > 0.001 || this._target === 1; }
  activeGroup() { return this._groupId; }
  peekTopY(groupId) { return (this._groupId === groupId && this._p > 0.001) ? this._visTopY : null; }

  update(groupId, slotRect, navRect, W, H, img) {
    this._slotRect = slotRect; this._navRect = navRect; this._W = W; this._H = H; this._img = img ?? null;
    if (groupId) {
      this._groupId = groupId;
      this._target = 1; this._hideAt = 0;
    } else if (this._target !== 0 && this._hideAt === 0) {
      this._hideAt = Date.now() + PEEK_HIDE_DELAY;
    }
  }

  draw(ctx) {
    const now = Date.now();
    const dt = this._lastMs ? Math.min(now - this._lastMs, 100) : 16;
    this._lastMs = now;
    if (this._hideAt > 0 && now >= this._hideAt) this._target = 0;
    this._p = stepProgress(this._p, this._target, dt);

    if (this._p <= 0.001 && this._target === 0) { this._groupId = null; this._rect = null; this._hideAt = 0; return; }
    if (!this._groupId || !this._slotRect || !this._navRect) { this._rect = null; return; }

    const data = getPeekData(this._groupId);
    if (!data) { this._rect = null; return; }
    const rows = data.rows ?? [];
    // Kotwica dołu karty = DÓŁ PASKA NAWIGACJI (navRect.y + navRect.h), nie sam dół ekranu — karta
    // pokrywa swój pusty socket, ale NIE nachodzi na listwę wyzwalającą dziennik (BOTTOM_LOG_TRIG_H
    // pod paskiem). Ostatni wiersz siada na dolnej krawędzi paska nawigacji.
    const screenBottom = this._navRect.y + this._navRect.h;
    // Wysokość = DOKŁADNIE treść (zero pustej przestrzeni), clamp do miejsca od góry ekranu.
    const H = Math.min(peekContentHeight(rows), Math.max(140, screenBottom - PEEK_TOP_MARGIN));

    const x = Math.round(this._slotRect.x);
    const w = Math.round(this._slotRect.w);
    const restY = Math.round(screenBottom - H);              // dół karty = dół ekranu
    const y = restY + peekSlideOffset(this._p, H);           // slide z dołu ekranu
    this._visTopY = y;
    this._rect = { x, y: restY, w, h: H };
    const alpha = easeOutCubic(Math.min(1, this._p * 2));

    // Klip do KOLUMNY karty, pełna wysokość ekranu (rysuje nad socketem, aż do dołu).
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, 0, w, screenBottom);
    ctx.clip();
    ctx.globalAlpha = alpha;
    this._drawCard(ctx, x, y, w, H, rows);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  _drawCard(ctx, x, y, w, H, rows) {
    const a = hexToRgb(THEME.accent);
    const tab = CIV_TABS.find(tb => tb.id === this._groupId);

    // Tło kafla
    ctx.fillStyle = bgAlpha(0.97);
    ctx.fillRect(x, y, w, H);

    // ── BANER: grafika przycisku na GÓRZE + nazwa ──
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, PEEK_BANNER_H); ctx.clip();
    const img = this._img;
    if (img && img.width > 0 && img.height > 0) {
      const srcAR = img.width / img.height, dstAR = w / PEEK_BANNER_H;
      let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (srcAR > dstAR)      { sw = img.height * dstAR; sx = (img.width - sw) / 2; }
      else if (srcAR < dstAR) { sh = img.width / dstAR;  sy = (img.height - sh) / 2; }
      ctx.drawImage(img, sx, sy, sw, sh, x, y, w, PEEK_BANNER_H);
    } else {
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${Math.round(PEEK_BANNER_H * 0.5)}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(tab?.icon ?? '•', x + w / 2, y + PEEK_BANNER_H / 2 - 4);
    }
    const grad = ctx.createLinearGradient(x, y + PEEK_BANNER_H - 18, x, y + PEEK_BANNER_H);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + PEEK_BANNER_H - 18, w, 18);
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.textPrimary;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillText(this._ellipsize(ctx, (t(tab?.labelKey ?? this._groupId) || '').toUpperCase(), w - PAD * 2 - 16), x + PAD, y + PEEK_BANNER_H - 5);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    if (tab?.key) {
      ctx.textAlign = 'right';
      ctx.fillStyle = THEME.accent;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(`[${tab.key}]`, x + w - PAD, y + PEEK_BANNER_H - 5);
    }
    ctx.restore();

    // Ramka: GÓRA + BOKI (bez dołu — bezszwowe połączenie z gniazdem)
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.55)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + H);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + H);
    ctx.stroke();
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},0.9)`;
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},0.35)`;
    ctx.fillRect(x, y + PEEK_BANNER_H, w, 1);

    // ── Wiersze (kv / head / alert) — DOSUNIĘTE DO DOŁU: ostatni wiersz przy krawędzi karty
    //    dla KAŻDEGO kafla; ubogie karty mają lukę między banerem a danymi. Bogate (przepełnione)
    //    wyrównują do góry i ucinają nadmiar u dołu (guard). ──
    const contentW = w - PAD * 2;
    const bottomLimit = y + H - PEEK_PAD_BOT;
    let ry = peekRowsStartY(y, H, peekRowsTotalHeight(rows));
    for (const r of rows) {
      const rh = r.kind === 'head' ? PEEK_HEAD_H : PEEK_ROW_H;
      if (ry + rh > bottomLimit + 0.5) break;
      if (r.kind === 'head') this._drawHead(ctx, x, ry, w, r);
      else if (r.kind === 'alert') this._drawAlert(ctx, x, ry, w, contentW, r);
      else this._drawKv(ctx, x, ry, w, contentW, r);
      ry += rh;
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  _drawHead(ctx, x, ry, w, r) {
    const a = hexToRgb(THEME.accent);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(this._ellipsize(ctx, r.label ?? '', w - PAD * 2), x + PAD, ry + PEEK_HEAD_H / 2 + 1);
    ctx.strokeStyle = `rgba(${a.r},${a.g},${a.b},0.15)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + PAD, ry + PEEK_HEAD_H - 0.5); ctx.lineTo(x + w - PAD, ry + PEEK_HEAD_H - 0.5);
    ctx.stroke();
  }

  _drawKv(ctx, x, ry, w, contentW, r) {
    const cy = ry + PEEK_ROW_H / 2 - 1;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = _toneColor(r.tone);
    const val = r.value ?? '';
    ctx.fillText(val, x + w - PAD, cy);
    const valW = ctx.measureText(val).width;
    ctx.textAlign = 'left';
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(this._ellipsize(ctx, r.label ?? '', contentW - valW - 8), x + PAD, cy);
    if (r.bar) this._bar(ctx, x + PAD, ry + PEEK_ROW_H - 3, contentW, 2, r.bar.frac, _toneColor(r.bar.tone));
  }

  _drawAlert(ctx, x, ry, w, contentW, r) {
    const col = _toneColor(r.tone);
    const c = hexToRgb(col);
    ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},0.16)`;
    ctx.fillRect(x + PAD, ry + 1, contentW, PEEK_ROW_H - 2);
    ctx.fillStyle = col;
    ctx.fillRect(x + PAD, ry + 1, 2, PEEK_ROW_H - 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText('⚠ ' + this._ellipsize(ctx, r.label ?? '', contentW - 14), x + PAD + 6, ry + PEEK_ROW_H / 2);
  }

  _bar(ctx, x, y, w, h, frac, color) {
    ctx.fillStyle = THEME.bgTertiary;
    ctx.fillRect(x, y, w, h);
    const fw = Math.round(Math.max(0, Math.min(1, frac || 0)) * w);
    if (fw > 0) { ctx.fillStyle = color; ctx.fillRect(x, y, fw, h); }
  }

  _ellipsize(ctx, str, maxW) {
    if (maxW <= 0) return '';
    if (ctx.measureText(str).width <= maxW) return str;
    let s = str;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  isOver(x, y) { return this._p > 0.35 && pointInRect(this._rect, x, y); }

  handleClick(x, y) {
    if (!this.isOver(x, y) || !this._groupId) return false;
    const om = window.KOSMOS?.overlayManager;
    if (om) om.openPanel(this._groupId);
    return true;
  }
}
