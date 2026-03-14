// TransportModal — modal DOM do transferu zasobów między koloniami
//
// Gracz wybiera kolonię docelową i ilości zasobów do wysłania.
// Nowy model: pełne inventory (mined + harvested + commodities) + waga + cargo capacity.
// Styl: sci-fi, ciemny panel, z-index 100.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { SHIPS } from '../data/ShipsData.js';
import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';

// Ikony zasobów (wszystkie kategorie)
const RES_ICONS = {};
for (const [id, def] of Object.entries(MINED_RESOURCES))     RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(HARVESTED_RESOURCES))  RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(COMMODITIES))          RES_ICONS[id] = def.icon ?? '📦';

// Wagi zasobów
const WEIGHTS = {};
for (const [id, def] of Object.entries(MINED_RESOURCES))     WEIGHTS[id] = def.weight ?? 1;
for (const [id, def] of Object.entries(HARVESTED_RESOURCES))  WEIGHTS[id] = def.weight ?? 1;
for (const [id, def] of Object.entries(COMMODITIES))          WEIGHTS[id] = def.weight ?? 1;

/**
 * Pokaż modal transferu zasobów.
 * @param {Object} sourceColony — kolonia źródłowa
 * @param {Array}  targetColonies — dostępne kolonie docelowe (może być pusta dla transportu do ciała bez kolonii)
 * @param {string} [fixedTargetId] — opcjonalny stały cel (gdy brak kolonii docelowej)
 * @returns {Promise<{targetId, cargo}|null>}
 */
export function showTransportModal(sourceColony, targetColonies, fixedTargetId) {
  return new Promise(resolve => {
    if ((!targetColonies || targetColonies.length === 0) && !fixedTargetId) {
      resolve(null);
      return;
    }

    // Cargo capacity — cargo_ship lub colony_ship
    const fleet = sourceColony.fleet ?? [];
    let cargoCapacity = 0;
    for (const shipId of fleet) {
      const ship = SHIPS[shipId];
      if (ship?.cargoCapacity > cargoCapacity) cargoCapacity = ship.cargoCapacity;
    }
    if (cargoCapacity === 0) cargoCapacity = 200; // domyślna pojemność

    // Overlay
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.75); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    // Panel
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgSecondary}; border: 1px solid ${THEME.border};
      border-radius: 6px; padding: 20px; width: 440px; max-height: 80vh;
      overflow-y: auto;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 30px rgba(2,4,5,0.88);
    `;

    // Tytuł
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; margin-bottom: 12px; font-weight: bold; text-align: center;';
    title.textContent = t('transport.title');
    panel.appendChild(title);

    // Z: kolonia źródłowa
    const fromDiv = document.createElement('div');
    fromDiv.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
    fromDiv.textContent = t('transport.from', sourceColony.name);
    panel.appendChild(fromDiv);

    // Do: wybór kolonii docelowej
    const toLabel = document.createElement('div');
    toLabel.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.textSecondary}; margin-bottom: 4px;`;
    toLabel.textContent = t('transport.to');
    panel.appendChild(toLabel);

    const targetSelect = document.createElement('select');
    targetSelect.style.cssText = `
      width: 100%; padding: 4px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
      color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily}; font-size: ${THEME.fontSizeNormal + 1}px; margin-bottom: 12px;
    `;
    if (targetColonies && targetColonies.length > 0) {
      for (const col of targetColonies) {
        const opt = document.createElement('option');
        opt.value = col.planetId;
        opt.textContent = `${col.isHomePlanet ? '🏛' : '🏙'} ${col.name}`;
        targetSelect.appendChild(opt);
      }
    } else if (fixedTargetId) {
      // Transport do ciała bez kolonii — stały cel
      const body = EntityManager.get(fixedTargetId);
      const opt = document.createElement('option');
      opt.value = fixedTargetId;
      opt.textContent = `📦 ${body?.name ?? fixedTargetId}`;
      targetSelect.appendChild(opt);
      targetSelect.disabled = true;
    }
    panel.appendChild(targetSelect);

    // Cargo info
    const cargoInfo = document.createElement('div');
    cargoInfo.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.accent}; margin-bottom: 8px; text-align: center;`;
    cargoInfo.textContent = t('transport.capacity', 0, cargoCapacity);
    panel.appendChild(cargoInfo);

    // Separator
    const sep = document.createElement('hr');
    sep.style.cssText = `border: none; border-top: 1px solid ${THEME.border}; margin: 8px 0;`;
    panel.appendChild(sep);

    // Pobierz inventory źródłowe
    const resSys = sourceColony.resourceSystem;
    const inventory = resSys?.inventory ?? new Map();

    // Buduj listę zasobów z ilością > 0, pogrupowane
    const inputs = {};
    let totalWeight = 0;

    const addSection = (label, items) => {
      const filteredItems = items.filter(([id]) => (inventory.get(id) ?? 0) > 0);
      if (filteredItems.length === 0) return;

      const header = document.createElement('div');
      header.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textDim}; margin: 6px 0 2px 0; font-weight: bold;`;
      header.textContent = label;
      panel.appendChild(header);

      for (const [id, def] of filteredItems) {
        const available = Math.floor(inventory.get(id) ?? 0);
        const weight = WEIGHTS[id] ?? 1;

        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; margin-bottom: 4px;';

        const icon = document.createElement('span');
        icon.style.cssText = 'width: 20px; font-size: 11px;';
        icon.textContent = RES_ICONS[id] ?? '?';
        row.appendChild(icon);

        const name = document.createElement('span');
        name.style.cssText = `width: 90px; font-size: ${THEME.fontSizeNormal}px; color: ${THEME.textSecondary};`;
        name.textContent = getName({ id, namePL: def.namePL }, COMMODITIES[id] ? 'commodity' : 'resource');
        row.appendChild(name);

        const input = document.createElement('input');
        input.type = 'number';
        input.min = 0;
        input.max = available;
        input.value = 0;
        input.style.cssText = `
          width: 60px; padding: 2px 4px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
          color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily}; font-size: ${THEME.fontSizeNormal}px; text-align: right;
        `;
        input.addEventListener('input', updateWeight);
        row.appendChild(input);
        inputs[id] = { input, weight };

        const avail = document.createElement('span');
        avail.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin-left: 6px; width: 50px;`;
        avail.textContent = `/ ${available}`;
        row.appendChild(avail);

        const wSpan = document.createElement('span');
        wSpan.style.cssText = `font-size: ${THEME.fontSizeSmall - 1}px; color: ${THEME.textDim}; margin-left: 4px; width: 40px;`;
        wSpan.textContent = `${weight}t/szt`;
        row.appendChild(wSpan);

        panel.appendChild(row);
      }
    };

    // Sekcje zasobów
    addSection(t('transport.rawMaterials'), Object.entries(MINED_RESOURCES));
    addSection(t('transport.harvested'), Object.entries(HARVESTED_RESOURCES));
    addSection(t('transport.commodities'), Object.entries(COMMODITIES));

    function updateWeight() {
      totalWeight = 0;
      for (const [id, { input, weight }] of Object.entries(inputs)) {
        const val = parseInt(input.value) || 0;
        totalWeight += val * weight;
      }
      const overweight = totalWeight > cargoCapacity;
      cargoInfo.textContent = t('transport.capacity', totalWeight.toFixed(1), cargoCapacity);
      cargoInfo.style.color = overweight ? THEME.dangerDim : THEME.accent;
      btnSend.disabled = overweight;
      btnSend.style.opacity = overweight ? '0.5' : '1';
    }

    // Info
    const info = document.createElement('div');
    info.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin: 8px 0;`;
    info.textContent = t('transport.crewCost');
    panel.appendChild(info);

    // Przyciski
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display: flex; justify-content: space-between; margin-top: 12px;';

    const btnCancel = document.createElement('button');
    const _dc = hexToRgb(THEME.dangerDim);
    btnCancel.style.cssText = `
      background: rgba(${_dc.r},${_dc.g},${_dc.b},0.2); border: 1px solid ${THEME.dangerDim};
      color: ${THEME.danger}; padding: 4px 16px; cursor: pointer; font-family: ${THEME.fontFamily};
      font-size: ${THEME.fontSizeNormal + 1}px; border-radius: 3px;
    `;
    btnCancel.textContent = t('ui.cancel');
    btnCancel.onclick = () => close(null);
    btnRow.appendChild(btnCancel);

    const btnSend = document.createElement('button');
    const _sc = hexToRgb(THEME.successDim);
    btnSend.style.cssText = `
      background: rgba(${_sc.r},${_sc.g},${_sc.b},0.2); border: 1px solid ${THEME.successDim};
      color: ${THEME.accent}; padding: 4px 16px; cursor: pointer; font-family: ${THEME.fontFamily};
      font-size: ${THEME.fontSizeNormal + 1}px; border-radius: 3px;
    `;
    btnSend.textContent = t('transport.send');
    btnSend.onclick = () => {
      const cargo = {};
      for (const [id, { input }] of Object.entries(inputs)) {
        const val = parseInt(input.value) || 0;
        if (val > 0) cargo[id] = val;
      }
      if (Object.keys(cargo).length === 0) return; // nic nie wybrano
      close({ targetId: targetSelect.value, cargo });
    };
    btnRow.appendChild(btnSend);
    panel.appendChild(btnRow);

    // Blokuj propagację kliknięć/mousedown do canvas/window
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
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
