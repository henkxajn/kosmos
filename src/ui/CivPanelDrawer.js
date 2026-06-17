// CivPanelDrawer — sidebar nawigacyjny CivPanel
//
// Rysuje pionowy sidebar z 5 przyciskami otwierającymi overlay:
// Gospodarka (E), Populacja (P), Technologie (T), Flota (F), Kolonie (C).
// Czyste funkcje importowane przez UIManager.

import { THEME, bgAlpha, hexToRgb, GLASS_BORDER_SIDE } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';

// ── Stałe ──────────────────────────────────────────────────
export const CIV_SIDEBAR_W    = 0;    // Slice 4 — pionowy sidebar usunięty (nav na górze); lewa krawędź = 0
export const CIV_SIDEBAR_BTN  = 28;
export const CIV_SIDEBAR_GAP  = 1;
export const CIV_SIDEBAR_PAD  = 2;

export const CIV_TABS = [
  { id: 'economy',      icon: '⚙', labelKey: 'civPanel.economy',      key: 'E' },
  { id: 'population',   icon: '👤', labelKey: 'civPanel.population',   key: 'P' },
  { id: 'tech',         icon: '🧬', labelKey: 'civPanel.tech',         key: 'T' },
  { id: 'fleet',        icon: '🚀', labelKey: 'civPanel.fleet',        key: 'F' },
  { id: 'colony',       icon: '🏠', labelKey: 'civPanel.colonies',     key: 'C' },
  { id: 'trade',          icon: '🏪', labelKey: 'civPanel.trade',         key: 'H' },
  { id: 'civilization',  icon: '🏛', labelKey: 'civPanel.civilization', key: 'V' },
  { id: 'observatory',   icon: '🔭', labelKey: 'civPanel.observatory',  key: 'O' },
  { id: 'unit_design',   icon: '🔧', labelKey: 'civPanel.unitDesign',   key: 'U' },
  { id: 'dyson',         icon: '⭐', labelKey: 'civPanel.dyson',        key: 'D' },
  { id: 'galaxy',        icon: '🌌', labelKey: 'civPanel.galaxy',       key: 'G' },
  { id: 'intel',         icon: '👁', labelKey: 'civPanel.intel',        key: 'I' },
  { id: 'diplomacy',     icon: '🤝', labelKey: 'civPanel.diplomacy',    key: 'Y' },
  { id: 'war',           icon: '⚔', labelKey: 'civPanel.war',          key: 'W' },
];

// ── Sidebar ────────────────────────────────────────────────
// fullH — opcjonalna pełna wysokość sidebara (od panelY do dolnego paska)
export function drawCivPanelSidebar(ctx, panelY, activeTab, fullH) {
  const sx = 0;
  const sy = panelY;
  const buttonsH = CIV_SIDEBAR_PAD + CIV_TABS.length * CIV_SIDEBAR_BTN
                 + (CIV_TABS.length - 1) * CIV_SIDEBAR_GAP;
  const sidebarH = fullH || buttonsH;

  // Tło sidebara — pełna wysokość (glass)
  ctx.fillStyle = bgAlpha(0.42);
  ctx.fillRect(sx, sy, CIV_SIDEBAR_W, sidebarH);
  ctx.strokeStyle = GLASS_BORDER_SIDE;
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
      ? `rgba(${_bAc.r},${_bAc.g},${_bAc.b},0.25)`
      : `rgba(${_bPr.r},${_bPr.g},${_bPr.b},0.32)`;
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

// ── Poziomy pasek nawigacji (Slice 4 — w TopBarze, zastępuje pionowy sidebar) ─
export const CIV_NAV_BTN_W = 40;   // Slice 4 — szerszy slot = większy odstęp między ikonami (rozmiar ikony bez zmian)

// Rysuje CIV_TABS jako rząd ikon od x0, w pasku o wysokości barH. activeTab = id otwartego overlayu.
export function drawTopNav(ctx, x0, barH, activeTab) {
  let x = x0;
  for (const tab of CIV_TABS) {
    const active = activeTab === tab.id;
    if (active) {
      const a = hexToRgb(THEME.borderActive);
      ctx.fillStyle = `rgba(${a.r},${a.g},${a.b},0.25)`;
      ctx.fillRect(x, 0, CIV_NAV_BTN_W, barH);
      ctx.fillStyle = THEME.accent;
      ctx.fillRect(x, barH - 3, CIV_NAV_BTN_W, 3); // dolny akcent (pasek poziomy)
    }
    ctx.font = `${THEME.fontSizeTitle}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.textPrimary : THEME.textSecondary;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tab.icon, x + CIV_NAV_BTN_W / 2, barH / 2 - 4);
    ctx.font = `${THEME.fontSizeSmall - 2}px ${THEME.fontFamily}`;
    ctx.fillStyle = active ? THEME.accent : THEME.textDim;
    ctx.fillText(tab.key, x + CIV_NAV_BTN_W / 2, barH - 6);
    x += CIV_NAV_BTN_W;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  return x; // prawa krawędź nav
}

export function hitTestTopNav(x, y, x0, barH) {
  if (y < 0 || y > barH || x < x0) return null;
  const idx = Math.floor((x - x0) / CIV_NAV_BTN_W);
  if (idx < 0 || idx >= CIV_TABS.length) return null;
  return CIV_TABS[idx].id;
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
