// OutpostBuildingPicker — modal DOM do wyboru budynku przy zakładaniu outpostu
//
// Gracz wybiera budynek autonomiczny do postawienia na outpoście.
// Pokazuje koszt i dostępność. Zwraca Promise<string|null> (buildingId lub null).

import { BUILDINGS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';

// Budynki dostępne do budowy na outpoście (autonomiczne + podstawowe)
const OUTPOST_BUILDINGS = [
  'autonomous_mine',
  'autonomous_solar_farm',
  'mine',
  'solar_farm',
  'well',
  'farm',
];

let _instance = null;

function _resName(id) {
  const def = MINED_RESOURCES[id] ?? HARVESTED_RESOURCES[id] ?? COMMODITIES[id];
  if (def) return getName({ id, namePL: def.namePL }, COMMODITIES[id] ? 'commodity' : 'resource');
  return id;
}

export class OutpostBuildingPicker {
  constructor() {
    this._el = null;
    this._resolve = null;
  }

  /**
   * Pokaż modal wyboru budynku.
   * @param {object} resourceSystem — RS kolonii (do sprawdzenia canAfford)
   * @returns {Promise<string|null>} buildingId lub null (anulowano)
   */
  show(resourceSystem) {
    return new Promise(resolve => {
      this._resolve = resolve;
      this._createDOM(resourceSystem);
    });
  }

  _createDOM(resSys) {
    if (this._el) { this._el.remove(); this._el = null; }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); z-index: 200; display: flex;
      align-items: center; justify-content: center;
      font-family: 'Courier New', monospace;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(8,16,24,0.96); border: 1px solid ${THEME.accent};
      border-radius: 6px; padding: 20px 24px; min-width: 340px; max-width: 440px;
      color: ${THEME.textPrimary};
    `;

    // Tytuł
    const title = document.createElement('div');
    title.textContent = t('outpostPicker.title');
    title.style.cssText = `font-size: 14px; font-weight: bold; color: ${THEME.accent}; margin-bottom: 12px; text-align: center;`;
    panel.appendChild(title);

    // Lista budynków
    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto;';

    for (const bId of OUTPOST_BUILDINGS) {
      const bDef = BUILDINGS[bId];
      if (!bDef) continue;

      // Sprawdź wymagany tech
      if (bDef.requires) {
        const techOk = window.KOSMOS?.techSystem?.isResearched(bDef.requires) ?? false;
        if (!techOk) continue; // ukryj zablokowane
      }

      // Oblicz pełny koszt
      const totalCost = {};
      for (const [resId, qty] of Object.entries(bDef.cost ?? {})) {
        totalCost[resId] = (totalCost[resId] ?? 0) + qty;
      }
      for (const [comId, qty] of Object.entries(bDef.commodityCost ?? {})) {
        totalCost[comId] = (totalCost[comId] ?? 0) + qty;
      }

      const canAfford = resSys ? resSys.canAfford(totalCost) : false;

      const row = document.createElement('div');
      row.style.cssText = `
        padding: 8px 10px; border: 1px solid ${canAfford ? THEME.accent : THEME.border};
        border-radius: 3px; cursor: ${canAfford ? 'pointer' : 'not-allowed'};
        background: ${canAfford ? 'rgba(0,255,180,0.06)' : 'rgba(20,20,30,0.4)'};
        opacity: ${canAfford ? '1' : '0.5'};
      `;

      // Ikona + nazwa
      const nameEl = document.createElement('div');
      nameEl.textContent = `${bDef.icon ?? '🏗'} ${getName(bDef, 'building')}`;
      nameEl.style.cssText = `font-size: 12px; font-weight: bold; color: ${canAfford ? THEME.accent : THEME.textDim};`;
      row.appendChild(nameEl);

      // Opis kosztu
      const costParts = [];
      for (const [resId, qty] of Object.entries(totalCost)) {
        const stock = resSys?.inventory?.get(resId) ?? 0;
        const color = stock >= qty ? '#88ffaa' : '#ff6666';
        costParts.push(`<span style="color:${color}">${_resName(resId)}:${qty}</span>`);
      }
      const costEl = document.createElement('div');
      costEl.innerHTML = costParts.join(' ');
      costEl.style.cssText = `font-size: 10px; margin-top: 2px; color: ${THEME.textSecondary};`;
      row.appendChild(costEl);

      if (canAfford) {
        row.onmouseenter = () => { row.style.background = 'rgba(0,255,180,0.12)'; };
        row.onmouseleave = () => { row.style.background = 'rgba(0,255,180,0.06)'; };
        row.onclick = () => { this._close(); this._resolve?.(bId); };
      }

      list.appendChild(row);
    }

    panel.appendChild(list);

    // Przycisk anuluj
    const btnCancel = document.createElement('button');
    btnCancel.textContent = t('outpostPicker.cancel');
    btnCancel.style.cssText = `
      display: block; margin: 12px auto 0; padding: 6px 20px;
      background: rgba(255,51,68,0.1); border: 1px solid ${THEME.danger};
      color: ${THEME.danger}; font-family: inherit; font-size: 11px;
      cursor: pointer; border-radius: 3px;
    `;
    btnCancel.onclick = () => { this._close(); this._resolve?.(null); };
    panel.appendChild(btnCancel);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._el = overlay;

    overlay.onclick = (e) => {
      if (e.target === overlay) { this._close(); this._resolve?.(null); }
    };
  }

  _close() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  static getInstance() {
    if (!_instance) _instance = new OutpostBuildingPicker();
    return _instance;
  }
}
