// CivPanelDrawer — sidebar nawigacyjny CivPanel
//
// Rysuje pionowy sidebar z 5 przyciskami otwierającymi overlay:
// Gospodarka (E), Populacja (P), Technologie (T), Flota (F), Kolonie (C).
// Czyste funkcje importowane przez UIManager.

import { THEME, bgAlpha, hexToRgb } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';

// ── Stałe ──────────────────────────────────────────────────
export const CIV_SIDEBAR_W    = 30;
export const CIV_SIDEBAR_BTN  = 28;
export const CIV_SIDEBAR_GAP  = 1;
export const CIV_SIDEBAR_PAD  = 2;

export const CIV_TABS = [
  { id: 'economy',    icon: '⚙', labelKey: 'civPanel.economy',    key: 'E' },
  { id: 'population', icon: '👤', labelKey: 'civPanel.population', key: 'P' },
  { id: 'tech',       icon: '🧬', labelKey: 'civPanel.tech',       key: 'T' },
  { id: 'fleet',      icon: '🚀', labelKey: 'civPanel.fleet',      key: 'F' },
  { id: 'colony',     icon: '🏠', labelKey: 'civPanel.colonies',   key: 'C' },
  { id: 'galaxy',     icon: '🌌', labelKey: 'civPanel.galaxy',     key: 'G' },
];

// ── Sidebar ────────────────────────────────────────────────
// fullH — opcjonalna pełna wysokość sidebara (od panelY do dolnego paska)
export function drawCivPanelSidebar(ctx, panelY, activeTab, fullH) {
  const sx = 0;
  const sy = panelY;
  const buttonsH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                 + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
  const sidebarH = fullH || buttonsH;

  // Tło sidebara — pełna wysokość
  ctx.fillStyle = bgAlpha(0.92);
  ctx.fillRect(sx, sy, CIV_SIDEBAR_W, sidebarH);
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + CIV_SIDEBAR_W, sy);
  ctx.lineTo(sx + CIV_SIDEBAR_W, sy + sidebarH);
  ctx.stroke();

  CIV_TABS.forEach((tab, i) => {
    const btnY = sy + CIV_SIDEBAR_PAD + i * (CIV_SIDEBAR_BTN + CIV_SIDEBAR_GAP);
    const active = activeTab === tab.id;

    // Tło przycisku
    const _bAc = hexToRgb(THEME.borderActive);
    const _bPr = hexToRgb(THEME.bgPrimary);
    ctx.fillStyle = active
      ? `rgba(${_bAc.r},${_bAc.g},${_bAc.b},0.35)`
      : `rgba(${_bPr.r},${_bPr.g},${_bPr.b},0.80)`;
    ctx.fillRect(sx, btnY, CIV_SIDEBAR_W, CIV_SIDEBAR_BTN);

    // Aktywny — border-left accent
    if (active) {
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(sx, btnY, 3, CIV_SIDEBAR_BTN);
    }

    // Ikona emoji (wyżej — robimy miejsce na literę skrótu)
    ctx.font = `${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.textPrimary : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab.icon, sx + CIV_SIDEBAR_W / 2, btnY + CIV_SIDEBAR_BTN / 2 - 5);

    // Litera skrótu pod ikoną
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.accent : THEME.textDim;
    ctx.fillText(tab.key, sx + CIV_SIDEBAR_W / 2, btnY + CIV_SIDEBAR_BTN - 5);
  });

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Hit test sidebar ───────────────────────────────────────
// fullH — opcjonalna pełna wysokość sidebara
export function hitTestSidebar(x, y, panelY, fullH) {
  const buttonsH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                 + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
  const sidebarH = fullH || buttonsH;

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
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}
