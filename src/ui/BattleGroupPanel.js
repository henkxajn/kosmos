// BattleGroupPanel — lista wszystkich zaznaczonych jednostek (multi-select / grupa bojowa)
//
// Otwierany przez klawisz `I` gdy _selectedUnits.size > 1 w ColonyOverlay.
// Pokazuje tabelę: archetyp + nazwa + HP + status + pozycja. Per-jednostka:
//   - klik na wiersz → otwórz UnitCardPanel tej jednostki
//   - przycisk ✕ → usuń z selectu

import { UNIT_ARCHETYPES } from '../data/unitArchetypes.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { showUnitCard } from './UnitCardPanel.js';

/**
 * @param {Array<object>} units — zaznaczone jednostki (z getUnit)
 * @param {Set<string>} selectedSet — referencja do _selectedUnits (do modyfikacji)
 * @returns {Promise<void>}
 */
export function showBattleGroup(units, selectedSet) {
  return new Promise(resolve => {
    if (!units || units.length === 0) { resolve(); return; }

    const _ac = hexToRgb(THEME.accent);

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.72); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgPrimary}; border: 2px solid ${THEME.accent};
      border-radius: 4px; width: 540px; max-height: 80vh;
      display: flex; flex-direction: column;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 40px rgba(2,4,5,0.88), 0 0 12px rgba(${_ac.r},${_ac.g},${_ac.b},0.35);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 10px 16px; border-bottom: 1px solid ${THEME.border};
      display: flex; align-items: center; justify-content: space-between;
      flex-shrink: 0;
    `;
    const title = document.createElement('div');
    title.style.cssText = `font-size: 14px; font-weight: bold; color: ${THEME.accent}; letter-spacing: 1px;`;
    title.textContent = `👥 GRUPA BOJOWA — ${units.length} jednostek`;
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background: transparent; border: 1px solid ${THEME.border};
      color: ${THEME.textDim}; cursor: pointer;
      width: 28px; height: 28px; border-radius: 2px;
      font-family: ${THEME.fontFamily}; font-size: 14px;
    `;
    closeBtn.onclick = () => close();
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Table body — scrollable
    const body = document.createElement('div');
    body.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px 12px;
      scrollbar-width: thin;
      scrollbar-color: ${THEME.border} ${THEME.bgPrimary};
    `;

    // Column header
    const columnHeader = document.createElement('div');
    columnHeader.style.cssText = `
      display: grid; grid-template-columns: 28px 1fr 100px 70px 60px 26px;
      gap: 8px; padding: 4px 6px; font-size: 9px; color: ${THEME.textDim};
      border-bottom: 1px solid ${THEME.border}; letter-spacing: 0.5px;
      text-transform: uppercase; font-weight: bold;
    `;
    columnHeader.innerHTML = `
      <span></span><span>Archetyp</span><span>HP</span>
      <span>Status</span><span>Hex</span><span></span>
    `;
    body.appendChild(columnHeader);

    const list = document.createElement('div');
    body.appendChild(list);

    function _refresh() {
      list.innerHTML = '';
      if (selectedSet.size === 0) {
        close();
        return;
      }
      for (const unit of units) {
        if (!selectedSet.has(unit.id)) continue;
        const arch = UNIT_ARCHETYPES[unit.archetypeId];
        const hp = Math.round(unit.hp ?? unit.currentHP ?? 0);
        const maxHp = arch?.baseStats?.hp ?? unit.hpMax ?? hp;
        const hpFrac = maxHp > 0 ? hp / maxHp : 0;
        const hpColor = hpFrac > 0.6 ? '#80D840' : hpFrac > 0.3 ? '#D88040' : '#D84040';

        const row = document.createElement('div');
        row.style.cssText = `
          display: grid; grid-template-columns: 28px 1fr 100px 70px 60px 26px;
          gap: 8px; padding: 6px; align-items: center;
          background: rgba(${_ac.r},${_ac.g},${_ac.b},0.06);
          border-radius: 2px; margin-bottom: 2px;
          cursor: pointer; transition: background 0.15s;
        `;
        row.onmouseenter = () => { row.style.background = `rgba(${_ac.r},${_ac.g},${_ac.b},0.18)`; };
        row.onmouseleave = () => { row.style.background = `rgba(${_ac.r},${_ac.g},${_ac.b},0.06)`; };

        const icon = document.createElement('span');
        icon.style.cssText = 'font-size: 18px; text-align: center;';
        icon.textContent = arch?.icon ?? '🪖';
        row.appendChild(icon);

        const name = document.createElement('span');
        name.style.cssText = `font-size: 11px; color: ${THEME.textPrimary}; font-weight: 600;`;
        name.textContent = unit.customName || arch?.descriptionPL?.split('.')[0] || unit.archetypeId || unit.type;
        row.appendChild(name);

        // HP bar
        const hpBox = document.createElement('div');
        hpBox.style.cssText = 'display: flex; flex-direction: column; gap: 2px;';
        const hpText = document.createElement('span');
        hpText.style.cssText = `font-size: 10px; color: ${hpColor}; font-weight: 600;`;
        hpText.textContent = `${hp}/${maxHp}`;
        hpBox.appendChild(hpText);
        const hpBar = document.createElement('div');
        hpBar.style.cssText = `height: 4px; background: ${THEME.bgTertiary}; border-radius: 1px; overflow: hidden;`;
        const hpFill = document.createElement('div');
        hpFill.style.cssText = `height: 100%; width: ${(hpFrac * 100).toFixed(0)}%; background: ${hpColor};`;
        hpBar.appendChild(hpFill);
        hpBox.appendChild(hpBar);
        row.appendChild(hpBox);

        // Status
        const statusEl = document.createElement('span');
        statusEl.style.cssText = `font-size: 10px; color: ${THEME.textDim};`;
        let statusStr = unit.status ?? 'idle';
        if (unit.status === 'offline') statusStr = '🔌 offline';
        else if ((unit.supply ?? Infinity) <= 0) statusStr = '🍖 głód';
        else if (unit.transportStatus === 'loaded') statusStr = '💤 transport';
        else if (unit.status === 'moving') statusStr = '→ ruch';
        statusEl.textContent = statusStr;
        row.appendChild(statusEl);

        // Hex
        const hexEl = document.createElement('span');
        hexEl.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; text-align: center;`;
        hexEl.textContent = `${unit.q},${unit.r}`;
        row.appendChild(hexEl);

        // Deselect button
        const deselectBtn = document.createElement('button');
        deselectBtn.textContent = '✕';
        deselectBtn.style.cssText = `
          background: transparent; border: 1px solid ${THEME.border};
          color: ${THEME.textDim}; cursor: pointer;
          width: 22px; height: 22px; border-radius: 2px;
          font-family: ${THEME.fontFamily}; font-size: 11px;
        `;
        deselectBtn.onclick = (e) => {
          e.stopPropagation();
          selectedSet.delete(unit.id);
          _refresh();
        };
        row.appendChild(deselectBtn);

        // Klik na wiersz → UnitCardPanel konkretnej jednostki
        row.onclick = () => {
          close();
          showUnitCard(unit);
        };

        list.appendChild(row);
      }
    }
    _refresh();

    panel.appendChild(body);

    // Footer — akcje grupowe
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px 14px; border-top: 1px solid ${THEME.border};
      display: flex; gap: 8px; flex-shrink: 0;
      font-size: 10px; color: ${THEME.textDim};
    `;
    footer.innerHTML = `
      <span>📋 Klik wiersza → karta jednostki · ✕ → usuń z selectu · Esc → zamknij</span>
    `;
    panel.appendChild(footer);

    // Bindings
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    const onKey = (e) => {
      if (e.code === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve();
    }
  });
}
