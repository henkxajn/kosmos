// NotificationDropdown — DOM overlay z listą notyfikacji "silent"
//
// Otwierany kliknięciem dzwonka 🔔 w BottomBar. Rozwija się w górę z bell anchora.
// Grupowanie po typie (np. wszystkie 'discovery_body' → "Odkrycia ×N"). Grupy
// z count ≥ 3 są zwijane domyślnie, < 3 rozwinięte. Klik wiersza → emit
// 'notify:openDetail' + dismiss tej notyfikacji + close dropdown.

import EventBus from '../core/EventBus.js';
import { THEME } from '../config/ThemeConfig.js';
import { t } from '../i18n/i18n.js';

let _dom = null;            // root element
let _open = false;
let _anchor = { x: 0, y: 0, barH: 26 };
let _expanded = new Set();  // typy grup ROZWINIĘTE jawnie (override default)
let _collapsed = new Set(); // typy grup ZWINIĘTE jawnie (override default)
let _listeners = false;

// Ikony per typ grupy (dla nagłówka grupy w dropdown)
const GROUP_ICONS = {
  discovery_body: '🔭',
};

function _groupTitle(type) {
  switch (type) {
    case 'discovery_body': return t('notif.group.discoveryBody');
    default:               return type;
  }
}

function _isExpanded(type, count) {
  if (_expanded.has(type)) return true;
  if (_collapsed.has(type)) return false;
  // default: rozwinięte gdy <3, zwinięte gdy ≥3
  return count < 3;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function isNotificationDropdownOpen() {
  return _open;
}

export function openNotificationDropdown(anchor) {
  if (anchor) _anchor = { ...anchor };
  if (!_dom) _createDom();
  _open = true;
  _attachListeners();
  _render();
  _dom.style.display = 'block';
}

export function closeNotificationDropdown() {
  if (!_open) return;
  _open = false;
  if (_dom) _dom.style.display = 'none';
  _detachListeners();
}

export function toggleNotificationDropdown(anchor) {
  if (_open) closeNotificationDropdown();
  else       openNotificationDropdown(anchor);
}

// ── DOM ────────────────────────────────────────────────────────────────────

function _createDom() {
  const el = document.createElement('div');
  el.className = 'kosmos-notification-dropdown';
  el.style.cssText = `
    position: fixed; z-index: 101; display: none;
    width: 320px; max-height: 420px;
    background: rgba(2,4,5,0.96);
    border: 1px solid ${THEME.borderActive};
    font-family: ${THEME.fontFamily};
    color: ${THEME.textSecondary};
    pointer-events: auto; user-select: none;
    box-shadow: 0 4px 18px rgba(0,0,0,0.6);
  `;
  el.addEventListener('mousedown', e => e.stopPropagation());
  el.addEventListener('click', e => e.stopPropagation());
  document.body.appendChild(el);
  _dom = el;
}

function _attachListeners() {
  if (_listeners) return;
  _listeners = true;
  EventBus.on('notify:listChanged', _onListChanged);
  document.addEventListener('keydown', _onKey);
  // Click poza dropdown → zamknij (capture phase żeby przechwycić przed canvas)
  document.addEventListener('mousedown', _onOutsideMouseDown, true);
}

function _detachListeners() {
  if (!_listeners) return;
  _listeners = false;
  EventBus.off?.('notify:listChanged', _onListChanged);
  document.removeEventListener('keydown', _onKey);
  document.removeEventListener('mousedown', _onOutsideMouseDown, true);
}

function _onListChanged() {
  if (_open) _render();
}

function _onKey(e) {
  if (e.key === 'Escape') {
    closeNotificationDropdown();
  }
}

function _onOutsideMouseDown(e) {
  if (!_dom) return;
  // Klik wewnątrz dropdown — ignoruj (dropdown sam się obroni stopPropagation)
  if (_dom.contains(e.target)) return;
  // Klik w obszar BottomBar (dolny pasek) — BottomBar.hitTest sam obsłuży
  // toggle dropdown w bubble phase. Bez tej gardy mielibyśmy close → reopen pętle.
  // Heurystyka: 50px od dołu okna pokrywa pasek 26px + zapas dla wysokich DPI.
  if (e.clientY >= window.innerHeight - 50) return;
  closeNotificationDropdown();
}

function _render() {
  if (!_dom) return;
  const nc = window.KOSMOS?.notificationCenter;
  const groups = nc?.getGrouped?.() ?? [];

  // Pozycjonowanie: rozwiń w górę z anchora (bell button)
  const dropW = 320;
  const margin = 6;
  let left = (_anchor.x ?? 0) - dropW / 2;
  if (left < margin) left = margin;
  if (left + dropW > window.innerWidth - margin) left = window.innerWidth - dropW - margin;
  // Bottom: tuż nad paskiem dolnym
  const bottom = (_anchor.barH ?? 26) + 4;
  _dom.style.left   = `${left}px`;
  _dom.style.bottom = `${bottom}px`;
  _dom.style.right  = 'auto';
  _dom.style.top    = 'auto';

  // Header
  const total = groups.reduce((acc, g) => acc + g.items.length, 0);
  let html = `
    <div style="
      display:flex; justify-content:space-between; align-items:center;
      padding: 8px 12px; border-bottom: 1px solid ${THEME.border};
      color: ${THEME.accent}; font-size: ${THEME.fontSizeNormal}px;
    ">
      <span>🔔 ${t('notif.title')} ${total > 0 ? `(${total})` : ''}</span>
      <span data-action="close" style="cursor:pointer; color:${THEME.textDim};">✕</span>
    </div>
  `;

  // Empty state
  if (total === 0) {
    html += `
      <div style="padding: 20px 12px; text-align:center; color:${THEME.textDim}; font-size:${THEME.fontSizeSmall}px;">
        ${t('notif.empty')}
      </div>
    `;
  } else {
    // Body — lista grup
    html += `<div style="overflow-y:auto; max-height: 320px;">`;
    for (const g of groups) {
      const count = g.items.length;
      const expanded = _isExpanded(g.type, count);
      const icon = GROUP_ICONS[g.type] ?? '•';
      const title = _groupTitle(g.type);

      html += `
        <div data-action="toggleGroup" data-type="${g.type}" style="
          display:flex; justify-content:space-between; align-items:center;
          padding: 6px 12px; cursor: pointer;
          background: ${THEME.bgTertiary}; color: ${THEME.textPrimary};
          font-size: ${THEME.fontSizeSmall}px;
          border-top: 1px solid ${THEME.border};
        "
          onmouseenter="this.style.background='${THEME.accentDim}'"
          onmouseleave="this.style.background='${THEME.bgTertiary}'"
        >
          <span>${icon} ${title} <span style="color:${THEME.textDim};">×${count}</span></span>
          <span style="color:${THEME.textDim};">${expanded ? '▼' : '▶'}</span>
        </div>
      `;

      if (expanded) {
        for (const n of g.items) {
          const subtitle = n.subtitle ?? '';
          const yearLabel = (n.year != null && n.year > 0) ? `yr ${Math.floor(n.year)}` : '';
          html += `
            <div data-action="openItem" data-id="${n.id}" style="
              display:flex; justify-content:space-between; align-items:flex-start;
              padding: 6px 12px 6px 28px; cursor: pointer;
              border-top: 1px solid ${THEME.border};
              font-size: ${THEME.fontSizeSmall}px;
            "
              onmouseenter="this.style.background='${THEME.accentDim}'"
              onmouseleave="this.style.background='transparent'"
            >
              <div style="flex:1; min-width:0;">
                <div style="color:${THEME.textPrimary}; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_escape(n.title)}</div>
                <div style="color:${THEME.textDim}; font-size:${THEME.fontSizeSmall - 1}px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${_escape(subtitle)}${yearLabel ? ` · ${yearLabel}` : ''}</div>
              </div>
              <span data-action="dismissItem" data-id="${n.id}" style="
                color:${THEME.textDim}; padding: 0 6px; cursor:pointer; margin-left: 8px;
              " onmouseenter="this.style.color='${THEME.danger}'" onmouseleave="this.style.color='${THEME.textDim}'">✕</span>
            </div>
          `;
        }
      }
    }
    html += `</div>`;
  }

  // Footer
  html += `
    <div style="
      display:flex; justify-content:space-between; align-items:center;
      padding: 6px 12px; border-top: 1px solid ${THEME.border};
      font-size: ${THEME.fontSizeSmall}px;
    ">
      <span data-action="clearAll" style="
        cursor: ${total > 0 ? 'pointer' : 'default'};
        color: ${total > 0 ? THEME.textSecondary : THEME.textDim};
      ">${t('notif.clearAll')}</span>
      <span data-action="close" style="cursor:pointer; color:${THEME.textSecondary};">${t('notif.close')}</span>
    </div>
  `;

  _dom.innerHTML = html;

  // Bindings
  _dom.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const act = el.dataset.action;
      const id = el.dataset.id;
      const type = el.dataset.type;
      _handleAction(act, { id, type });
    });
  });
}

function _handleAction(action, { id, type }) {
  const nc = window.KOSMOS?.notificationCenter;
  switch (action) {
    case 'close':
      closeNotificationDropdown();
      break;
    case 'clearAll':
      nc?.dismissAll?.();
      _render();
      break;
    case 'toggleGroup': {
      if (!type) return;
      // Sprawdź aktualny stan i przełącz wprost (override defaults)
      const groups = nc?.getGrouped?.() ?? [];
      const g = groups.find(x => x.type === type);
      const count = g ? g.items.length : 0;
      const currently = _isExpanded(type, count);
      _expanded.delete(type);
      _collapsed.delete(type);
      if (currently) _collapsed.add(type);
      else           _expanded.add(type);
      _render();
      break;
    }
    case 'dismissItem':
      if (id) {
        nc?.dismiss?.(id);
        _render();
      }
      break;
    case 'openItem': {
      if (!id) return;
      const notif = nc?.getById?.(id);
      if (notif) {
        EventBus.emit('notify:openDetail', { notif });
        nc?.dismiss?.(id);
      }
      closeNotificationDropdown();
      break;
    }
  }
}

function _escape(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
