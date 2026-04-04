// ReturnCargoModal — DOM modal do konfiguracji ładunku powrotnego
//
// Gracz wybiera zasoby z kolonii docelowej, które statek zabierze w drogę powrotną.
// Styl: spójny z TradeRouteModal.

import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';

// Ikony zasobów
const RES_ICONS = {};
for (const [id, def] of Object.entries(MINED_RESOURCES))     RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(HARVESTED_RESOURCES))  RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(COMMODITIES))          RES_ICONS[id] = def.icon ?? '📦';

/**
 * Pokaż modal konfiguracji ładunku powrotnego.
 * @param {Object} targetColony — kolonia docelowa (źródło zasobów powrotnych)
 * @param {Object} vessel — statek (info o ładowności)
 * @returns {Promise<{returnCargo: Object}|null>}
 */
export function showReturnCargoModal(targetColony, vessel) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.75); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgSecondary}; border: 1px solid ${THEME.border};
      border-radius: 6px; padding: 20px; width: 400px; max-height: 80vh;
      overflow-y: auto;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 30px rgba(2,4,5,0.88);
    `;

    // Tytuł
    const title = document.createElement('div');
    title.style.cssText = `text-align: center; font-size: ${THEME.fontSizeNormal + 2}px; font-weight: bold; margin-bottom: 12px; color: ${THEME.accent};`;
    title.textContent = t('returnCargo.title');
    panel.appendChild(title);

    // Info o ładowności
    const shipDef = SHIPS[vessel?.shipId] ?? HULLS[vessel?.shipId];
    const cargoCapacity = shipDef?.cargoCapacity ?? 0;
    let cargoInfo = null;
    if (cargoCapacity > 0) {
      cargoInfo = document.createElement('div');
      cargoInfo.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
      cargoInfo.textContent = t('returnCargo.capacity', 0, cargoCapacity);
      panel.appendChild(cargoInfo);
    }

    // Separator
    const sep = document.createElement('hr');
    sep.style.cssText = `border: none; border-top: 1px solid ${THEME.border}; margin: 8px 0;`;
    panel.appendChild(sep);

    // Zasoby kolonii docelowej
    const targetInv = targetColony.resourceSystem?.inventory ?? new Map();
    const inputs = {};

    // Pre-deklaracja confirmBtn (potrzebna do blokady overweight)
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = t('returnCargo.confirm');
    confirmBtn.style.cssText = `
      padding: 8px 20px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.borderActive};
      border-radius: 4px; color: ${THEME.accent}; font-family: ${THEME.fontFamily}; cursor: pointer;
    `;

    const addSection = (label, items) => {
      const filteredItems = items.filter(([id]) => (targetInv.get(id) ?? 0) > 0);
      if (filteredItems.length === 0) return;
      const sec = document.createElement('div');
      sec.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textHeader}; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: 1px;`;
      sec.textContent = label;
      panel.appendChild(sec);
      for (const [id] of filteredItems) {
        const have = targetInv.get(id) ?? 0;
        const icon = RES_ICONS[id] ?? '';
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 6px; margin: 2px 0;';
        row.innerHTML = `<span style="width: 80px; font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}">${icon} ${id} (${have})</span>`;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.min = 0; inp.max = have; inp.value = 0;
        inp.style.cssText = `
          width: 60px; padding: 2px 4px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
          color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily}; font-size: ${THEME.fontSizeSmall}px;
          text-align: center;
        `;
        inputs[id] = inp;
        row.appendChild(inp);
        panel.appendChild(row);
      }
    };

    addSection(t('tradeRoute.mined'), Object.entries(MINED_RESOURCES));
    addSection(t('tradeRoute.harvested'), Object.entries(HARVESTED_RESOURCES));
    addSection(t('tradeRoute.commodities'), Object.entries(COMMODITIES));

    // Brak zasobów w kolonii docelowej
    if (Object.keys(inputs).length === 0) {
      const noRes = document.createElement('div');
      noRes.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textDim}; font-style: italic; margin: 4px 0;`;
      noRes.textContent = t('returnCargo.noResources');
      panel.appendChild(noRes);
    }

    // Aktualizacja wagi
    const _updateWeight = () => {
      if (!cargoInfo || cargoCapacity <= 0) return;
      let total = 0;
      for (const [, inp] of Object.entries(inputs)) {
        total += parseInt(inp.value) || 0;
      }
      const overweight = total > cargoCapacity;
      cargoInfo.textContent = t('returnCargo.capacity', total, cargoCapacity);
      cargoInfo.style.color = overweight ? THEME.danger : THEME.textSecondary;
      confirmBtn.disabled = overweight;
      confirmBtn.style.opacity = overweight ? '0.4' : '1';
    };
    for (const inp of Object.values(inputs)) {
      inp.addEventListener('input', _updateWeight);
    }

    // Przyciski
    const btns = document.createElement('div');
    btns.style.cssText = 'display: flex; gap: 8px; justify-content: center; margin-top: 16px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = t('returnCargo.cancel');
    cancelBtn.style.cssText = `
      padding: 8px 20px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
      border-radius: 4px; color: ${THEME.textSecondary}; font-family: ${THEME.fontFamily}; cursor: pointer;
    `;

    btns.appendChild(confirmBtn);
    btns.appendChild(cancelBtn);
    panel.appendChild(btns);

    // Blokuj propagację kliknięć do canvas
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const close = (result) => {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(result);
    };

    confirmBtn.addEventListener('click', () => {
      const returnCargo = {};
      let totalWeight = 0;
      for (const [id, inp] of Object.entries(inputs)) {
        const val = parseInt(inp.value) || 0;
        if (val > 0) { returnCargo[id] = val; totalWeight += val; }
      }
      // Blokuj jeśli przekroczona ładowność
      if (cargoCapacity > 0 && totalWeight > cargoCapacity) return;
      close({ returnCargo });
    });

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}
