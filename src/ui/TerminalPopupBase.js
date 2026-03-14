// TerminalPopupBase — wspólna baza dla popupów w stylu Amber Terminal
//
// Dostarcza: CSS injection, konfigurację severity, ikony SVG,
// builder DOM (overlay + panel z CRT), helpery formatowania.
// Używany przez MissionEventModal i EventChoiceModal.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { t }              from '../i18n/i18n.js';

// ── Inline SVG ikony (monochrome, currentColor) ─────────────────────

export const SVG_ICONS = {
  // Reaktor / alarm krytyczny
  alert: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <circle cx="36" cy="36" r="33" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3"/>
    <circle cx="36" cy="36" r="18" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="36" cy="36" r="10" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1"/>
    <line x1="36" y1="3" x2="36" y2="15" stroke="currentColor" stroke-width="1.5"/>
    <line x1="36" y1="57" x2="36" y2="69" stroke="currentColor" stroke-width="1.5"/>
    <line x1="3" y1="36" x2="15" y2="36" stroke="currentColor" stroke-width="1.5"/>
    <line x1="57" y1="36" x2="69" y2="36" stroke="currentColor" stroke-width="1.5"/>
    <polygon points="36,24 44,40 28,40" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>
    <line x1="36" y1="28" x2="36" y2="35" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="36" cy="38" r="1.2" fill="currentColor"/>
  </svg>`,

  // Katastrofa / eksplozja
  disaster: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <circle cx="36" cy="36" r="28" stroke="currentColor" stroke-width="1" stroke-dasharray="3 4" opacity="0.4"/>
    <polygon points="36,8 42,28 60,28 46,40 52,60 36,48 20,60 26,40 12,28 30,28" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="36" cy="36" r="8" fill="currentColor" fill-opacity="0.2" stroke="currentColor" stroke-width="1"/>
    <line x1="36" y1="2" x2="36" y2="10" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <line x1="36" y1="62" x2="36" y2="70" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <line x1="2" y1="36" x2="10" y2="36" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <line x1="62" y1="36" x2="70" y2="36" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  </svg>`,

  // Kolonia / baza
  colony: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <line x1="4" y1="56" x2="68" y2="56" stroke="currentColor" stroke-width="1" opacity="0.3"/>
    <path d="M22 56 C22 40 50 40 50 56" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-width="1.5"/>
    <line x1="36" y1="40" x2="36" y2="56" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <line x1="22" y1="50" x2="50" y2="50" stroke="currentColor" stroke-width="0.8" opacity="0.4"/>
    <rect x="32" y="44" width="8" height="12" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1"/>
    <line x1="36" y1="30" x2="36" y2="40" stroke="currentColor" stroke-width="1.2"/>
    <polygon points="36,30 44,33 36,36" fill="currentColor" opacity="0.9"/>
    <rect x="10" y="50" width="10" height="6" rx="1" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <rect x="52" y="50" width="10" height="6" rx="1" fill="currentColor" fill-opacity="0.05" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <ellipse cx="36" cy="16" rx="16" ry="5" stroke="currentColor" stroke-width="1" stroke-dasharray="3 2" opacity="0.4"/>
  </svg>`,

  // Rozpoznanie / teleskop
  recon: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <circle cx="44" cy="28" r="16" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="44" cy="28" r="10" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <circle cx="44" cy="28" r="4" fill="currentColor" fill-opacity="0.15"/>
    <line x1="32" y1="40" x2="18" y2="58" stroke="currentColor" stroke-width="2"/>
    <line x1="14" y1="54" x2="22" y2="62" stroke="currentColor" stroke-width="2"/>
    <circle cx="12" cy="12" r="1.5" fill="currentColor" opacity="0.6"/>
    <circle cx="62" cy="14" r="1" fill="currentColor" opacity="0.4"/>
    <circle cx="20" cy="20" r="0.8" fill="currentColor" opacity="0.3"/>
    <circle cx="56" cy="52" r="1.2" fill="currentColor" opacity="0.5"/>
  </svg>`,

  // Odkrycie / gwiazda
  discovery: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <polygon points="36,6 42,26 62,26 46,38 52,58 36,46 20,58 26,38 10,26 30,26" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="36" cy="36" r="8" fill="currentColor" fill-opacity="0.2"/>
    <circle cx="36" cy="36" r="3" fill="currentColor" fill-opacity="0.5"/>
    <line x1="36" y1="2" x2="36" y2="8" stroke="currentColor" stroke-width="1.2"/>
    <line x1="36" y1="64" x2="36" y2="70" stroke="currentColor" stroke-width="1.2"/>
    <line x1="2" y1="36" x2="8" y2="36" stroke="currentColor" stroke-width="1.2"/>
    <line x1="64" y1="36" x2="70" y2="36" stroke="currentColor" stroke-width="1.2"/>
  </svg>`,

  // Uderzenie / meteor
  impact: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <ellipse cx="36" cy="54" rx="24" ry="6" stroke="currentColor" stroke-width="1" opacity="0.3"/>
    <circle cx="36" cy="30" r="14" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="34" cy="28" r="4" fill="currentColor" fill-opacity="0.15"/>
    <circle cx="42" cy="34" r="2.5" fill="currentColor" fill-opacity="0.12"/>
    <line x1="50" y1="12" x2="44" y2="20" stroke="currentColor" stroke-width="1.5"/>
    <line x1="54" y1="18" x2="46" y2="22" stroke="currentColor" stroke-width="1"/>
    <line x1="46" y1="8" x2="42" y2="18" stroke="currentColor" stroke-width="1"/>
    <line x1="28" y1="44" x2="20" y2="56" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <line x1="36" y1="44" x2="36" y2="58" stroke="currentColor" stroke-width="1" opacity="0.5"/>
    <line x1="44" y1="44" x2="52" y2="56" stroke="currentColor" stroke-width="1" opacity="0.5"/>
  </svg>`,

  // Raport / dane
  report: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <rect x="14" y="8" width="44" height="56" rx="2" stroke="currentColor" stroke-width="1.5" fill="currentColor" fill-opacity="0.04"/>
    <line x1="22" y1="20" x2="50" y2="20" stroke="currentColor" stroke-width="1.5"/>
    <line x1="22" y1="28" x2="44" y2="28" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <line x1="22" y1="34" x2="50" y2="34" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <line x1="22" y1="40" x2="38" y2="40" stroke="currentColor" stroke-width="1" opacity="0.6"/>
    <line x1="22" y1="48" x2="50" y2="48" stroke="currentColor" stroke-width="1" opacity="0.4"/>
    <line x1="22" y1="54" x2="42" y2="54" stroke="currentColor" stroke-width="1" opacity="0.4"/>
    <circle cx="48" cy="52" r="6" fill="currentColor" fill-opacity="0.1" stroke="currentColor" stroke-width="1"/>
    <path d="M46 52 L48 54 L52 49" stroke="currentColor" stroke-width="1.2" fill="none"/>
  </svg>`,

  // Złoża / kryształy
  deposit: `<svg width="64" height="64" viewBox="0 0 72 72" fill="none">
    <rect x="4" y="50" width="64" height="3" rx="1" fill="currentColor" opacity="0.4"/>
    <polygon points="36,20 42,30 36,34 30,30" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <polygon points="36,34 44,40 36,46 28,40" fill="currentColor" fill-opacity="0.15" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
    <polygon points="26,28 32,36 24,40 18,32" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
    <polygon points="46,28 54,32 50,42 42,36" fill="currentColor" fill-opacity="0.08" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
    <circle cx="36" cy="36" r="4" fill="currentColor" opacity="0.5"/>
    <line x1="36" y1="8" x2="36" y2="16" stroke="currentColor" stroke-width="1.5"/>
    <line x1="58" y1="14" x2="52" y2="20" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
    <line x1="14" y1="14" x2="20" y2="20" stroke="currentColor" stroke-width="1.2" opacity="0.6"/>
  </svg>`,
};

// ── Konfiguracja severity ───────────────────────────────────────────

export function getSeverityConfig(severity) {
  const { r, g, b } = hexToRgb(THEME.bgPrimary);
  const darkText = `rgb(${Math.max(r - 5, 0)},${Math.max(g - 5, 0)},${Math.max(b - 5, 0)})`;

  const configs = {
    danger: {
      borderColor:  THEME.danger,
      accentColor:  THEME.danger,
      barBg:        null, // animowany — CSS klasa
      barClass:     'at-bar-striped',
      barTextColor: '#fff',
      glowShadow:   `0 0 30px ${_rgba(THEME.danger, 0.12)}, inset 0 0 40px ${_rgba(THEME.danger, 0.04)}`,
      panelClass:   'at-flicker',
      fanfare:      false,
      defaultSvg:   'alert',
      defaultLabel: t('terminal.alarm'),
      sweepColor:   THEME.danger,
    },
    success: {
      borderColor:  THEME.success,
      accentColor:  THEME.success,
      barBg:        THEME.success,
      barClass:     '',
      barTextColor: darkText,
      glowShadow:   `0 0 20px ${_rgba(THEME.success, 0.1)}`,
      panelClass:   '',
      fanfare:      false,
      defaultSvg:   'colony',
      defaultLabel: t('terminal.ok'),
      sweepColor:   THEME.success,
    },
    info: {
      borderColor:  THEME.accent,
      accentColor:  THEME.accent,
      barBg:        THEME.accent,
      barClass:     '',
      barTextColor: darkText,
      glowShadow:   `0 0 20px ${_rgba(THEME.accent, 0.08)}`,
      panelClass:   '',
      fanfare:      false,
      defaultSvg:   'report',
      defaultLabel: t('terminal.info'),
      sweepColor:   THEME.accent,
    },
    discovery: {
      borderColor:  THEME.accent,
      accentColor:  THEME.accent,
      barBg:        null, // animowany shimmer
      barClass:     'at-bar-shimmer',
      barTextColor: darkText,
      glowShadow:   `0 0 40px ${_rgba(THEME.accent, 0.18)}, 0 0 80px ${_rgba(THEME.accent, 0.06)}`,
      panelClass:   'at-gold-aura',
      fanfare:      true,
      defaultSvg:   'discovery',
      defaultLabel: t('terminal.new'),
      sweepColor:   THEME.accent,
    },
  };

  return configs[severity] ?? configs.info;
}

function _rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── CSS injection ───────────────────────────────────────────────────

let _cssInjected = false;

export function injectTerminalPopupCSS() {
  // Zawsze usuń i wstaw ponownie (THEME może się zmienić)
  const existing = document.getElementById('at-popup-css');
  if (existing) existing.remove();

  const dangerRgb = hexToRgb(THEME.danger);
  const dangerDimRgb = hexToRgb(THEME.dangerDim ?? THEME.danger);
  const accentRgb = hexToRgb(THEME.accent);
  const bgRgb = hexToRgb(THEME.bgPrimary);

  const style = document.createElement('style');
  style.id = 'at-popup-css';
  style.textContent = `
    /* ── Animacje ── */
    @keyframes atFadeIn {
      from { transform: translateY(-20px) scale(0.97); opacity: 0; }
      to   { transform: translateY(0) scale(1);        opacity: 1; }
    }
    @keyframes atSweep {
      0%   { top: -2px; }
      100% { top: 100%; }
    }
    @keyframes atStriped {
      to { background-position: 36px 0; }
    }
    @keyframes atShimmer {
      to { background-position: 300% 0; }
    }
    @keyframes atGoldAura {
      0%,100% { box-shadow: 0 0 40px ${_rgba(THEME.accent, 0.18)}, 0 0 80px ${_rgba(THEME.accent, 0.06)}; }
      50%     { box-shadow: 0 0 60px ${_rgba(THEME.accent, 0.35)}, 0 0 120px ${_rgba(THEME.accent, 0.12)}; }
    }
    @keyframes atCritFlicker {
      0%,91%,93%,95%,100% { opacity: 1; }
      92%,94% { opacity: 0.85; }
    }
    @keyframes atFanfare {
      from { transform: translateX(100%); }
      to   { transform: translateX(-200%); }
    }
    @keyframes atPulseRing {
      0%   { transform: scale(0.85); opacity: 0.25; }
      100% { transform: scale(1.4);  opacity: 0; }
    }
    @keyframes atBlink {
      0%,100% { opacity: 1; }
      50%     { opacity: 0; }
    }

    /* ── Overlay ── */
    .at-overlay {
      position: fixed; inset: 0;
      background: rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.78);
      z-index: 100;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Panel ── */
    .at-panel {
      max-width: 580px; width: 92%;
      font-family: ${THEME.fontFamily};
      position: relative;
      overflow: hidden;
      animation: atFadeIn 0.35s ease-out;
    }
    .at-flicker { animation: atFadeIn 0.35s ease-out, atCritFlicker 9s ease-in-out infinite; }
    .at-gold-aura { animation: atFadeIn 0.35s ease-out, atGoldAura 3s ease-in-out infinite; }

    /* ── CRT warstwy (wewnątrz panelu) ── */
    .at-vignette {
      position: absolute; inset: 0;
      background: radial-gradient(ellipse at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%);
      pointer-events: none; z-index: 30;
    }
    .at-scanlines {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.07) 3px, rgba(0,0,0,0.07) 4px);
      pointer-events: none; z-index: 30;
    }
    .at-sweep {
      position: absolute; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, currentColor, transparent);
      opacity: 0.12;
      pointer-events: none; z-index: 25;
      animation: atSweep 6s linear infinite;
    }

    /* ── Top Bar ── */
    .at-bar {
      padding: 5px 16px;
      display: flex; justify-content: space-between; align-items: center;
      position: relative; z-index: 10;
    }
    .at-bar-striped {
      background: repeating-linear-gradient(90deg,
        rgba(${dangerRgb.r},${dangerRgb.g},${dangerRgb.b},1) 0px,
        rgba(${dangerRgb.r},${dangerRgb.g},${dangerRgb.b},1) 18px,
        rgba(${dangerDimRgb.r},${dangerDimRgb.g},${dangerDimRgb.b},1) 18px,
        rgba(${dangerDimRgb.r},${dangerDimRgb.g},${dangerDimRgb.b},1) 36px);
      background-size: 36px 100%;
      animation: atStriped 0.7s linear infinite;
    }
    .at-bar-shimmer {
      background: linear-gradient(90deg,
        ${_rgba(THEME.accent, 0.7)},
        ${THEME.accent},
        ${_rgba(THEME.accent, 0.6)},
        ${THEME.accent},
        ${_rgba(THEME.accent, 0.7)});
      background-size: 300% 100%;
      animation: atShimmer 2.5s linear infinite;
    }
    .at-bar-title {
      font-size: ${THEME.fontSizeLarge}px;
      letter-spacing: 2px;
      font-weight: bold;
    }
    .at-bar-right {
      font-size: ${THEME.fontSizeSmall + 1}px;
      opacity: 0.55;
    }

    /* ── Fanfare ticker ── */
    .at-fanfare {
      text-align: center; padding: 5px;
      font-size: ${THEME.fontSizeSmall}px;
      letter-spacing: 5px;
      opacity: 0.5;
      overflow: hidden; white-space: nowrap;
      position: relative; z-index: 10;
    }
    .at-fanfare span {
      display: inline-block;
      animation: atFanfare 8s linear infinite;
    }

    /* ── Body (2 kolumny) ── */
    .at-body {
      display: grid;
      grid-template-columns: 110px 1fr;
      gap: 0;
      min-height: 160px;
      position: relative; z-index: 10;
    }

    /* ── SVG panel (lewa kolumna) ── */
    .at-svg-panel {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 10px; padding: 16px 10px;
      position: relative;
    }
    .at-svg-panel svg {
      filter: drop-shadow(0 0 8px currentColor);
    }
    .at-svg-ring {
      position: absolute;
      width: 78px; height: 78px;
      border-radius: 50%;
      border: 1px solid currentColor;
      opacity: 0.12;
      animation: atPulseRing 2s ease-out infinite;
    }
    .at-svg-label {
      font-size: ${THEME.fontSizeSmall + 1}px;
      letter-spacing: 2px;
      text-align: center;
      line-height: 1.3;
      text-shadow: 0 0 10px currentColor;
    }

    /* ── Prawa kolumna ── */
    .at-right {
      padding: 14px 16px 10px;
      display: flex; flex-direction: column; gap: 4px;
      max-height: 55vh; overflow-y: auto;
    }
    .at-right::-webkit-scrollbar { width: 4px; }
    .at-right::-webkit-scrollbar-thumb { background: ${THEME.borderLight}; border-radius: 2px; }

    .at-prompt {
      font-size: ${THEME.fontSizeSmall + 1}px;
      opacity: 0.45;
    }
    .at-headline {
      font-size: ${THEME.fontSizeTitle + 4}px;
      line-height: 1.1;
      text-shadow: 0 0 18px currentColor;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .at-desc {
      font-size: ${THEME.fontSizeNormal + 1}px;
      line-height: 1.5;
      margin-top: 2px;
      opacity: 0.7;
    }

    /* ── Stat lines ── */
    .at-stat {
      font-size: ${THEME.fontSizeNormal + 1}px;
      line-height: 1.5;
      display: flex; gap: 6px;
    }
    .at-stat-prefix { opacity: 0.5; }
    .at-stat-label  { opacity: 0.65; }
    .at-stat-value  { margin-left: auto; }
    .at-stat-pos    { color: ${THEME.success}; }
    .at-stat-neg    { color: ${THEME.danger}; }
    .at-stat-neu    { color: ${THEME.warning}; }
    .at-stat-gld    { color: ${THEME.accent}; text-shadow: 0 0 8px ${THEME.accent}; }
    .at-stat-dim    { color: ${THEME.textDim}; }

    /* ── Sekcja ── */
    .at-section {
      margin-top: 8px; padding-top: 6px;
    }
    .at-section-title {
      font-size: ${THEME.fontSizeSmall}px;
      text-transform: uppercase;
      letter-spacing: 2px;
      margin-bottom: 4px;
      opacity: 0.5;
    }

    /* ── Grid zasobów ── */
    .at-resources {
      display: grid; grid-template-columns: 1fr 1fr;
      gap: 1px 12px;
    }

    /* ── Kursor ── */
    .at-cursor {
      display: inline-block;
      width: 8px; height: ${THEME.fontSizeNormal + 1}px;
      background: currentColor;
      animation: atBlink 1s step-end infinite;
      vertical-align: middle;
      margin-left: 3px;
    }

    /* ── Footer / przyciski ── */
    .at-footer {
      padding: 8px 14px 12px;
      display: flex; gap: 4px; flex-wrap: wrap;
      position: relative; z-index: 10;
    }
    .at-btn {
      font-family: ${THEME.fontFamily};
      font-size: ${THEME.fontSizeNormal + 2}px;
      letter-spacing: 1px;
      background: transparent;
      padding: 5px 14px;
      cursor: pointer;
      transition: all 0.12s;
    }
    .at-btn:hover {
      color: ${THEME.bgPrimary} !important;
    }
    .at-btn:focus {
      outline: 1px solid currentColor;
      outline-offset: 1px;
    }
  `;
  document.head.appendChild(style);
  _cssInjected = true;
}

// ── Helpery formatowania ────────────────────────────────────────────

export function formatStatLine(label, value, cssClass = '') {
  return `<div class="at-stat"><span class="at-stat-prefix">&gt;</span> <span class="at-stat-label">${label}:</span> <span class="at-stat-value ${cssClass}">${value}</span></div>`;
}

export function formatStatLineWithCursor(label, value, cssClass = '') {
  return `<div class="at-stat"><span class="at-stat-prefix">&gt;</span> <span class="at-stat-label">${label}:</span> <span class="at-stat-value ${cssClass}">${value}</span><span class="at-cursor"></span></div>`;
}

export function formatSectionTitle(title) {
  return `<div class="at-section"><div class="at-section-title">${title}</div></div>`;
}

export function formatStatsGrid(entries) {
  // entries: [{ label, value, cssClass? }]
  let html = '<div class="at-resources">';
  for (const e of entries) {
    html += `<div class="at-stat"><span class="at-stat-prefix">&gt;</span> <span class="at-stat-label">${e.label}</span> <span class="at-stat-value ${e.cssClass ?? 'at-stat-pos'}">${e.value}</span></div>`;
  }
  html += '</div>';
  return html;
}

// ── DOM Builder ─────────────────────────────────────────────────────

/**
 * Buduje popup w stylu Amber Terminal.
 * @param {Object} config
 * @param {string} config.severity — 'danger'|'success'|'info'|'discovery'
 * @param {string} config.barTitle — tekst w górnym pasku (lewa strona)
 * @param {string} [config.barRight] — tekst po prawej w pasku (np. data)
 * @param {string} [config.svgKey] — klucz z SVG_ICONS (override domyślny)
 * @param {string} [config.svgLabel] — tekst pod ikoną SVG
 * @param {string} [config.prompt] — linia terminala (np. "> SKAN.EXE_")
 * @param {string} config.headline — duży nagłówek (może zawierać <br>)
 * @param {string} [config.description] — paragraf opisu
 * @param {string} [config.contentHTML] — dodatkowy HTML w prawej kolumnie
 * @param {Array}  [config.buttons] — [{label, primary?, onClick}]
 * @param {Function} [config.onDismiss] — callback po zamknięciu
 * @returns {{ overlay: HTMLElement, dismiss: Function }}
 */
export function buildTerminalPopup(config) {
  injectTerminalPopupCSS();

  const sev = getSeverityConfig(config.severity);

  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'at-overlay';

  // ── Panel ──
  const panel = document.createElement('div');
  panel.className = `at-panel ${sev.panelClass}`;
  Object.assign(panel.style, {
    background: THEME.bgPrimary,
    border: `2px solid ${sev.borderColor}`,
    boxShadow: sev.glowShadow,
  });

  // CRT warstwy wewnątrz panelu
  const vignette = document.createElement('div');
  vignette.className = 'at-vignette';
  panel.appendChild(vignette);

  const scanlines = document.createElement('div');
  scanlines.className = 'at-scanlines';
  panel.appendChild(scanlines);

  const sweep = document.createElement('div');
  sweep.className = 'at-sweep';
  sweep.style.color = sev.sweepColor;
  panel.appendChild(sweep);

  // ── Fanfare (breakthrough) ──
  if (sev.fanfare && config.fanfareText) {
    const fanfare = document.createElement('div');
    fanfare.className = 'at-fanfare';
    fanfare.style.color = sev.accentColor;
    fanfare.style.borderBottom = `1px solid ${_rgba(sev.borderColor, 0.15)}`;
    fanfare.innerHTML = `<span>${config.fanfareText}</span>`;
    panel.appendChild(fanfare);
  }

  // ── Top bar ──
  const bar = document.createElement('div');
  bar.className = `at-bar ${sev.barClass}`;
  if (sev.barBg && !sev.barClass) {
    bar.style.background = sev.barBg;
  }

  const barTitle = document.createElement('div');
  barTitle.className = 'at-bar-title';
  barTitle.style.color = sev.barTextColor;
  barTitle.textContent = config.barTitle ?? t('terminal.report');
  bar.appendChild(barTitle);

  if (config.barRight) {
    const barRight = document.createElement('div');
    barRight.className = 'at-bar-right';
    barRight.style.color = sev.barTextColor;
    barRight.textContent = config.barRight;
    bar.appendChild(barRight);
  }
  panel.appendChild(bar);

  // ── Body (2 kolumny) ──
  const body = document.createElement('div');
  body.className = 'at-body';

  // Lewa kolumna: SVG
  const svgPanel = document.createElement('div');
  svgPanel.className = 'at-svg-panel';
  svgPanel.style.color = sev.accentColor;
  svgPanel.style.borderRight = `1px solid ${_rgba(sev.borderColor, 0.12)}`;

  const ring = document.createElement('div');
  ring.className = 'at-svg-ring';
  svgPanel.appendChild(ring);

  const svgKey = config.svgKey ?? sev.defaultSvg;
  const svgDiv = document.createElement('div');
  svgDiv.innerHTML = SVG_ICONS[svgKey] ?? SVG_ICONS.report;
  svgPanel.appendChild(svgDiv);

  const svgLabel = document.createElement('div');
  svgLabel.className = 'at-svg-label';
  svgLabel.innerHTML = config.svgLabel ?? sev.defaultLabel;
  svgPanel.appendChild(svgLabel);

  body.appendChild(svgPanel);

  // Prawa kolumna: treść
  const right = document.createElement('div');
  right.className = 'at-right';
  right.style.color = THEME.textPrimary;

  // Prompt
  if (config.prompt) {
    const prompt = document.createElement('div');
    prompt.className = 'at-prompt';
    prompt.style.color = sev.accentColor;
    prompt.textContent = config.prompt;
    right.appendChild(prompt);
  }

  // Headline
  const headline = document.createElement('div');
  headline.className = 'at-headline';
  headline.style.color = sev.accentColor;
  headline.innerHTML = config.headline;
  right.appendChild(headline);

  // Description
  if (config.description) {
    const desc = document.createElement('div');
    desc.className = 'at-desc';
    desc.style.color = THEME.textSecondary;
    desc.textContent = config.description;
    right.appendChild(desc);
  }

  // Dodatkowy HTML (statystyki, zasoby, itd.)
  if (config.contentHTML) {
    const content = document.createElement('div');
    content.style.marginTop = '6px';
    content.innerHTML = config.contentHTML;
    right.appendChild(content);
  }

  body.appendChild(right);
  panel.appendChild(body);

  // ── Footer z przyciskami ──
  const buttons = config.buttons ?? [{ label: `[ENTER] ${t('terminal.ok')}`, primary: true }];
  const footer = document.createElement('div');
  footer.className = 'at-footer';
  footer.style.borderTop = `1px solid ${_rgba(sev.borderColor, 0.12)}`;

  const btnElements = [];
  for (const btnCfg of buttons) {
    const btn = document.createElement('button');
    btn.className = 'at-btn';
    btn.textContent = btnCfg.label;
    Object.assign(btn.style, {
      border: `1px solid ${btnCfg.primary ? sev.borderColor : _rgba(sev.borderColor, 0.3)}`,
      color: sev.accentColor,
    });
    btn.addEventListener('mouseenter', () => {
      btn.style.background = sev.borderColor;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'transparent';
    });
    if (btnCfg.onClick) {
      btn.addEventListener('click', btnCfg.onClick);
    }
    footer.appendChild(btn);
    btnElements.push(btn);
  }
  panel.appendChild(footer);

  // Blokuj propagację zdarzeń myszy
  for (const evt of ['click', 'mousedown', 'mouseup']) {
    panel.addEventListener(evt, (e) => e.stopPropagation());
    overlay.addEventListener(evt, (e) => e.stopPropagation());
  }

  overlay.appendChild(panel);

  // Dismiss helper
  const dismiss = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (config.onDismiss) config.onDismiss();
  };

  return { overlay, panel, dismiss, btnElements };
}
