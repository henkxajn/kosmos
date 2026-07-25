// IntroModal — sekwencja powitalna na starcie nowej gry
//
// Kolejność (po locie kamery, który odpala GameScene._runIntroCinematic):
//   1. LOG    — ekran narracyjny (akapity intro.log1..logN), typewriter
//   2. MANUAL — protokół przetrwania (intro.manual*), typewriter
//   3. Nazwij swoją cywilizację
//   4. Nazwij swoją stolicę
//
// Typewriter: ~40 znaków/s. Klik w panel = dokończ bieżący blok. Przycisk „Dalej"
// (lub Enter/Spacja): 1× odsłoń wszystko, 2× przejdź dalej. ESC pomija narrację
// (LOG+MANUAL) i przechodzi do nazw. Styl: Amber Terminal (CRT) — via TerminalPopupBase.
//
// Kontrakt NIEZMIENNY: showIntroSequence() → Promise<{ civName, capitalName }>
// (konsumowany w GameScene). Ekrany nazw (showNameInput) — bez zmian.

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import {
  buildTerminalPopup,
  injectTerminalPopupCSS,
} from './TerminalPopupBase.js';
import { t } from '../i18n/i18n.js';

// ── Helpery ─────────────────────────────────────────────────────────────

function _rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

// t() zwraca sam klucz gdy brak tłumaczenia (i18n.js) → wykrywamy brak copy.
function _has(key) { return t(key) !== key; }

// ── Typewriter (współdzielony ekran narracyjny) ─────────────────────────

const CPS = 40;            // znaki na sekundę (~40 cps — wymóg specyfikacji)
const INTER_BLOCK_MS = 220; // pauza między blokami

// Styl pojedynczego bloku wg roli (spójny z paletą THEME).
function _blockStyle(cls) {
  switch (cls) {
    case 'log-para':
      return `font-size:13px; color:${THEME.textSecondary}; line-height:1.65; margin-bottom:11px;`;
    case 'log-signoff':
      return `font-size:12px; font-style:italic; color:${THEME.textSecondary}; opacity:0.7; text-align:right; margin-top:12px;`;
    case 'manual-title':
      return `font-size:15px; font-weight:bold; letter-spacing:1px; color:${THEME.accent}; margin:2px 0 10px; text-shadow:0 0 12px ${_rgba(THEME.accent, 0.5)};`;
    case 'manual-intro':
      return `font-size:13px; color:${THEME.textSecondary}; line-height:1.6; margin-bottom:12px;`;
    case 'manual-section-title':
      return `font-size:12px; font-weight:bold; text-transform:uppercase; letter-spacing:2px; color:${THEME.warning}; margin:10px 0 3px;`;
    case 'manual-body':
      return `font-size:12.5px; color:${THEME.textSecondary}; line-height:1.6; margin-bottom:6px;`;
    case 'manual-outro':
      return `font-size:13px; font-style:italic; color:${THEME.textPrimary}; line-height:1.6; margin-top:12px;`;
    default:
      return `font-size:13px; color:${THEME.textSecondary}; line-height:1.6; margin-bottom:8px;`;
  }
}

/**
 * Ekran narracyjny z odsłanianiem tekstu (typewriter).
 * @param {Object} cfg — { severity, barTitle, barRight, svgKey, svgLabel, headline, blocks, state }
 *   blocks: [{ text, cls }]; state: { skip } — ESC ustawia state.skip = true.
 * @returns {Promise<void>}
 */
function _showTypewriterScreen({ severity, barTitle, barRight, svgKey, svgLabel, headline, blocks, state }) {
  return new Promise((resolve) => {
    const wrapId = 'tw-' + Date.now() + '-' + Math.floor(performance.now());

    let contentHTML = `<div id="${wrapId}">`;
    blocks.forEach((b, i) => {
      contentHTML += `<div class="tw-block" data-i="${i}" style="${_blockStyle(b.cls)}"></div>`;
    });
    contentHTML += '</div>';

    let done = false;

    const { overlay, panel, dismiss, btnElements } = buildTerminalPopup({
      severity: severity || 'info',
      barTitle,
      barRight,
      svgKey,
      svgLabel,
      headline: headline || '',
      contentHTML,
      buttons: [{ label: t('ui.continue'), primary: true }],
      onDismiss: () => { if (!done) { done = true; resolve(); } },
    });

    document.body.appendChild(overlay);

    const wrap = document.getElementById(wrapId);
    const blockEls = wrap ? [...wrap.querySelectorAll('.tw-block')] : [];

    // Stan typewritera
    let curBlock = 0;
    let curChars = 0;     // float — postęp w bieżącym bloku (znaki)
    let lastNow = null;
    let interPause = 0;   // ms pozostałej pauzy między blokami
    let revealedAll = blocks.length === 0;
    let raf = 0;

    const renderReveal = () => {
      for (let i = 0; i < blocks.length; i++) {
        const el = blockEls[i];
        if (!el) continue;
        if (i < curBlock)        el.textContent = blocks[i].text;
        else if (i === curBlock) el.textContent = blocks[i].text.slice(0, Math.floor(curChars));
        else                     el.textContent = '';
      }
      // Migający kursor na bieżącym bloku (textContent wcześniej wyczyścił dzieci → 1 kursor)
      if (!revealedAll) {
        const active = blockEls[Math.min(curBlock, blocks.length - 1)];
        if (active) {
          const cur = document.createElement('span');
          cur.className = 'at-cursor';
          active.appendChild(cur);
        }
      }
    };

    const finishAll = () => {
      curBlock = blocks.length;
      revealedAll = true;
      for (let i = 0; i < blocks.length; i++) {
        if (blockEls[i]) blockEls[i].textContent = blocks[i].text;
      }
    };

    const tick = (now) => {
      if (done) return;
      if (lastNow === null) lastNow = now;
      const dt = now - lastNow;
      lastNow = now;

      if (!revealedAll) {
        if (interPause > 0) {
          interPause -= dt;
        } else if (curBlock < blocks.length) {
          curChars += (dt / 1000) * CPS;
          const len = blocks[curBlock].text.length;
          if (curChars >= len) {
            curChars = 0;
            curBlock++;
            interPause = INTER_BLOCK_MS;
            if (curBlock >= blocks.length) finishAll();
          }
        }
        renderReveal();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // Klik w panel = dokończ BIEŻĄCY blok (wymóg specyfikacji). Klik w przycisk → advance().
    panel.addEventListener('click', (e) => {
      if (e.target.closest('.at-btn')) return;
      if (revealedAll) return;
      curChars = blocks[curBlock] ? blocks[curBlock].text.length : 0;
      renderReveal();
    });

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey, true);
    };

    // Przycisk „Dalej" / Enter / Spacja: 1× odsłoń wszystko, potem przejdź dalej.
    const advance = () => {
      if (done) return;
      if (!revealedAll) { finishAll(); renderReveal(); return; }
      done = true;
      cleanup();
      dismiss();
      resolve();
    };
    for (const btn of btnElements) btn.addEventListener('click', advance);

    // ESC — pomiń narrację (LOG+MANUAL). Enter/Spacja — advance.
    const onKey = (e) => {
      if (e.code === 'Escape') {
        e.stopPropagation(); e.preventDefault();
        if (state) state.skip = true;
        done = true;
        cleanup();
        dismiss();
        resolve();
        return;
      }
      if (e.code === 'Enter' || e.code === 'Space') {
        e.stopPropagation(); e.preventDefault();
        advance();
      }
    };
    document.addEventListener('keydown', onKey, true);

    requestAnimationFrame(() => { if (btnElements[0]) btnElements[0].focus(); });
  });
}

// ── Ekran 1: LOG (akapity intro.log1..logN) ─────────────────────────────

function showLog(state) {
  // Akapity intro.log1..logN (liczba = z copy). Template literal w t() rejestruje
  // prefiks 'intro.log' → check-i18n uznaje log*/logSignoff za osiągalne.
  const blocks = [];
  for (let i = 1; i <= 40; i++) {
    if (!_has(`intro.log${i}`)) break;
    blocks.push({ text: t(`intro.log${i}`), cls: 'log-para' });
  }
  // Brak copy → pomiń ekran (graceful, żeby lot był testowalny bez tekstu).
  if (blocks.length === 0) return Promise.resolve();
  if (_has('intro.logSignoff')) blocks.push({ text: t('intro.logSignoff'), cls: 'log-signoff' });

  return _showTypewriterScreen({
    severity: 'info',
    barTitle: t('intro.barTitle'),
    svgKey:   'report',
    svgLabel: t('intro.svgLabel').replace(/\n/g, '<br>'),
    headline: t('intro.headline'),
    blocks,
    state,
  });
}

// ── Ekran 2: MANUAL (protokół przetrwania) ──────────────────────────────

function showManual(state) {
  // Protokół: tytuł + intro + 4 sekcje (Title/Body) + outro. Numerowane sekcje przez
  // template literal w t() → rejestruje prefiks 'intro.manual' (check-i18n: osiągalne).
  const blocks = [];
  if (_has('intro.manualTitle')) blocks.push({ text: t('intro.manualTitle'), cls: 'manual-title' });
  if (_has('intro.manualIntro')) blocks.push({ text: t('intro.manualIntro'), cls: 'manual-intro' });
  for (let i = 1; i <= 4; i++) {
    if (_has(`intro.manual${i}Title`)) blocks.push({ text: t(`intro.manual${i}Title`), cls: 'manual-section-title' });
    if (_has(`intro.manual${i}Body`))  blocks.push({ text: t(`intro.manual${i}Body`),  cls: 'manual-body' });
  }
  if (_has('intro.manualOutro')) blocks.push({ text: t('intro.manualOutro'), cls: 'manual-outro' });
  // Brak copy → pomiń ekran (graceful, żeby lot był testowalny bez tekstu).
  if (blocks.length === 0) return Promise.resolve();

  return _showTypewriterScreen({
    severity: 'info',
    barTitle: t('intro.manualBarTitle'),
    svgKey:   'report',
    svgLabel: t('intro.manualSvgLabel').replace(/\n/g, '<br>'),
    headline: '',                     // tytuł protokołu jest pierwszym blokiem body
    blocks,
    state,
  });
}

// ── Ekran z inputem nazwy (BEZ ZMIAN — kontrakt) ────────────────────────

function showNameInput(title, defaultValue, placeholder, svgLabel) {
  return new Promise(resolve => {
    // Input HTML — zostanie osadzony w contentHTML
    const inputId = 'intro-name-input-' + Date.now();

    const contentHTML = `
      <div style="margin-top:8px;">
        <input id="${inputId}" type="text" value="${defaultValue}" maxlength="30"
          placeholder="${placeholder || ''}"
          style="
            width: 100%;
            box-sizing: border-box;
            background: ${THEME.bgPrimary};
            border: 1px solid ${THEME.border};
            border-radius: 2px;
            color: ${THEME.textPrimary};
            font-family: ${THEME.fontFamily};
            font-size: 15px;
            padding: 10px 12px;
            outline: none;
            text-align: center;
            transition: border-color 0.2s, box-shadow 0.2s;
          "
        />
      </div>
    `;

    let resolved = false;

    const { overlay, dismiss, btnElements } = buildTerminalPopup({
      severity: 'discovery',
      barTitle: title,
      svgKey: 'colony',
      svgLabel: svgLabel,
      headline: title,
      contentHTML,
      buttons: [{ label: t('ui.continue'), primary: true }],
      onDismiss: () => {
        if (!resolved) {
          resolved = true;
          resolve(defaultValue);
        }
      },
    });

    document.body.appendChild(overlay);

    // Znajdź input po wstawieniu do DOM
    const input = document.getElementById(inputId);

    // Stylizacja focus inputu
    if (input) {
      input.addEventListener('focus', () => {
        input.style.borderColor = THEME.borderActive;
        input.style.boxShadow = `0 0 10px ${_rgba(THEME.borderActive, 0.3)}`;
      });
      input.addEventListener('blur', () => {
        input.style.borderColor = THEME.border;
        input.style.boxShadow = 'none';
      });
    }

    const submit = () => {
      if (resolved) return;
      resolved = true;
      const val = input ? input.value.trim() : '';
      document.removeEventListener('keydown', onKey, true);
      dismiss();
      resolve(val || defaultValue);
    };

    // Przycisk DALEJ
    for (const btn of btnElements) {
      btn.addEventListener('click', submit);
    }

    // Keyboard — Enter w inpucie = submit, inne klawisze blokuj propagację
    const onKey = (e) => {
      // Pozwól na pisanie w inpucie — blokuj tylko propagację do gry
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    };
    document.addEventListener('keydown', onKey, true);

    // Focus na input
    requestAnimationFrame(() => {
      if (input) {
        input.focus();
        input.select();
      }
    });
  });
}

// ── Pełna sekwencja intro ───────────────────────────────────────────────

/**
 * Wyświetla sekwencję powitalną nowej gry (po locie kamery):
 * 1. LOG (ekran narracyjny)
 * 2. MANUAL (protokół przetrwania)
 * 3. Nazwa cywilizacji
 * 4. Nazwa stolicy
 *
 * ESC na ekranach 1/2 pomija narrację i przechodzi do nazw.
 *
 * @returns {Promise<{ civName: string, capitalName: string }>}
 */
export async function showIntroSequence() {
  // Upewnij się że CSS jest załadowany
  injectTerminalPopupCSS();

  // Narracja (LOG → MANUAL); ESC ustawia state.skip → pomija MANUAL.
  const state = { skip: false };
  await showLog(state);
  if (!state.skip) await showManual(state);

  // Nazwij cywilizację
  const civName = await showNameInput(
    t('intro.nameCivTitle'),
    t('intro.defaultCivName'),
    t('intro.civPlaceholder'),
    t('intro.civSvg').replace(/\n/g, '<br>')
  );

  // Nazwij stolicę
  const capitalName = await showNameInput(
    t('intro.nameCapitalTitle'),
    t('intro.defaultCapitalName'),
    t('intro.capitalPlaceholder'),
    t('intro.capitalSvg').replace(/\n/g, '<br>')
  );

  return { civName, capitalName };
}
