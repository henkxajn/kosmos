// CargoLoadModal — modal DOM do załadunku/rozładunku cargo na statkach
//
// Gracz wybiera towary z inventory kolonii i ładuje na statek.
// Styl: sci-fi ciemny panel, scrollbar w stylistyce gry, z-index 100.

import { SHIPS } from '../data/ShipsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { loadCargo, unloadCargo } from '../entities/Vessel.js';
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

// Nazwa zasobu z i18n
function _resName(id) {
  const def = MINED_RESOURCES[id] ?? HARVESTED_RESOURCES[id] ?? COMMODITIES[id];
  if (def) return getName({ id, namePL: def.namePL }, def === COMMODITIES[id] ? 'commodity' : 'resource');
  return id;
}

// Styl scrollbara w tematyce gry (wstrzykiwany raz)
let _scrollStyleInjected = false;
function _injectScrollStyle() {
  if (_scrollStyleInjected) return;
  _scrollStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .cargo-modal-scroll::-webkit-scrollbar {
      width: 8px;
    }
    .cargo-modal-scroll::-webkit-scrollbar-track {
      background: ${THEME.bgPrimary};
      border-left: 1px solid ${THEME.border};
    }
    .cargo-modal-scroll::-webkit-scrollbar-thumb {
      background: ${THEME.border};
      border-radius: 4px;
    }
    .cargo-modal-scroll::-webkit-scrollbar-thumb:hover {
      background: ${THEME.accent};
    }
  `;
  document.head.appendChild(style);
}

/**
 * Pokaż modal załadunku cargo na statek.
 * @param {Object} vessel — instancja statku (z Vessel.js)
 * @param {Object} colony — kolonia (z ColonyManager)
 * @returns {Promise<boolean>} — true jeśli dokonano zmian
 */
export function showCargoLoadModal(vessel, colony) {
  return new Promise(resolve => {
    _injectScrollStyle();

    const ship = SHIPS[vessel.shipId];
    const cargoCapacity = ship?.cargoCapacity ?? 0;
    const resSys = colony.resourceSystem;
    const inventory = resSys?.inventory ?? new Map();

    const _ac = hexToRgb(THEME.accent);
    const _bc = hexToRgb(THEME.border);

    // ── Overlay ──────────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(2,4,5,0.75); z-index: 100;
      display: flex; justify-content: center; align-items: center;
    `;

    // ── Panel główny ─────────────────────────────────────────────────────────
    const panel = document.createElement('div');
    panel.style.cssText = `
      background: ${THEME.bgPrimary}; border: 1px solid ${THEME.border};
      border-radius: 4px; width: 440px; max-height: 80vh;
      display: flex; flex-direction: column;
      font-family: ${THEME.fontFamily}; color: ${THEME.textPrimary};
      box-shadow: 0 0 40px rgba(2,4,5,0.88), 0 0 8px rgba(${_ac.r},${_ac.g},${_ac.b},0.15);
    `;

    // ── Nagłówek (fixed) ─────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 12px 16px 8px; border-bottom: 1px solid ${THEME.border};
      flex-shrink: 0;
    `;

    const title = document.createElement('div');
    title.style.cssText = `font-size: 13px; font-weight: bold; text-align: center; color: ${THEME.accent}; letter-spacing: 1px;`;
    title.textContent = t('cargo.title', vessel.name);
    header.appendChild(title);

    const info = document.createElement('div');
    info.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; margin-top: 4px; text-align: center;`;
    info.textContent = t('cargo.shipInfo', getName({ id: vessel.shipId, namePL: ship?.namePL }, 'ship'), cargoCapacity);
    header.appendChild(info);

    // Pasek ładowności (wizualny)
    const barContainer = document.createElement('div');
    barContainer.style.cssText = `margin-top: 6px; height: 14px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border}; border-radius: 2px; position: relative; overflow: hidden;`;
    const barFill = document.createElement('div');
    barFill.style.cssText = `height: 100%; border-radius: 1px; transition: width 0.2s;`;
    barContainer.appendChild(barFill);
    const barLabel = document.createElement('div');
    barLabel.style.cssText = `position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: ${THEME.textPrimary}; text-shadow: 0 0 3px #000;`;
    barContainer.appendChild(barLabel);
    header.appendChild(barContainer);

    panel.appendChild(header);

    let changed = false;

    function updateCargoBar() {
      const used = vessel.cargoUsed ?? 0;
      const frac = cargoCapacity > 0 ? Math.min(1, used / cargoCapacity) : 0;
      barFill.style.width = `${(frac * 100).toFixed(1)}%`;
      barFill.style.background = frac > 0.9 ? THEME.danger : frac > 0.7 ? THEME.yellow : THEME.successDim;
      barLabel.textContent = `${used.toFixed(1)} / ${cargoCapacity} t (${(frac * 100).toFixed(0)}%)`;
    }
    updateCargoBar();

    // ── Scrollowalna treść ───────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'cargo-modal-scroll';
    content.style.cssText = `
      flex: 1; overflow-y: auto; padding: 8px 12px;
      scrollbar-width: thin;
      scrollbar-color: ${THEME.border} ${THEME.bgPrimary};
    `;

    // ── Aktualne cargo statku ────────────────────────────────────────────────
    const cargoSection = document.createElement('div');
    cargoSection.style.cssText = 'margin-bottom: 8px;';

    const cargoHeader = document.createElement('div');
    cargoHeader.style.cssText = `font-size: 10px; color: ${THEME.textDim}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
    cargoHeader.textContent = t('cargo.onBoard');
    cargoSection.appendChild(cargoHeader);

    const cargoList = document.createElement('div');
    cargoSection.appendChild(cargoList);
    content.appendChild(cargoSection);

    function refreshCargoList() {
      cargoList.innerHTML = '';
      const entries = Object.entries(vessel.cargo ?? {}).filter(([, qty]) => qty > 0);
      if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = `font-size: 10px; color: ${THEME.textDim}; padding: 2px 0; font-style: italic;`;
        empty.textContent = t('cargo.empty');
        cargoList.appendChild(empty);
        return;
      }
      for (const [comId, qty] of entries) {
        const w = WEIGHTS[comId] ?? 1;
        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; padding: 2px 4px; margin-bottom: 1px; background: rgba(${_bc.r},${_bc.g},${_bc.b},0.1); border-radius: 2px;`;

        const icon = document.createElement('span');
        icon.style.cssText = 'width: 18px; font-size: 10px; flex-shrink: 0;';
        icon.textContent = RES_ICONS[comId] ?? '?';
        row.appendChild(icon);

        const name = document.createElement('span');
        name.style.cssText = `flex: 1; font-size: 10px; color: ${THEME.textSecondary};`;
        name.textContent = `${_resName(comId)} ×${qty} (${(qty * w).toFixed(1)}t)`;
        row.appendChild(name);

        const btnUnload = _makeBtn(t('cargo.unload'), THEME.yellow, () => {
          const actual = unloadCargo(vessel, comId, qty, resSys);
          if (actual > 0) { changed = true; updateCargoBar(); refreshCargoList(); refreshLoadSection(); }
        });
        row.appendChild(btnUnload);
        cargoList.appendChild(row);
      }
    }
    refreshCargoList();

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = `height: 1px; background: ${THEME.border}; margin: 6px 0;`;
    content.appendChild(sep);

    // ── Załaduj z inventory ───────────────────────────────────────────────────
    const loadHeader = document.createElement('div');
    loadHeader.style.cssText = `font-size: 10px; color: ${THEME.textDim}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
    loadHeader.textContent = t('cargo.loadFrom');
    content.appendChild(loadHeader);

    const loadSection = document.createElement('div');
    content.appendChild(loadSection);

    function refreshLoadSection() {
      loadSection.innerHTML = '';

      const addGroup = (label, defs) => {
        const items = Object.entries(defs).filter(([id]) => {
          const avail = Math.floor(inventory.get(id) ?? 0);
          return avail > 0;
        });
        if (items.length === 0) return;

        const groupHeader = document.createElement('div');
        groupHeader.style.cssText = `font-size: 9px; color: ${THEME.accent}; margin: 6px 0 2px; font-weight: bold; opacity: 0.7;`;
        groupHeader.textContent = label;
        loadSection.appendChild(groupHeader);

        for (const [id, def] of items) {
          const avail = Math.floor(inventory.get(id) ?? 0);
          const w = WEIGHTS[id] ?? 1;
          const freeSpace = cargoCapacity - (vessel.cargoUsed ?? 0);
          const maxBySpace = Math.floor(freeSpace / w);
          const canLoad = Math.min(avail, maxBySpace);

          const row = document.createElement('div');
          row.style.cssText = `
            display: flex; align-items: center; padding: 2px 4px; margin-bottom: 1px;
            background: rgba(${_bc.r},${_bc.g},${_bc.b},0.06); border-radius: 2px;
          `;

          const icon = document.createElement('span');
          icon.style.cssText = 'width: 18px; font-size: 10px; flex-shrink: 0;';
          icon.textContent = RES_ICONS[id] ?? '?';
          row.appendChild(icon);

          const name = document.createElement('span');
          name.style.cssText = `flex: 1; font-size: 10px; color: ${THEME.textSecondary}; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
          name.textContent = _resName(id);
          row.appendChild(name);

          const availSpan = document.createElement('span');
          availSpan.style.cssText = `font-size: 9px; color: ${THEME.textDim}; margin: 0 4px; white-space: nowrap; flex-shrink: 0;`;
          availSpan.textContent = `${avail}× ${w}t`;
          row.appendChild(availSpan);

          // Przyciski +1, +10, MAX
          const doLoad = (qty) => {
            const actual = loadCargo(vessel, id, qty, resSys);
            if (actual > 0) { changed = true; updateCargoBar(); refreshCargoList(); refreshLoadSection(); }
          };

          const btn1 = _makeBtn('+1', THEME.successDim, () => doLoad(1));
          const btn10 = _makeBtn('+10', THEME.successDim, () => doLoad(10));
          const btnMax = _makeBtn('MAX', THEME.accent, () => doLoad(canLoad));
          row.appendChild(btn1);
          row.appendChild(btn10);
          row.appendChild(btnMax);

          if (canLoad <= 0) {
            for (const b of [btn1, btn10, btnMax]) { b.disabled = true; b.style.opacity = '0.3'; b.style.cursor = 'default'; }
          }

          loadSection.appendChild(row);
        }
      };

      addGroup(t('cargo.goods'), COMMODITIES);
      addGroup(t('cargo.rawMaterials'), MINED_RESOURCES);
      addGroup(t('cargo.harvested'), HARVESTED_RESOURCES);
    }
    refreshLoadSection();

    panel.appendChild(content);

    // ── Stopka (fixed) ───────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px 16px; border-top: 1px solid ${THEME.border};
      display: flex; justify-content: center; flex-shrink: 0;
    `;

    const btnClose = _makeBtn(t('ui.close'), THEME.accent, () => close(), true);
    btnClose.style.cssText += `padding: 4px 28px; font-size: 11px; letter-spacing: 1px;`;
    footer.appendChild(btnClose);
    panel.appendChild(footer);

    // Blokuj propagację kliknięć/mousedown do canvas/window
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // Klik poza panel = zamknij
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Scroll na panelu działa domyślnie (overflow-y: auto na content div)

    // Escape
    const onKey = (e) => {
      if (e.code === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey);

    function close() {
      document.removeEventListener('keydown', onKey);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      resolve(changed);
    }
  });
}

// ── Helper: przycisk w stylistyce gry ────────────────────────────────────────
function _makeBtn(text, color, onClick, large = false) {
  const btn = document.createElement('button');
  const c = hexToRgb(color);
  btn.style.cssText = `
    background: rgba(${c.r},${c.g},${c.b},0.12);
    border: 1px solid rgba(${c.r},${c.g},${c.b},0.5);
    color: ${color}; cursor: pointer;
    font-family: ${THEME.fontFamily};
    font-size: ${large ? '11' : '9'}px;
    padding: ${large ? '3px 12px' : '1px 5px'};
    border-radius: 2px; margin-left: 2px;
    transition: background 0.15s;
    flex-shrink: 0;
  `;
  btn.onmouseenter = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.3)`; };
  btn.onmouseleave = () => { btn.style.background = `rgba(${c.r},${c.g},${c.b},0.12)`; };
  btn.onclick = onClick;
  btn.textContent = text;
  return btn;
}
