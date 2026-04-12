// ScheduledEventPopup — popup "DATASHEET" w stylu cyber-gazety
//
// Holograficzna karta z MP4 video jako tlo, scrollujacymi hex kodami,
// efektem chromatic aberration i glitch. Styl FactionSelectScene
// (Orbitron, scanlines, accent glow).
//
// API identyczne z buildTerminalPopup:
//   buildScheduledEventPopup(config) → { overlay, dismiss, btnElements }

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { getSeverityConfig, injectTerminalPopupCSS } from './TerminalPopupBase.js';

// ── Automatyczne mapowanie svgKey → kategoria video ─────────────────
const SVG_TO_VIDEO = {
  alert: 'alert', disaster: 'alert', impact: 'alert',
  colony: 'colony',
  recon: 'discovery', discovery: 'discovery',
  report: 'science',
  deposit: 'mining',
};

// ── CSS injection ───────────────────────────────────────────────────

let _cssInjected = false;

function _injectCSS() {
  const old = document.getElementById('se-popup-css');
  if (old) old.remove();

  const acc    = THEME.accent;
  const bg     = THEME.bgPrimary;
  const bgRgb  = hexToRgb(bg);
  const accRgb = hexToRgb(acc);
  const dng    = THEME.danger;

  const style = document.createElement('style');
  style.id = 'se-popup-css';
  style.textContent = `
    /* ── Animacje ── */
    @keyframes seEnter {
      from { opacity: 0; transform: scale(0.96) translateY(12px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);    }
    }
    @keyframes sePulse {
      0%,100% { box-shadow: 0 0 20px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.15),
                             0 0 40px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.06); }
      50%     { box-shadow: 0 0 35px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.28),
                             0 0 70px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.10); }
    }
    @keyframes seGlitch {
      0%,92%,96%,100% {
        transform: none;
        text-shadow: -1px 0 ${acc}, 1px 0 ${dng}, 0 0 24px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.4);
      }
      93% {
        transform: translateX(-3px) skewX(-0.8deg);
        text-shadow: -4px 0 ${acc}, 4px 0 ${dng};
      }
      95% {
        transform: translateX(2px) skewX(0.4deg);
        text-shadow: 3px 0 ${acc}, -3px 0 ${dng};
      }
    }
    @keyframes seHexScroll {
      from { transform: translateY(0); }
      to   { transform: translateY(-50%); }
    }
    @keyframes seSweep {
      from { top: -2px; }
      to   { top: 100%; }
    }
    @keyframes seBlink {
      0%,100% { opacity: 1; }
      50%     { opacity: 0; }
    }

    /* ── Overlay ── */
    .se-overlay {
      position: fixed; inset: 0;
      background: rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.82);
      z-index: 100;
      display: flex; align-items: center; justify-content: center;
    }

    /* ── Karta ── */
    .se-card {
      position: relative;
      max-width: 560px; width: 94%;
      overflow: hidden;
      border: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.25);
      background: ${bg};
      animation: seEnter 0.4s ease-out, sePulse 3s ease-in-out infinite 0.4s;
    }

    /* ── Video frame (animowane zdjecie w gazecie) ── */
    .se-video-wrap {
      position: relative;
      margin: 0 20px 10px;
      overflow: hidden;
      border: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.2);
      max-height: 180px;
    }
    .se-video-bg {
      display: block;
      width: 100%; height: 180px;
      object-fit: cover;
      opacity: 0.55;
      filter: saturate(0.75) contrast(1.1);
    }
    .se-video-scanlines {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(
        0deg, transparent 0, transparent 2px,
        rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px);
      pointer-events: none;
    }
    .se-video-fade {
      position: absolute; left: 0; right: 0; bottom: 0;
      height: 50px;
      background: linear-gradient(to bottom,
        transparent,
        rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.95));
      pointer-events: none;
    }
    .se-video-vignette {
      position: absolute; inset: 0;
      box-shadow: inset 0 0 40px rgba(0,0,0,0.6);
      pointer-events: none;
    }

    /* ── Scanlines ── */
    .se-scanlines {
      position: absolute; inset: 0;
      background: repeating-linear-gradient(
        0deg, transparent 0, transparent 3px,
        rgba(0,0,0,0.09) 3px, rgba(0,0,0,0.09) 4px);
      z-index: 2;
      pointer-events: none;
    }

    /* ── Hex scroll ── */
    .se-hex-scroll {
      position: absolute;
      inset: 0;
      overflow: hidden;
      z-index: 1;
      pointer-events: none;
    }
    .se-hex-scroll-inner {
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      line-height: 1.4;
      color: ${acc};
      opacity: 0.035;
      white-space: pre;
      animation: seHexScroll 50s linear infinite;
    }

    /* ── Sweep line ── */
    .se-sweep {
      position: absolute; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, ${acc}, transparent);
      opacity: 0.08;
      z-index: 3;
      pointer-events: none;
      animation: seSweep 7s linear infinite;
    }

    /* ── Content ── */
    .se-content {
      position: relative;
      z-index: 10;
      padding: 0;
    }

    /* ── Masthead ── */
    .se-masthead {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 20px 8px;
    }
    .se-masthead-line {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg,
        transparent,
        rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.2),
        transparent);
    }
    .se-masthead-title {
      font-family: 'Orbitron', 'Share Tech Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 6px;
      color: rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.5);
      text-transform: uppercase;
      white-space: nowrap;
    }
    .se-masthead-meta {
      font-family: 'Share Tech Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      color: rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.35);
      white-space: nowrap;
    }

    /* ── Separator ── */
    .se-separator {
      margin: 0 20px;
      border-top: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.18);
      border-bottom: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.08);
      height: 3px;
    }

    /* ── Severity tag ── */
    .se-severity-tag {
      display: inline-block;
      font-family: 'Orbitron', 'Share Tech Mono', monospace;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      padding: 2px 8px;
      border: 1px solid;
      margin-bottom: 6px;
      opacity: 0.7;
    }

    /* ── Headline ── */
    .se-headline {
      font-family: 'Orbitron', 'Share Tech Mono', monospace;
      font-size: 19px;
      font-weight: 700;
      letter-spacing: 2px;
      line-height: 1.2;
      margin: 0 0 8px 0;
      animation: seGlitch 8s ease-in-out infinite;
    }

    /* ── Body (opis + opcje) ── */
    .se-body {
      padding: 12px 20px 6px;
    }
    .se-desc {
      font-family: 'Share Tech Mono', monospace;
      font-size: 13px;
      line-height: 1.6;
      color: ${THEME.textSecondary};
      margin-bottom: 12px;
    }

    /* ── Lista opcji ── */
    .se-options-list {
      display: flex; flex-direction: column; gap: 8px;
      margin-bottom: 8px;
      padding-top: 8px;
      border-top: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.08);
    }
    .se-option {
      display: flex; flex-direction: column; gap: 2px;
      padding: 6px 10px;
      border-left: 2px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.15);
      transition: border-color 0.15s;
    }
    .se-option:hover {
      border-left-color: rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.5);
    }
    .se-option-header {
      display: flex; align-items: center; gap: 8px;
    }
    .se-option-marker {
      font-size: 14px;
      color: ${acc};
    }
    .se-option-label {
      font-family: 'Share Tech Mono', monospace;
      font-size: 13px;
      color: ${THEME.textPrimary};
      font-weight: bold;
    }
    .se-option-cost {
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: ${THEME.warning};
      margin-left: auto;
    }
    .se-option-effect {
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: ${THEME.textDim};
      padding-left: 22px;
    }

    /* ── Footer / przyciski ── */
    .se-footer {
      padding: 8px 20px 14px;
      display: flex; gap: 6px; flex-wrap: wrap;
      border-top: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.08);
    }
    .se-btn {
      font-family: 'Orbitron', 'Share Tech Mono', monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 2px;
      text-transform: uppercase;
      background: transparent;
      padding: 8px 18px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .se-btn:hover {
      color: ${bg} !important;
    }
    .se-btn:focus {
      outline: 1px solid currentColor;
      outline-offset: 1px;
    }

    /* ── Tooltip na przyciskach ── */
    .se-btn-wrap {
      position: relative;
      display: inline-block;
    }
    .se-btn-tooltip {
      position: absolute;
      bottom: calc(100% + 8px);
      left: 50%;
      transform: translateX(-50%);
      background: rgba(${bgRgb.r},${bgRgb.g},${bgRgb.b},0.95);
      border: 1px solid rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.3);
      padding: 6px 12px;
      font-family: 'Share Tech Mono', monospace;
      font-size: 11px;
      color: ${THEME.textSecondary};
      white-space: nowrap;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 20;
      box-shadow: 0 0 12px rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.1);
    }
    .se-btn-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border: 5px solid transparent;
      border-top-color: rgba(${accRgb.r},${accRgb.g},${accRgb.b},0.3);
    }
    .se-btn-wrap:hover .se-btn-tooltip {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
  _cssInjected = true;
}

// ── Helpery ─────────────────────────────────────────────────────────

/** Generuj scrollujacy tekst hex */
function _generateHexText(lines = 60) {
  let text = '';
  for (let i = 0; i < lines; i++) {
    let line = '';
    const cols = 30 + Math.floor(Math.random() * 20);
    for (let j = 0; j < cols; j++) {
      line += Math.floor(Math.random() * 16).toString(16);
      if (j % 4 === 3) line += ' ';
    }
    text += line + '\n';
  }
  // Podwojone dla seamless loop
  return text + text;
}

/** Zaladuj video z fallback chain — probuje kazdy src po kolei */
function _loadVideo(video, sources) {
  let idx = 0;
  const tryNext = () => {
    if (idx >= sources.length) {
      video.style.display = 'none';
      return;
    }
    const src = sources[idx++];
    // Sprawdz czy plik istnieje zanim ustaw src na video
    fetch(src, { method: 'HEAD' })
      .then(res => {
        if (res.ok) {
          video.src = src;
          video.play().catch(() => {}); // autoplay moze byc zablokowany
        } else {
          tryNext();
        }
      })
      .catch(() => tryNext());
  };
  tryNext();
}

function _rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Builder DOM ─────────────────────────────────────────────────────

/**
 * Buduje popup DATASHEET — cyber-gazeta z video tlem.
 * @param {Object} config
 * @param {string}   config.severity     — 'info'|'warning'|'danger'|'discovery'
 * @param {string}   config.headline     — tytul eventu (Orbitron)
 * @param {string}   [config.description]— tekst opisu
 * @param {string[]} [config.videoSrc]   — tablica src do proby (fallback chain)
 * @param {number}   [config.gameYear]   — rok gry (masthead)
 * @param {Array}    [config.options]    — [{ label, cost, effectDesc }] do wyswietlenia
 * @param {Array}    [config.buttons]    — [{ label, primary }]
 * @param {Function} [config.onDismiss]  — callback po zamknieciu
 * @returns {{ overlay: HTMLElement, dismiss: Function, btnElements: HTMLElement[] }}
 */
export function buildScheduledEventPopup(config) {
  _injectCSS();
  injectTerminalPopupCSS(); // contentHTML moze zawierac klasy .at-stat z TerminalPopupBase

  const sev   = getSeverityConfig(config.severity ?? 'info');
  const acc   = THEME.accent;
  const bg    = THEME.bgPrimary;
  const accRgb = hexToRgb(acc);

  // Auto-resolve video z svgKey jesli brak explicit videoSrc
  if (!config.videoSrc && config.svgKey) {
    const cat = SVG_TO_VIDEO[config.svgKey] ?? 'default';
    config.videoSrc = [`assets/event-videos/${cat}.mp4`, 'assets/event-videos/default.mp4'];
  }

  // ── Overlay ──
  const overlay = document.createElement('div');
  overlay.className = 'se-overlay';

  // ── Karta ──
  const card = document.createElement('div');
  card.className = 'se-card';
  card.style.borderColor = _rgba(sev.borderColor, 0.3);

  // ── Scanlines (tlo karty) ──
  const scanlines = document.createElement('div');
  scanlines.className = 'se-scanlines';
  card.appendChild(scanlines);

  // ── Hex scroll ──
  const hexWrap = document.createElement('div');
  hexWrap.className = 'se-hex-scroll';
  const hexInner = document.createElement('div');
  hexInner.className = 'se-hex-scroll-inner';
  hexInner.textContent = _generateHexText();
  hexWrap.appendChild(hexInner);
  card.appendChild(hexWrap);

  // ── Sweep line ──
  const sweep = document.createElement('div');
  sweep.className = 'se-sweep';
  card.appendChild(sweep);

  // ── Content ──
  const content = document.createElement('div');
  content.className = 'se-content';

  // ── Masthead ──
  const masthead = document.createElement('div');
  masthead.className = 'se-masthead';

  const lineL = document.createElement('span');
  lineL.className = 'se-masthead-line';

  const title = document.createElement('span');
  title.className = 'se-masthead-title';
  title.textContent = 'DATASHEET';

  const meta = document.createElement('span');
  meta.className = 'se-masthead-meta';
  const yearNum = Math.floor(config.gameYear ?? 0);
  const issueNum = (Math.floor(yearNum * 7.3 + 42) % 999) + 1;
  meta.textContent = `#${String(issueNum).padStart(3, '0')}  Y.${yearNum}`;

  const lineR = document.createElement('span');
  lineR.className = 'se-masthead-line';

  masthead.append(lineL, title, meta, lineR);
  content.appendChild(masthead);

  // ── Separator ──
  const sep = document.createElement('div');
  sep.className = 'se-separator';
  content.appendChild(sep);

  // ── Body ──
  const body = document.createElement('div');
  body.className = 'se-body';

  // Severity tag
  const sevTag = document.createElement('div');
  sevTag.className = 'se-severity-tag';
  sevTag.style.color = sev.accentColor;
  sevTag.style.borderColor = _rgba(sev.borderColor, 0.4);
  const sevLabels = {
    danger:    'ALARM',
    warning:   'ALERT',
    info:      'INFO',
    discovery: 'DISCOVERY',
  };
  sevTag.textContent = sevLabels[config.severity] ?? 'INFO';
  body.appendChild(sevTag);

  // Headline
  const headline = document.createElement('h1');
  headline.className = 'se-headline';
  headline.style.color = sev.accentColor;
  headline.textContent = config.headline ?? '';
  body.appendChild(headline);

  content.appendChild(body);

  // ── Video frame (animowane zdjecie pod naglowkiem) ──
  if (config.videoSrc && config.videoSrc.length > 0) {
    const videoWrap = document.createElement('div');
    videoWrap.className = 'se-video-wrap';
    videoWrap.style.borderColor = _rgba(sev.borderColor, 0.2);

    const video = document.createElement('video');
    video.className = 'se-video-bg';
    video.autoplay  = true;
    video.muted     = true;
    video.loop      = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    _loadVideo(video, config.videoSrc);
    videoWrap.appendChild(video);

    // Scanlines na video
    const vidScan = document.createElement('div');
    vidScan.className = 'se-video-scanlines';
    videoWrap.appendChild(vidScan);

    // Vignette (ciemne krawedzie)
    const vidVig = document.createElement('div');
    vidVig.className = 'se-video-vignette';
    videoWrap.appendChild(vidVig);

    // Gradient fade na dole video
    const vidFade = document.createElement('div');
    vidFade.className = 'se-video-fade';
    videoWrap.appendChild(vidFade);

    content.appendChild(videoWrap);
  }

  // ── Body 2: opis + opcje (pod video) ──
  const body2 = document.createElement('div');
  body2.className = 'se-body';

  // Description
  if (config.description) {
    const desc = document.createElement('div');
    desc.className = 'se-desc';
    desc.textContent = config.description;
    body2.appendChild(desc);
  }

  // Dodatkowy HTML (stat lines, zasoby, zloza — z formatStatLine etc.)
  if (config.contentHTML) {
    const extra = document.createElement('div');
    extra.style.marginTop = '6px';
    extra.innerHTML = config.contentHTML;
    body2.appendChild(extra);
  }

  // Options list (opis opcji — nie przyciski, a informacyjny listing)
  if (config.options && config.options.length > 0) {
    const optList = document.createElement('div');
    optList.className = 'se-options-list';

    for (const opt of config.options) {
      const optEl = document.createElement('div');
      optEl.className = 'se-option';

      const header = document.createElement('div');
      header.className = 'se-option-header';

      const marker = document.createElement('span');
      marker.className = 'se-option-marker';
      marker.textContent = '▸';

      const label = document.createElement('span');
      label.className = 'se-option-label';
      label.textContent = opt.label;

      header.append(marker, label);

      if (opt.cost > 0) {
        const cost = document.createElement('span');
        cost.className = 'se-option-cost';
        cost.textContent = `[${opt.cost} Kr]`;
        header.appendChild(cost);
      }

      optEl.appendChild(header);

      if (opt.effectDesc) {
        const effect = document.createElement('div');
        effect.className = 'se-option-effect';
        effect.textContent = opt.effectDesc;
        optEl.appendChild(effect);
      }

      optList.appendChild(optEl);
    }

    body2.appendChild(optList);
  }

  content.appendChild(body2);

  // ── Footer z przyciskami + tooltipami efektow ──
  const buttons = config.buttons ?? [{ label: '[ENTER] OK', primary: true }];
  // Tooltip z opisu efektow opcji (jesli dostepne)
  const optionEffects = config.options ?? [];
  const footer = document.createElement('div');
  footer.className = 'se-footer';

  const btnElements = [];
  for (let bi = 0; bi < buttons.length; bi++) {
    const btnCfg = buttons[bi];
    const tooltipText = optionEffects[bi]?.effectDesc ?? null;

    // Wrapper dla tooltipa
    const wrap = document.createElement('div');
    wrap.className = 'se-btn-wrap';

    const btn = document.createElement('button');
    btn.className = 'se-btn';
    btn.textContent = btnCfg.label;
    Object.assign(btn.style, {
      border: `1px solid ${btnCfg.primary ? _rgba(sev.borderColor, 0.6) : _rgba(sev.borderColor, 0.25)}`,
      color:  sev.accentColor,
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = sev.borderColor; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'transparent'; });

    wrap.appendChild(btn);

    // Tooltip z efektem opcji
    if (tooltipText) {
      const tip = document.createElement('div');
      tip.className = 'se-btn-tooltip';
      tip.textContent = tooltipText;
      wrap.appendChild(tip);
    }

    footer.appendChild(wrap);
    btnElements.push(btn);
  }

  content.appendChild(footer);
  card.appendChild(content);

  // Blokuj propagacje zdarzen myszy
  for (const evt of ['click', 'mousedown', 'mouseup']) {
    card.addEventListener(evt, e => e.stopPropagation());
    overlay.addEventListener(evt, e => e.stopPropagation());
  }

  overlay.appendChild(card);

  // ── Dismiss ──
  const dismiss = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    if (config.onDismiss) config.onDismiss();
  };

  // ── Keyboard ──
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
      e.stopPropagation();
      e.preventDefault();
      // Enter/Space = klik pierwszy przycisk (lub dismiss); Escape = dismiss
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', onKey, true);
        dismiss();
      } else if (btnElements.length > 0) {
        // Kliknij focused button lub pierwszy
        const focused = btnElements.find(b => b === document.activeElement);
        if (focused) {
          focused.click();
        } else {
          btnElements[0].click();
        }
      }
    }
  };
  document.addEventListener('keydown', onKey, true);

  // Cleanup keyboard listener przy dismiss
  const origDismiss = dismiss;
  const dismissWithCleanup = () => {
    document.removeEventListener('keydown', onKey, true);
    origDismiss();
  };

  return { overlay, dismiss: dismissWithCleanup, btnElements };
}
