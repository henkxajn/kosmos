// AutoPauseSettingsModal — DOM modal z togglami per kategoria auto-pauzy
//
// Otwierany z menu BottomBar (wpis "Auto-pauza..."). Każda kategoria ma
// własny checkbox; przyciski [Włącz wszystko]/[Wyłącz wszystko] szybko
// modyfikują wszystkie. Zmiany od razu aplikowane do AutoPauseSystem
// (i zapisywane w localStorage przez setSetting/setAllSettings).

import { THEME } from '../config/ThemeConfig.js';
import { getLocale } from '../i18n/i18n.js';

const MODAL_ID = 'kosmos-autopause-settings-modal';

// Lista kategorii w kolejności wyświetlania
const CATEGORIES = [
  'onNarrativeEvent',
  'onDiscovery',
  'onBuildingComplete',
  'onShipArrived',
  'onCrisis',
  'onNewPop',
  'onSegmentComplete',
  'onConsulElection',
];

function _categoryLabel(key) {
  const pl = getLocale() === 'pl';
  const labels = {
    onNarrativeEvent:   pl ? 'Eventy narracyjne'    : 'Narrative events',
    onDiscovery:        pl ? 'Odkrycia'             : 'Discoveries',
    onBuildingComplete: pl ? 'Budynki T3+'          : 'Buildings T3+',
    onShipArrived:      pl ? 'Statek dotarł'        : 'Ship arrived',
    onCrisis:           pl ? 'Kryzys frakcji'       : 'Faction crisis',
    onNewPop:           pl ? 'Nowy POP'             : 'New POP',
    onSegmentComplete:  pl ? 'Segment Sfery'        : 'Dyson segment',
    onConsulElection:   pl ? 'Wybory Konsula'       : 'Consul election',
  };
  return labels[key] ?? key;
}

function _systemRef() {
  return window.KOSMOS?.autoPauseSystem ?? null;
}

let _modalEl = null;

function _createModal() {
  if (_modalEl) return _modalEl;

  const overlay = document.createElement('div');
  overlay.id = MODAL_ID;
  Object.assign(overlay.style, {
    position:   'fixed',
    inset:      '0',
    background: 'rgba(0,0,0,0.55)',
    display:    'none',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex:     '9999',
    fontFamily: THEME.fontFamily ?? "'Courier New', monospace",
  });

  const panel = document.createElement('div');
  Object.assign(panel.style, {
    minWidth:     '320px',
    maxWidth:     '420px',
    background:   'rgba(6,12,20,0.97)',
    border:       `1px solid ${THEME.borderActive ?? 'rgba(0,255,180,0.5)'}`,
    borderRadius: '6px',
    padding:      '16px 18px',
    color:        THEME.textSecondary ?? '#cfd8dc',
    boxShadow:    '0 8px 32px rgba(0,0,0,0.6)',
  });

  panel.addEventListener('mousedown', e => e.stopPropagation());
  panel.addEventListener('click', e => e.stopPropagation());

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Klik w tło zamyka modal
  overlay.addEventListener('click', () => hideAutoPauseSettings());

  _modalEl = overlay;
  _modalEl._panel = panel;
  return _modalEl;
}

function _renderModalContent() {
  const sys = _systemRef();
  if (!_modalEl || !sys) return;
  const pl = getLocale() === 'pl';
  const settings = sys.getSettings();
  const enabled  = sys.isEnabled();

  const title = pl ? 'AUTO-PAUZA' : 'AUTO-PAUSE';
  const masterLabel = pl ? 'Auto-pauza włączona' : 'Auto-pause enabled';
  const allOnLabel  = pl ? 'Włącz wszystko'      : 'Enable all';
  const allOffLabel = pl ? 'Wyłącz wszystko'     : 'Disable all';
  const closeLabel  = pl ? 'Zamknij'             : 'Close';

  const accent = THEME.accent ?? '#00ffb4';
  const dim    = THEME.textDim ?? '#7a8a92';
  const success = THEME.success ?? '#00ffb4';
  const danger  = THEME.danger ?? '#ff5544';

  const rowsHtml = CATEGORIES.map(key => {
    const checked = settings[key] ? 'checked' : '';
    const labelTxt = _categoryLabel(key);
    return `
      <label data-key="${key}" style="
        display:flex; align-items:center; justify-content:space-between;
        padding:6px 4px; border-bottom:1px solid ${THEME.border ?? '#1a2530'};
        cursor:pointer; font-size:12px;
      ">
        <span>${labelTxt}</span>
        <input type="checkbox" data-key="${key}" ${checked}
          style="cursor:pointer; transform:scale(1.2);" />
      </label>
    `;
  }).join('');

  const html = `
    <div style="font-size:14px; color:${accent}; letter-spacing:2px; margin-bottom:10px;">
      ${title}
    </div>

    <label style="
      display:flex; align-items:center; justify-content:space-between;
      padding:6px 4px; margin-bottom:8px; font-size:12px;
      border-bottom:1px solid ${THEME.border ?? '#1a2530'};
      cursor:pointer;
    ">
      <span style="color:${enabled ? success : dim};">${masterLabel}</span>
      <input type="checkbox" data-master="1" ${enabled ? 'checked' : ''}
        style="cursor:pointer; transform:scale(1.2);" />
    </label>

    <div style="opacity:${enabled ? '1' : '0.45'}; pointer-events:${enabled ? 'auto' : 'none'};">
      ${rowsHtml}
    </div>

    <div style="display:flex; gap:8px; margin-top:14px;">
      <button data-action="all-on" style="
        flex:1; padding:6px 8px; font-size:11px; cursor:pointer;
        background:transparent; color:${success};
        border:1px solid ${success}; border-radius:3px;
        font-family:inherit; letter-spacing:1px;
      ">${allOnLabel}</button>
      <button data-action="all-off" style="
        flex:1; padding:6px 8px; font-size:11px; cursor:pointer;
        background:transparent; color:${danger};
        border:1px solid ${danger}; border-radius:3px;
        font-family:inherit; letter-spacing:1px;
      ">${allOffLabel}</button>
    </div>

    <button data-action="close" style="
      width:100%; margin-top:10px; padding:8px; font-size:12px; cursor:pointer;
      background:transparent; color:${THEME.textPrimary ?? '#e0e8ec'};
      border:1px solid ${THEME.border ?? '#1a2530'}; border-radius:3px;
      font-family:inherit; letter-spacing:1px;
    ">${closeLabel}</button>
  `;

  _modalEl._panel.innerHTML = html;

  // Hook: master switch
  const masterCb = _modalEl._panel.querySelector('input[data-master]');
  if (masterCb) {
    masterCb.addEventListener('change', () => {
      sys.setEnabled(masterCb.checked);
      _renderModalContent();
    });
  }

  // Hook: per-kategoria toggles
  _modalEl._panel.querySelectorAll('input[type="checkbox"][data-key]').forEach(cb => {
    cb.addEventListener('change', () => {
      sys.setSetting(cb.dataset.key, cb.checked);
    });
  });

  // Hook: przyciski "Wszystko on/off"
  const btnOn  = _modalEl._panel.querySelector('button[data-action="all-on"]');
  const btnOff = _modalEl._panel.querySelector('button[data-action="all-off"]');
  const btnClose = _modalEl._panel.querySelector('button[data-action="close"]');
  if (btnOn)  btnOn.addEventListener('click',  () => { sys.setAllSettings(true);  _renderModalContent(); });
  if (btnOff) btnOff.addEventListener('click', () => { sys.setAllSettings(false); _renderModalContent(); });
  if (btnClose) btnClose.addEventListener('click', () => hideAutoPauseSettings());
}

export function showAutoPauseSettings() {
  if (!_systemRef()) return;
  _createModal();
  _renderModalContent();
  _modalEl.style.display = 'flex';
}

export function hideAutoPauseSettings() {
  if (_modalEl) _modalEl.style.display = 'none';
}
