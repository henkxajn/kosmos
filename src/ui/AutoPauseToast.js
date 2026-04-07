// AutoPauseToast — krótki komunikat (3s) gdy auto-pauza zatrzymuje grę
//
// Pokazuje DOM toast w prawym górnym rogu, nad wszystkimi canvasami.
// Wywoływany przez emit 'ui:autoPauseNotification' { reason } z AutoPauseSystem.

import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';
import { getLocale } from '../i18n/i18n.js';

const TOAST_ID = 'kosmos-autopause-toast';
const DURATION_MS = 3000;
const FADE_MS = 500;

let _initialized = false;
let _hideTimer = null;
let _removeTimer = null;

function _label(reason) {
  const pl = getLocale() === 'pl';
  const labels = {
    narrativeEvent:   pl ? '⏸ Event narracyjny'  : '⏸ Narrative event',
    discovery:        pl ? '⏸ Odkrycie!'          : '⏸ Discovery!',
    buildingComplete: pl ? '⏸ Budynek ukończony'  : '⏸ Building complete',
    shipArrived:      pl ? '⏸ Statek dotarł'      : '⏸ Ship arrived',
    crisis:           pl ? '⏸ Kryzys frakcji!'    : '⏸ Faction crisis!',
    newPop:           pl ? '⏸ Nowy POP'           : '⏸ New POP',
    segmentComplete:  pl ? '⏸ Segment Sfery!'     : '⏸ Dyson segment!',
    consulElection:   pl ? '⏸ Wybory Konsula'     : '⏸ Consul election',
  };
  return labels[reason] ?? (pl ? '⏸ Auto-pauza' : '⏸ Auto-pause');
}

function _ensureToastEl() {
  let el = document.getElementById(TOAST_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = TOAST_ID;
  Object.assign(el.style, {
    position:      'fixed',
    top:           '60px',
    right:         '16px',
    background:    'rgba(6,12,20,0.92)',
    color:         THEME.success ?? '#00ffb4',
    padding:       '8px 16px',
    fontSize:      '12px',
    letterSpacing: '1px',
    fontFamily:    THEME.fontFamily ?? "'Courier New', monospace",
    zIndex:        '9998',
    border:        `1px solid ${THEME.borderActive ?? 'rgba(0,255,180,0.4)'}`,
    borderRadius:  '4px',
    pointerEvents: 'none',
    opacity:       '0',
    transition:    `opacity ${FADE_MS}ms ease`,
    boxShadow:     '0 4px 16px rgba(0,0,0,0.5)',
    display:       'none',
  });
  document.body.appendChild(el);
  return el;
}

function _showToast(text) {
  const el = _ensureToastEl();
  el.textContent = text;
  el.style.display = 'block';

  // Wymuś reflow przed zmianą opacity (animacja działa dopiero po display:block)
  // eslint-disable-next-line no-unused-expressions
  el.offsetHeight;
  el.style.opacity = '1';

  // Anuluj poprzednie timery (kolejny event resetuje licznik)
  if (_hideTimer) clearTimeout(_hideTimer);
  if (_removeTimer) clearTimeout(_removeTimer);

  _hideTimer = setTimeout(() => {
    el.style.opacity = '0';
    _removeTimer = setTimeout(() => {
      el.style.display = 'none';
    }, FADE_MS);
  }, DURATION_MS);
}

// Inicjalizacja — podpina handler do EventBus (idempotentne)
export function initAutoPauseToast() {
  if (_initialized) return;
  _initialized = true;
  EventBus.on('ui:autoPauseNotification', ({ reason }) => {
    _showToast(_label(reason));
  });
}
