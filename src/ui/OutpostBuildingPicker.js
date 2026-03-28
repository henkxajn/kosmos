// OutpostBuildingPicker — modal DOM do wyboru budynku przy zakładaniu outpostu
//
// Pokazuje WSZYSTKIE budynki pogrupowane:
//   ⚙ Autonomiczne — działają od razu na outpoście (isAutonomous || popCost===0)
//   👷 Wymagają załogi — potrzebują upgrade do kolonii (popCost > 0)
//
// Filtrowanie:
//   - Tech: brak researched → ukryty
//   - Teren: canPlaceBuildingOnBody() → zablokowany z powodem
//   - Koszt: brak surowców → klikalne! (pending order, fabryki wyprodukują)
//
// Zwraca Promise<{ buildingId, pending } | null>

import { BUILDINGS } from '../data/BuildingsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { THEME } from '../config/ThemeConfig.js';
import { t, getName } from '../i18n/i18n.js';
import { getBodyTerrains, canPlaceBuildingOnBody } from '../utils/BodyTerrainUtils.js';

// Budynki wykluczone z pickera (unikalne/specjalne)
const EXCLUDED = new Set([
  'colony_base',    // stolica — automatycznie przy zakładaniu
]);

let _instance = null;

function _resName(id) {
  const def = MINED_RESOURCES[id] ?? HARVESTED_RESOURCES[id] ?? COMMODITIES[id];
  if (def) return getName({ id, namePL: def.namePL }, COMMODITIES[id] ? 'commodity' : 'resource');
  return id;
}

// Tłumaczenie powodu blokady terenu
function _terrainReasonText(reason) {
  switch (reason) {
    case 'noVolcano':    return t('outpostPicker.noVolcano');
    case 'noAtmosphere': return t('outpostPicker.noAtmosphere');
    case 'noTerrain':    return t('outpostPicker.noTerrain');
    default:             return t('outpostPicker.noTerrain');
  }
}

export class OutpostBuildingPicker {
  constructor() {
    this._el = null;
    this._resolve = null;
  }

  /**
   * Pokaż modal wyboru budynku dla outpostu na danym ciele.
   * @param {object} resourceSystem — RS kolonii (do sprawdzenia canAfford)
   * @param {object} targetBody — encja ciała docelowego (do filtrowania terenów)
   * @returns {Promise<{ buildingId: string, pending: boolean } | null>}
   */
  show(resourceSystem, targetBody) {
    return new Promise(resolve => {
      this._resolve = resolve;
      this._createDOM(resourceSystem, targetBody);
    });
  }

  _createDOM(resSys, targetBody) {
    if (this._el) { this._el.remove(); this._el = null; }

    // Predykcja terenów ciała docelowego
    const bodyTerrains = targetBody ? getBodyTerrains(targetBody) : new Set();

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
      border-radius: 6px; padding: 20px 24px; min-width: 380px; max-width: 500px;
      color: ${THEME.textPrimary};
    `;

    // Tytuł z nazwą ciała
    const bodyName = targetBody?.name ?? '???';
    const title = document.createElement('div');
    title.textContent = t('outpostPicker.titleFor', bodyName);
    title.style.cssText = `font-size: 14px; font-weight: bold; color: ${THEME.accent}; margin-bottom: 12px; text-align: center;`;
    panel.appendChild(title);

    // Zbierz budynki w 2 grupy
    const autonomous = []; // isAutonomous || popCost===0
    const crewNeeded = []; // popCost > 0

    for (const [bId, bDef] of Object.entries(BUILDINGS)) {
      if (EXCLUDED.has(bId)) continue;

      // Filtr tech: brak researched → ukryj
      if (bDef.requires) {
        const techOk = window.KOSMOS?.techSystem?.isResearched(bDef.requires) ?? false;
        if (!techOk) continue;
      }

      const isAuto = bDef.isAutonomous || (bDef.popCost ?? 0) === 0;
      if (isAuto) {
        autonomous.push(bId);
      } else {
        crewNeeded.push(bId);
      }
    }

    // Lista budynków — scrollowalny kontener
    const list = document.createElement('div');
    list.style.cssText = 'display: flex; flex-direction: column; gap: 4px; max-height: 420px; overflow-y: auto; padding-right: 4px;';

    // Sekcja Autonomiczne
    if (autonomous.length > 0) {
      list.appendChild(this._sectionHeader(t('outpostPicker.groupAutonomous')));
      for (const bId of autonomous) {
        list.appendChild(this._buildRow(bId, resSys, bodyTerrains, false));
      }
    }

    // Sekcja Wymagają załogi
    if (crewNeeded.length > 0) {
      list.appendChild(this._sectionHeader(t('outpostPicker.groupCrew')));
      for (const bId of crewNeeded) {
        list.appendChild(this._buildRow(bId, resSys, bodyTerrains, true));
      }
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

  // Nagłówek sekcji
  _sectionHeader(text) {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
      font-size: 11px; font-weight: bold; color: ${THEME.textSecondary};
      padding: 6px 0 2px; border-bottom: 1px solid ${THEME.border};
      margin-top: 4px; text-transform: uppercase; letter-spacing: 1px;
    `;
    return el;
  }

  // Wiersz budynku
  _buildRow(bId, resSys, bodyTerrains, needsCrew) {
    const bDef = BUILDINGS[bId];

    // Sprawdź kompatybilność terenu
    const terrainCheck = canPlaceBuildingOnBody(bDef, bodyTerrains);
    const terrainOk = terrainCheck.ok;

    // Oblicz pełny koszt
    const totalCost = {};
    for (const [resId, qty] of Object.entries(bDef.cost ?? {})) {
      totalCost[resId] = (totalCost[resId] ?? 0) + qty;
    }
    for (const [comId, qty] of Object.entries(bDef.commodityCost ?? {})) {
      totalCost[comId] = (totalCost[comId] ?? 0) + qty;
    }

    const canAfford = resSys ? resSys.canAfford(totalCost) : false;

    // Stan: blocked (teren) > affordable > pending (brak surowców)
    const blocked = !terrainOk;
    const clickable = !blocked;

    // Kolory ramki i tła
    let borderColor, bgColor, cursor, opacity;
    if (blocked) {
      borderColor = THEME.border;
      bgColor = 'rgba(20,20,30,0.4)';
      cursor = 'not-allowed';
      opacity = '0.4';
    } else if (canAfford) {
      borderColor = THEME.accent;
      bgColor = 'rgba(0,255,180,0.06)';
      cursor = 'pointer';
      opacity = '1';
    } else {
      // Brak surowców — klikalne (pending)
      borderColor = THEME.warning ?? '#ffaa33';
      bgColor = 'rgba(255,170,51,0.06)';
      cursor = 'pointer';
      opacity = '0.85';
    }

    const row = document.createElement('div');
    row.style.cssText = `
      padding: 7px 10px; border: 1px solid ${borderColor};
      border-radius: 3px; cursor: ${cursor};
      background: ${bgColor}; opacity: ${opacity};
    `;

    // Linia 1: Ikona + nazwa + badge
    const nameEl = document.createElement('div');
    const nameColor = blocked ? THEME.textDim : (canAfford ? THEME.accent : (THEME.warning ?? '#ffaa33'));
    let nameText = `${bDef.icon ?? '🏗'} ${getName(bDef, 'building')}`;
    if (needsCrew) nameText += ` ⚠ ${t('outpostPicker.crewWarning')}`;
    nameEl.textContent = nameText;
    nameEl.style.cssText = `font-size: 11px; font-weight: bold; color: ${nameColor};`;
    row.appendChild(nameEl);

    // Linia 2: powód blokady LUB koszt
    if (blocked) {
      const reasonEl = document.createElement('div');
      reasonEl.textContent = `✕ ${_terrainReasonText(terrainCheck.reason)}`;
      reasonEl.style.cssText = `font-size: 10px; margin-top: 2px; color: ${THEME.danger};`;
      row.appendChild(reasonEl);
    } else {
      // Koszt — kolorowany per pozycja (zielony=mamy, czerwony=brak)
      const costParts = [];
      for (const [resId, qty] of Object.entries(totalCost)) {
        const stock = resSys?.inventory?.get(resId) ?? 0;
        const color = stock >= qty ? '#88ffaa' : '#ff6666';
        costParts.push(`<span style="color:${color}">${_resName(resId)}:${qty}</span>`);
      }
      if (costParts.length > 0) {
        const costEl = document.createElement('div');
        costEl.innerHTML = costParts.join(' ');
        costEl.style.cssText = `font-size: 10px; margin-top: 2px; color: ${THEME.textSecondary};`;
        row.appendChild(costEl);
      }

      // Info o pendingu
      if (!canAfford) {
        const pendingEl = document.createElement('div');
        pendingEl.textContent = `⏳ ${t('outpostPicker.queuePending')}`;
        pendingEl.style.cssText = `font-size: 9px; margin-top: 1px; color: ${THEME.warning ?? '#ffaa33'}; font-style: italic;`;
        row.appendChild(pendingEl);
      }
    }

    // Interakcja
    if (clickable) {
      const hoverBg = canAfford ? 'rgba(0,255,180,0.12)' : 'rgba(255,170,51,0.12)';
      row.onmouseenter = () => { row.style.background = hoverBg; };
      row.onmouseleave = () => { row.style.background = bgColor; };
      row.onclick = () => {
        this._close();
        this._resolve?.({ buildingId: bId, pending: !canAfford });
      };
    }

    return row;
  }

  _close() {
    if (this._el) { this._el.remove(); this._el = null; }
  }

  static getInstance() {
    if (!_instance) _instance = new OutpostBuildingPicker();
    return _instance;
  }
}
