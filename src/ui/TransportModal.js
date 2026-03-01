// TransportModal — modal DOM do transferu zasobów między koloniami
//
// Gracz wybiera kolonię docelową i ilości zasobów do wysłania.
// Styl: sci-fi, ciemny panel, z-index 100.

import EventBus from '../core/EventBus.js';

const RESOURCE_ICONS = {
  minerals: '⛏',
  energy:   '⚡',
  organics: '🌿',
  water:    '💧',
};

/**
 * Pokaż modal transferu zasobów.
 * @param {Object} sourceColony — kolonia źródłowa
 * @param {Array}  targetColonies — dostępne kolonie docelowe
 * @returns {Promise<{targetId, cargo}|null>}
 */
export function showTransportModal(sourceColony, targetColonies) {
  return new Promise(resolve => {
    if (!targetColonies || targetColonies.length === 0) {
      resolve(null);
      return;
    }

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.6); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: #0a1628; border: 1px solid #1a4060;
      border-radius: 6px; padding: 20px; width: 380px;
      font-family: monospace; color: #c8e8ff;
      box-shadow: 0 0 30px rgba(0,0,0,0.8);
    `;

    // Tytuł
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; margin-bottom: 12px; font-weight: bold; text-align: center;';
    title.textContent = '🚀 TRANSPORT ZASOBÓW';
    panel.appendChild(title);

    // Z: kolonia źródłowa
    const fromDiv = document.createElement('div');
    fromDiv.style.cssText = 'font-size: 10px; color: #6888aa; margin-bottom: 8px;';
    fromDiv.textContent = `Z: 🏛 ${sourceColony.name}`;
    panel.appendChild(fromDiv);

    // Do: wybór kolonii docelowej
    const toLabel = document.createElement('div');
    toLabel.style.cssText = 'font-size: 10px; color: #6888aa; margin-bottom: 4px;';
    toLabel.textContent = 'Do:';
    panel.appendChild(toLabel);

    const targetSelect = document.createElement('select');
    targetSelect.style.cssText = `
      width: 100%; padding: 4px; background: #0d1a2e; border: 1px solid #1a4060;
      color: #c8e8ff; font-family: monospace; font-size: 11px; margin-bottom: 12px;
    `;
    for (const col of targetColonies) {
      const opt = document.createElement('option');
      opt.value = col.planetId;
      opt.textContent = `${col.isHomePlanet ? '🏛' : '🏙'} ${col.name}`;
      targetSelect.appendChild(opt);
    }
    panel.appendChild(targetSelect);

    // Separator
    const sep = document.createElement('hr');
    sep.style.cssText = 'border: none; border-top: 1px solid #1a3050; margin: 8px 0;';
    panel.appendChild(sep);

    // Slidery zasobów
    const inputs = {};
    const resSys = sourceColony.resourceSystem;
    const resources = resSys?.resources ?? {};

    for (const [key, icon] of Object.entries(RESOURCE_ICONS)) {
      const available = Math.floor(resources[key]?.amount ?? 0);

      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; margin-bottom: 6px;';

      const label = document.createElement('span');
      label.style.cssText = 'width: 24px; font-size: 12px;';
      label.textContent = icon;
      row.appendChild(label);

      const input = document.createElement('input');
      input.type = 'number';
      input.min = 0;
      input.max = available;
      input.value = 0;
      input.style.cssText = `
        width: 70px; padding: 2px 4px; background: #0d1a2e; border: 1px solid #1a4060;
        color: #c8e8ff; font-family: monospace; font-size: 11px; text-align: right;
      `;
      row.appendChild(input);
      inputs[key] = input;

      const avail = document.createElement('span');
      avail.style.cssText = 'font-size: 9px; color: #6888aa; margin-left: 8px;';
      avail.textContent = `/ ${available}`;
      row.appendChild(avail);

      panel.appendChild(row);
    }

    // Info
    const info = document.createElement('div');
    info.style.cssText = 'font-size: 9px; color: #6888aa; margin: 8px 0;';
    info.textContent = 'Koszt załogi: 0.5 POP (zablokowany na czas podróży)';
    panel.appendChild(info);

    // Przyciski
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: space-between; margin-top: 12px;';

    const btnCancel = document.createElement('button');
    btnCancel.style.cssText = `
      background: rgba(60,20,20,0.8); border: 1px solid #cc4422;
      color: #ff8888; padding: 4px 16px; cursor: pointer; font-family: monospace;
      font-size: 11px; border-radius: 3px;
    `;
    btnCancel.textContent = 'Anuluj';
    btnCancel.onclick = () => close(null);
    btnRow.appendChild(btnCancel);

    const btnSend = document.createElement('button');
    btnSend.style.cssText = `
      background: rgba(20,60,40,0.8); border: 1px solid #44cc66;
      color: #88ffcc; padding: 4px 16px; cursor: pointer; font-family: monospace;
      font-size: 11px; border-radius: 3px;
    `;
    btnSend.textContent = 'WYŚLIJ';
    btnSend.onclick = () => {
      const cargo = {};
      for (const [key, input] of Object.entries(inputs)) {
        const val = parseInt(input.value) || 0;
        if (val > 0) cargo[key] = val;
      }
      if (Object.keys(cargo).length === 0) return; // nic nie wybrano
      close({ targetId: targetSelect.value, cargo });
    };
    btnRow.appendChild(btnSend);
    panel.appendChild(btnRow);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Klik poza panel = anuluj
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    // Keydown
    const onKey = (e) => {
      if (e.code === 'Escape') {
        e.stopPropagation();
        close(null);
      }
    };
    document.addEventListener('keydown', onKey);

    function close(result) {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    }
  });
}
