// TradeRouteModal — DOM modal do konfiguracji trasy handlowej
//
// Gracz wybiera zasoby do cyklicznego transportu i liczbę kursów.
// Styl: spójny z TransportModal.

import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { SHIPS } from '../data/ShipsData.js';
import { THEME } from '../config/ThemeConfig.js';

// Ikony zasobów
const RES_ICONS = {};
for (const [id, def] of Object.entries(MINED_RESOURCES))     RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(HARVESTED_RESOURCES))  RES_ICONS[id] = def.icon;
for (const [id, def] of Object.entries(COMMODITIES))          RES_ICONS[id] = def.icon ?? '📦';

/**
 * Pokaż modal konfiguracji trasy handlowej.
 * @param {Object} sourceColony — kolonia źródłowa
 * @param {string} targetBodyId — id ciała docelowego
 * @param {string} targetName — nazwa ciała docelowego
 * @param {Object} [vessel] — opcjonalny statek (info o ładowności)
 * @param {Object} [targetColony] — kolonia docelowa (jeśli istnieje) — dla returnCargo
 * @returns {Promise<{cargo, returnCargo, trips}|null>}
 */
export function showTradeRouteModal(sourceColony, targetBodyId, targetName, vessel, targetColony) {
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
      border-radius: 6px; padding: 20px; width: 420px; max-height: 80vh;
      overflow-y: auto;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 30px rgba(2,4,5,0.88);
    `;

    // Tytuł
    const title = document.createElement('div');
    title.style.cssText = 'font-size: 14px; margin-bottom: 12px; font-weight: bold; text-align: center;';
    title.textContent = '🔄 TRASA HANDLOWA';
    panel.appendChild(title);

    // Info: Z → Do
    const info = document.createElement('div');
    info.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.textSecondary}; margin-bottom: 12px;`;
    info.innerHTML = `Z: 🏛 ${sourceColony.name}<br>Do: 📦 ${targetName}`;
    panel.appendChild(info);

    // Info o ładowności statku
    const shipDef = vessel ? SHIPS[vessel.shipId] : null;
    const cargoCapacity = shipDef?.cargoCapacity ?? 0;
    let cargoInfo = null;
    if (vessel && cargoCapacity > 0) {
      cargoInfo = document.createElement('div');
      cargoInfo.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
      cargoInfo.textContent = `${shipDef?.namePL ?? vessel.shipId} — ładowność: 0 / ${cargoCapacity} t`;
      panel.appendChild(cargoInfo);
    }

    // Separator
    const sep = document.createElement('hr');
    sep.style.cssText = `border: none; border-top: 1px solid ${THEME.border}; margin: 8px 0;`;
    panel.appendChild(sep);

    // Liczba kursów
    const tripsDiv = document.createElement('div');
    tripsDiv.style.cssText = `display: flex; align-items: center; gap: 8px; margin-bottom: 12px; font-size: ${THEME.fontSizeNormal}px;`;
    tripsDiv.innerHTML = `<span style="color:${THEME.textSecondary}">Kursy:</span>`;
    const tripsInput = document.createElement('input');
    tripsInput.type = 'number';
    tripsInput.min = 1;
    tripsInput.max = 999;
    tripsInput.value = 10;
    tripsInput.style.cssText = `
      width: 60px; padding: 3px 6px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
      color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily}; font-size: ${THEME.fontSizeNormal}px;
      text-align: center;
    `;
    tripsDiv.appendChild(tripsInput);
    // Przycisk ∞
    const infBtn = document.createElement('button');
    infBtn.textContent = '∞';
    infBtn.style.cssText = `
      padding: 3px 10px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
      color: ${THEME.accent}; font-family: ${THEME.fontFamily}; cursor: pointer;
    `;
    infBtn.addEventListener('click', () => { tripsInput.value = ''; tripsInput.placeholder = '∞'; });
    tripsDiv.appendChild(infBtn);
    panel.appendChild(tripsDiv);

    // ── Sekcja outbound ─────────────────────────────────────────
    const outLabel = document.createElement('div');
    outLabel.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.accent}; margin-bottom: 6px; font-weight: bold;`;
    outLabel.textContent = `➡ ŁADUNEK (${sourceColony.name} → ${targetName})`;
    panel.appendChild(outLabel);

    const resSys = sourceColony.resourceSystem;
    const inventory = resSys?.inventory ?? new Map();
    const inputs = {};

    const addSection = (label, items) => {
      const filteredItems = items.filter(([id]) => (inventory.get(id) ?? 0) > 0);
      if (filteredItems.length === 0) return;
      const sec = document.createElement('div');
      sec.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textHeader}; margin: 6px 0 4px; text-transform: uppercase; letter-spacing: 1px;`;
      sec.textContent = label;
      panel.appendChild(sec);
      for (const [id] of filteredItems) {
        const have = inventory.get(id) ?? 0;
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

    addSection('Wydobyte', Object.entries(MINED_RESOURCES));
    addSection('Zbierane', Object.entries(HARVESTED_RESOURCES));
    addSection('Towary', Object.entries(COMMODITIES));

    // Pre-deklaracja confirmBtn (potrzebna w sekcji returnCargo do blokady overweight)
    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '🔄 Ustaw trasę';
    confirmBtn.style.cssText = `
      padding: 8px 20px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.borderActive};
      border-radius: 4px; color: ${THEME.accent}; font-family: ${THEME.fontFamily}; cursor: pointer;
    `;

    // ── Sekcja powrotna (returnCargo) ─────────────────────────────
    const returnInputs = {};
    if (targetColony) {
      const sep2 = document.createElement('hr');
      sep2.style.cssText = `border: none; border-top: 1px solid ${THEME.border}; margin: 12px 0;`;
      panel.appendChild(sep2);

      const retTitle = document.createElement('div');
      retTitle.style.cssText = `font-size: ${THEME.fontSizeNormal}px; color: ${THEME.accent}; margin-bottom: 6px; font-weight: bold;`;
      retTitle.textContent = `⬅ POWRÓT (${targetName} → ${sourceColony.name})`;
      panel.appendChild(retTitle);

      // Info o ładowności powrotnej
      let returnCargoInfo = null;
      if (vessel && cargoCapacity > 0) {
        returnCargoInfo = document.createElement('div');
        returnCargoInfo.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textSecondary}; margin-bottom: 8px;`;
        returnCargoInfo.textContent = `Ładowność powrotna: 0 / ${cargoCapacity} t`;
        panel.appendChild(returnCargoInfo);
      }

      const targetInv = targetColony.resourceSystem?.inventory ?? new Map();

      const addReturnSection = (label, items) => {
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
          returnInputs[id] = inp;
          row.appendChild(inp);
          panel.appendChild(row);
        }
      };

      addReturnSection('Wydobyte', Object.entries(MINED_RESOURCES));
      addReturnSection('Zbierane', Object.entries(HARVESTED_RESOURCES));
      addReturnSection('Towary', Object.entries(COMMODITIES));

      // Jeśli cel nie ma zasobów
      if (Object.keys(returnInputs).length === 0) {
        const noRes = document.createElement('div');
        noRes.style.cssText = `font-size: ${THEME.fontSizeSmall}px; color: ${THEME.textDim}; font-style: italic; margin: 4px 0;`;
        noRes.textContent = 'Brak zasobów w kolonii docelowej';
        panel.appendChild(noRes);
      }

      // Aktualizacja wagi powrotnej
      const _updateReturnWeight = () => {
        if (!returnCargoInfo || cargoCapacity <= 0) return;
        let total = 0;
        for (const [, inp] of Object.entries(returnInputs)) {
          total += parseInt(inp.value) || 0;
        }
        const overweight = total > cargoCapacity;
        returnCargoInfo.textContent = `Ładowność powrotna: ${total} / ${cargoCapacity} t`;
        returnCargoInfo.style.color = overweight ? THEME.danger : THEME.textSecondary;
        confirmBtn.disabled = overweight;
        confirmBtn.style.opacity = overweight ? '0.4' : '1';
      };
      for (const inp of Object.values(returnInputs)) {
        inp.addEventListener('input', _updateReturnWeight);
      }
    }

    // Przyciski
    const btns = document.createElement('div');
    btns.style.cssText = 'display: flex; gap: 8px; justify-content: center; margin-top: 16px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.style.cssText = `
      padding: 8px 20px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border};
      border-radius: 4px; color: ${THEME.textSecondary}; font-family: ${THEME.fontFamily}; cursor: pointer;
    `;

    btns.appendChild(confirmBtn);
    btns.appendChild(cancelBtn);
    panel.appendChild(btns);

    // Blokuj propagację kliknięć/mousedown do canvas/window
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

    // Aktualizacja wagi przy zmianie inputów
    const _updateWeight = () => {
      if (!cargoInfo || cargoCapacity <= 0) return;
      let total = 0;
      for (const [, inp] of Object.entries(inputs)) {
        total += parseInt(inp.value) || 0;
      }
      const overweight = total > cargoCapacity;
      cargoInfo.textContent = `${shipDef?.namePL ?? vessel?.shipId ?? ''} — ładowność: ${total} / ${cargoCapacity} t`;
      cargoInfo.style.color = overweight ? THEME.danger : THEME.textSecondary;
      confirmBtn.disabled = overweight;
      confirmBtn.style.opacity = overweight ? '0.4' : '1';
    };
    // Nasłuchuj zmian w inputach
    for (const inp of Object.values(inputs)) {
      inp.addEventListener('input', _updateWeight);
    }

    confirmBtn.addEventListener('click', () => {
      const cargo = {};
      let totalWeight = 0;
      for (const [id, inp] of Object.entries(inputs)) {
        const val = parseInt(inp.value) || 0;
        if (val > 0) { cargo[id] = val; totalWeight += val; }
      }
      // Blokuj jeśli przekroczona ładowność outbound
      if (cargoCapacity > 0 && totalWeight > cargoCapacity) return;

      // Zbierz returnCargo
      const returnCargo = {};
      let returnWeight = 0;
      for (const [id, inp] of Object.entries(returnInputs)) {
        const val = parseInt(inp.value) || 0;
        if (val > 0) { returnCargo[id] = val; returnWeight += val; }
      }
      // Blokuj jeśli przekroczona ładowność powrotna
      if (cargoCapacity > 0 && returnWeight > cargoCapacity) return;

      // Wymaga przynajmniej jednego kierunku z ładunkiem
      if (Object.keys(cargo).length === 0 && Object.keys(returnCargo).length === 0) return;

      const trips = tripsInput.value ? parseInt(tripsInput.value) || null : null;
      close({ cargo, returnCargo, trips });
    });

    cancelBtn.addEventListener('click', () => close(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}
