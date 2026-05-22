// ShipPickerModal — modal DOM do wyboru statku do skoku międzygwiezdnego
//
// Gracz klika "Wyślij statek" na mapie galaktycznej → otwiera się modal
// z listą wszystkich dostępnych statków warpowych, każdy z info o paliwie,
// koszcie skoku i statusie. Klik wiersza = wybór tego statku.
//
// Zwraca Promise<vesselId|null> — id wybranego statku lub null (anulowano).

import { THEME, hexToRgb } from '../config/ThemeConfig.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipStats } from '../data/ShipModulesData.js';
import { t, getName } from '../i18n/i18n.js';

// Wstrzyknij styl scrollbara raz
let _scrollStyleInjected = false;
function _injectScrollStyle() {
  if (_scrollStyleInjected) return;
  _scrollStyleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ship-picker-scroll::-webkit-scrollbar { width: 8px; }
    .ship-picker-scroll::-webkit-scrollbar-track {
      background: ${THEME.bgPrimary};
      border-left: 1px solid ${THEME.border};
    }
    .ship-picker-scroll::-webkit-scrollbar-thumb {
      background: ${THEME.border};
      border-radius: 4px;
    }
    .ship-picker-scroll::-webkit-scrollbar-thumb:hover {
      background: ${THEME.accent};
    }
  `;
  document.head.appendChild(style);
}

/**
 * Pokaż modal wyboru statku do skoku.
 * @param {Object[]} ships — lista dostępnych statków warpowych
 * @param {Object}   targetStar — gwiazda docelowa (z galaxyData)
 * @returns {Promise<string|null>} — vesselId lub null
 */
export function showShipPickerModal(ships, targetStar) {
  return new Promise((resolve) => {
    _injectScrollStyle();

    // ── Wylicz koszt paliwa per statek ─────────────────────────
    const gd = window.KOSMOS?.galaxyData;
    const rows = ships.map(v => {
      const fromStar = gd?.systems?.find(s => s.id === (v.systemId ?? 'sys_home'));
      let distLY = 0, fuelCost = 0;
      if (fromStar) {
        const dx = targetStar.x - fromStar.x;
        const dy = targetStar.y - fromStar.y;
        const dz = (targetStar.z ?? 0) - (fromStar.z ?? 0);
        distLY = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
      const shipDef = SHIPS[v.shipId] ?? HULLS[v.shipId];
      const fuelPerLY = shipDef?.fuelPerLY ?? 0.5;
      fuelCost = distLY * fuelPerLY;
      const hasFuel = (v.fuel?.current ?? 0) >= fuelCost;
      return { v, shipDef, distLY, fuelCost, hasFuel, fromName: fromStar?.name ?? '?' };
    });

    // Sortuj: te które dolecą najpierw, potem po nazwie
    rows.sort((a, b) => {
      if (a.hasFuel !== b.hasFuel) return a.hasFuel ? -1 : 1;
      return (a.v.name ?? '').localeCompare(b.v.name ?? '');
    });

    // ── Dimming overlay ───────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.className = 'kosmos-modal-overlay';
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0',
      background: 'rgba(2,4,5,0.75)',
      zIndex: '100',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: THEME.fontFamily,
    });

    // ── Panel ─────────────────────────────────────────────────
    const panel = document.createElement('div');
    Object.assign(panel.style, {
      background: THEME.bgSecondary,
      border: `1px solid ${THEME.border}`,
      borderRadius: '6px',
      boxShadow: (() => { const c = hexToRgb(THEME.borderActive); return `0 0 30px rgba(${c.r},${c.g},${c.b},0.3)`; })(),
      padding: '18px 22px',
      width: '480px',
      maxHeight: '70vh',
      display: 'flex', flexDirection: 'column',
    });

    // ── Tytuł ─────────────────────────────────────────────────
    const title = document.createElement('div');
    title.textContent = t('shipPicker.title');
    Object.assign(title.style, {
      color: THEME.accent,
      fontSize: `${THEME.fontSizeLarge}px`,
      marginBottom: '4px',
      letterSpacing: '1px',
    });
    panel.appendChild(title);

    // Cel skoku
    const subtitle = document.createElement('div');
    subtitle.textContent = `→ ⭐ ${targetStar.name}`;
    Object.assign(subtitle.style, {
      color: THEME.textSecondary,
      fontSize: `${THEME.fontSizeSmall}px`,
      marginBottom: '14px',
    });
    panel.appendChild(subtitle);

    // ── Lista statków ─────────────────────────────────────────
    const list = document.createElement('div');
    list.className = 'ship-picker-scroll';
    Object.assign(list.style, {
      overflowY: 'auto',
      maxHeight: '50vh',
      border: `1px solid ${THEME.border}`,
      borderRadius: '4px',
      background: THEME.bgPrimary,
      marginBottom: '14px',
    });
    panel.appendChild(list);

    if (rows.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = t('galaxy.noWarpShips');
      Object.assign(empty.style, {
        padding: '24px',
        textAlign: 'center',
        color: THEME.textDim,
        fontSize: `${THEME.fontSizeSmall}px`,
      });
      list.appendChild(empty);
    }

    let selectedId = null;
    let okBtn; // wypełnione poniżej

    rows.forEach((row, idx) => {
      const { v, shipDef, distLY, fuelCost, hasFuel, fromName } = row;
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '10px 14px',
        borderBottom: idx < rows.length - 1 ? `1px solid ${THEME.border}` : 'none',
        cursor: hasFuel ? 'pointer' : 'not-allowed',
        opacity: hasFuel ? '1' : '0.55',
        display: 'flex', flexDirection: 'column', gap: '3px',
        transition: 'background 0.1s',
      });

      // Wiersz 1: ikona + nazwa + typ
      const row1 = document.createElement('div');
      Object.assign(row1.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
      const name = document.createElement('span');
      const shipName = shipDef ? getName({ id: v.shipId, namePL: shipDef.namePL }, 'ship') : v.shipId;
      name.textContent = `${hasFuel ? '🚀' : '⚠'} ${v.name ?? v.id}`;
      Object.assign(name.style, {
        color: hasFuel ? THEME.textPrimary : THEME.warning,
        fontSize: `${THEME.fontSizeNormal}px`,
        fontWeight: 'bold',
      });
      const type = document.createElement('span');
      type.textContent = shipName;
      Object.assign(type.style, {
        color: THEME.textDim,
        fontSize: `${THEME.fontSizeSmall - 1}px`,
      });
      row1.appendChild(name);
      row1.appendChild(type);
      item.appendChild(row1);

      // Wiersz 2: dane techniczne
      const row2 = document.createElement('div');
      Object.assign(row2.style, {
        display: 'flex', gap: '14px',
        fontSize: `${THEME.fontSizeSmall}px`,
        color: THEME.textSecondary,
      });
      const fuelTxt = document.createElement('span');
      const fuelColor = hasFuel ? THEME.success : THEME.warning;
      fuelTxt.innerHTML = `${t('shipPicker.fuel')}: <span style="color:${fuelColor}">${(v.fuel?.current ?? 0).toFixed(1)}/${(v.fuel?.max ?? 0).toFixed(0)}</span>`;
      const distTxt = document.createElement('span');
      distTxt.textContent = `${t('shipPicker.dist')}: ${distLY.toFixed(1)} ly`;
      const costTxt = document.createElement('span');
      costTxt.innerHTML = `${t('shipPicker.cost')}: <span style="color:${fuelColor}">${fuelCost.toFixed(1)}</span>`;
      const fromTxt = document.createElement('span');
      fromTxt.textContent = `${t('shipPicker.from')}: ${fromName}`;
      row2.appendChild(fromTxt);
      row2.appendChild(fuelTxt);
      row2.appendChild(distTxt);
      row2.appendChild(costTxt);
      item.appendChild(row2);

      // Hover + click
      if (hasFuel) {
        item.addEventListener('mouseenter', () => {
          if (selectedId !== v.id) item.style.background = 'rgba(255,255,255,0.04)';
        });
        item.addEventListener('mouseleave', () => {
          if (selectedId !== v.id) item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
          // Highlight selekcji
          for (const child of list.children) child.style.background = 'transparent';
          selectedId = v.id;
          const c = hexToRgb(THEME.accent);
          item.style.background = `rgba(${c.r},${c.g},${c.b},0.15)`;
          item.style.borderLeft = `3px solid ${THEME.accent}`;
          if (okBtn) okBtn.disabled = false;
          if (okBtn) {
            okBtn.style.opacity = '1';
            okBtn.style.cursor = 'pointer';
          }
        });
      } else {
        // Tooltip: brakujące paliwo
        const shortfall = fuelCost - (v.fuel?.current ?? 0);
        item.title = t('shipPicker.shortFuel', shortfall.toFixed(1));
      }

      list.appendChild(item);
    });

    // ── Przyciski ─────────────────────────────────────────────
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex', justifyContent: 'flex-end', gap: '10px',
    });

    const makeBtn = (label, borderColor, textColor) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        background: 'transparent',
        border: `1px solid ${borderColor}`,
        borderRadius: '3px',
        color: textColor,
        fontFamily: THEME.fontFamily,
        fontSize: `${THEME.fontSizeNormal + 1}px`,
        padding: '6px 18px',
        cursor: 'pointer',
        letterSpacing: '0.5px',
      });
      btn.addEventListener('mouseenter', () => {
        if (!btn.disabled) btn.style.background = 'rgba(255,255,255,0.05)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'transparent';
      });
      return btn;
    };

    const btnCancel = makeBtn(t('ui.cancel'), THEME.textDim, THEME.textSecondary);
    okBtn = makeBtn(t('shipPicker.dispatch'), THEME.successDim, THEME.success);
    okBtn.disabled = true;
    okBtn.style.opacity = '0.5';
    okBtn.style.cursor = 'not-allowed';

    btnRow.appendChild(btnCancel);
    btnRow.appendChild(okBtn);
    panel.appendChild(btnRow);

    // ── Blokuj propagację ────────────────────────────────────
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      panel.addEventListener(evt, (e) => e.stopPropagation());
      overlay.addEventListener(evt, (e) => e.stopPropagation());
    }
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    // ── Cleanup ───────────────────────────────────────────────
    const cleanup = () => {
      if (overlay.parentNode) document.body.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
    };
    const submit = () => {
      if (!selectedId) return;
      cleanup();
      resolve(selectedId);
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener('click', submit);
    btnCancel.addEventListener('click', cancel);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && selectedId) { e.preventDefault(); e.stopPropagation(); submit(); }
    };
    document.addEventListener('keydown', onKey, true);
  });
}
