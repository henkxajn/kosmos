// DropTroopsModal — wybór jednostek do zrzutu desantowego
//
// Otwierany po kliknięciu ⚔ Zrzuć wojska w panelu statku. Pokazuje
// wszystkie jednostki załadowane do troop bay jako checkboxy — gracz
// wybiera które chce zrzucić (nie wszystkie muszą lądować w jednej fali).
// Po potwierdzeniu wywołuje callback z listą unit IDs wybranych do zrzutu.

import { UNIT_ARCHETYPES, getTransportSize } from '../data/unitArchetypes.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';

/**
 * @param {object} vessel — VesselInstance z groundUnits
 * @param {string} targetName — nazwa ciała docelowego (wyświetlana w tytule)
 * @returns {Promise<string[]|null>} lista unit IDs do zrzutu, null = anulowano
 */
export function showDropTroopsModal(vessel, targetName = '???') {
  return new Promise(resolve => {
    const gum = window.KOSMOS?.groundUnitManager;
    const unitIds = vessel.groundUnits ?? [];
    if (unitIds.length === 0) { resolve(null); return; }

    const _ac = hexToRgb(THEME.accent);
    const _dc = hexToRgb(THEME.danger);

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.8); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgPrimary}; border: 1px solid ${THEME.danger};
      border-radius: 4px; width: 420px; max-height: 80vh;
      display: flex; flex-direction: column;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 40px rgba(2,4,5,0.88), 0 0 8px rgba(${_dc.r},${_dc.g},${_dc.b},0.25);
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `padding: 12px 16px 8px; border-bottom: 1px solid ${THEME.danger}; flex-shrink: 0;`;
    const title = document.createElement('div');
    title.style.cssText = `font-size: 13px; font-weight: bold; text-align: center; color: ${THEME.danger}; letter-spacing: 1px;`;
    title.textContent = `⚔ ZRZUT DESANTU — ${targetName}`;
    header.appendChild(title);

    const info = document.createElement('div');
    info.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; margin-top: 4px; text-align: center;`;
    info.textContent = `Zaznacz jednostki do zrzutu (${unitIds.length} w ładowni)`;
    header.appendChild(info);
    panel.appendChild(header);

    // Lista jednostek
    const content = document.createElement('div');
    content.style.cssText = `flex: 1; overflow-y: auto; padding: 10px 14px;`;

    // Stan: Set unit IDs do zrzutu (domyślnie wszystkie zaznaczone)
    const selected = new Set(unitIds);

    const rows = [];
    for (const unitId of unitIds) {
      const unit = gum?.getUnit?.(unitId);
      if (!unit) continue;
      const arc = UNIT_ARCHETYPES[unit.archetypeId];
      const name = arc?.descriptionPL?.split('.')[0] ?? unit.archetypeId;
      const size = getTransportSize(unit.archetypeId);
      const hp = Math.round(unit.hp ?? unit.currentHP ?? 0);
      const maxHp = arc?.baseStats?.hp ?? hp;

      const row = document.createElement('label');
      row.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        padding: 6px 8px; margin-bottom: 3px;
        background: rgba(${_ac.r},${_ac.g},${_ac.b},0.08);
        border: 1px solid rgba(${_ac.r},${_ac.g},${_ac.b},0.25);
        border-radius: 3px; cursor: pointer;
        transition: background 0.15s;
      `;
      row.onmouseenter = () => { row.style.background = `rgba(${_ac.r},${_ac.g},${_ac.b},0.18)`; };
      row.onmouseleave = () => { row.style.background = `rgba(${_ac.r},${_ac.g},${_ac.b},0.08)`; };

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.style.cssText = `accent-color: ${THEME.danger}; cursor: pointer; width: 14px; height: 14px;`;
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(unitId);
        else selected.delete(unitId);
        updateFooter();
      });
      row.appendChild(cb);

      const icon = document.createElement('span');
      icon.style.cssText = 'font-size: 14px;';
      icon.textContent = arc?.icon ?? '🪖';
      row.appendChild(icon);

      const textBox = document.createElement('div');
      textBox.style.cssText = 'flex: 1; display: flex; flex-direction: column; gap: 2px;';
      const nameEl = document.createElement('div');
      nameEl.style.cssText = `font-size: 11px; color: ${THEME.textPrimary}; font-weight: 600;`;
      nameEl.textContent = name;
      textBox.appendChild(nameEl);

      const statsEl = document.createElement('div');
      statsEl.style.cssText = `font-size: 9px; color: ${THEME.textDim};`;
      statsEl.textContent = `HP ${hp}/${maxHp}  ·  ładowność ${size} pkt`;
      textBox.appendChild(statsEl);
      row.appendChild(textBox);

      content.appendChild(row);
      rows.push({ row, cb, unitId });
    }

    panel.appendChild(content);

    // Footer
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px 14px; border-top: 1px solid ${THEME.danger};
      display: flex; justify-content: space-between; align-items: center;
      flex-shrink: 0; gap: 10px;
    `;

    // Przyciski zaznacz wszystko / odznacz wszystko
    const selectBtns = document.createElement('div');
    selectBtns.style.cssText = 'display: flex; gap: 6px;';
    const btnAll = _btn('Wszystkie', THEME.accent, () => {
      for (const r of rows) { r.cb.checked = true; selected.add(r.unitId); }
      updateFooter();
    });
    const btnNone = _btn('Żadne', THEME.textDim, () => {
      for (const r of rows) { r.cb.checked = false; selected.delete(r.unitId); }
      updateFooter();
    });
    selectBtns.appendChild(btnAll);
    selectBtns.appendChild(btnNone);
    footer.appendChild(selectBtns);

    // Przyciski akcji
    const actionBtns = document.createElement('div');
    actionBtns.style.cssText = 'display: flex; gap: 6px;';
    const btnCancel = _btn('Anuluj', THEME.textDim, () => close(null));
    btnCancel.style.cssText += `padding: 5px 14px;`;
    const btnConfirm = _btn('Zrzuć', THEME.danger, () => {
      const ids = [...selected];
      close(ids.length > 0 ? ids : null);
    }, true);
    btnConfirm.style.cssText += `padding: 5px 18px; font-weight: bold;`;
    actionBtns.appendChild(btnCancel);
    actionBtns.appendChild(btnConfirm);
    footer.appendChild(actionBtns);
    panel.appendChild(footer);

    function updateFooter() {
      const count = selected.size;
      info.textContent = `Zaznaczono: ${count}/${unitIds.length}`;
      btnConfirm.disabled = count === 0;
      btnConfirm.style.opacity = count === 0 ? '0.4' : '1';
    }
    updateFooter();

    // Blokuj propagację
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });

    const onKey = (e) => {
      if (e.code === 'Escape') { e.stopPropagation(); close(null); }
      if (e.code === 'Enter')  { e.stopPropagation(); close([...selected]); }
    };
    document.addEventListener('keydown', onKey);

    function close(result) {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    }
  });
}

function _btn(text, color, onClick, large = false) {
  const c = hexToRgb(color);
  const btn = document.createElement('button');
  btn.style.cssText = `
    background: rgba(${c.r},${c.g},${c.b},0.18);
    border: 1px solid rgba(${c.r},${c.g},${c.b},0.6);
    color: ${color}; cursor: pointer;
    font-family: ${THEME.fontFamily};
    font-size: ${large ? '11' : '10'}px;
    padding: 3px 10px; border-radius: 2px;
    transition: background 0.15s;
  `;
  btn.onmouseenter = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.35)`; };
  btn.onmouseleave = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.18)`; };
  btn.onclick = onClick;
  btn.textContent = text;
  return btn;
}
