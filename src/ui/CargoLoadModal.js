// CargoLoadModal — modal DOM do załadunku/rozładunku cargo na statkach
//
// Gracz wybiera towary z inventory kolonii i ładuje na statek.
// Styl: sci-fi ciemny panel, scrollbar w stylistyce gry, z-index 100.

import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { loadCargo, unloadCargo, loadGroundUnit, unloadGroundUnit, loadOrbitalShells } from '../entities/Vessel.js';
import { UNIT_ARCHETYPES, getTransportSize } from '../data/unitArchetypes.js';
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
 * @param {Object} [options]
 * @param {boolean} [options.showRepeatCheckbox=false] — pokaż checkbox „Powtarzaj misję (pętla)"
 * @param {boolean} [options.initialRepeat=false] — stan początkowy checkboxa
 * @param {boolean} [options.troopsOnly=false] — pokaż TYLKO sekcję Wojsko (ukryj cargo/surowce/orbital)
 * @returns {Promise<{changed:boolean, repeat:boolean}>}
 */
export function showCargoLoadModal(vessel, colony, options = {}) {
  const showRepeatCheckbox = !!options.showRepeatCheckbox;
  const troopsOnly = !!options.troopsOnly;

  return new Promise(resolve => {
    _injectScrollStyle();

    const ship = SHIPS[vessel.shipId] ?? HULLS[vessel.shipId];
    const cargoCapacity = vessel.cargoMax ?? ship?.cargoCapacity ?? 0;
    const resSys = colony?.resourceSystem ?? null;
    const inventory = resSys?.inventory ?? new Map();

    let repeatChecked = !!options.initialRepeat;
    let changed = false;

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
    title.textContent = troopsOnly ? `⚔ ZAŁADUNEK WOJSK — ${vessel.name}` : t('cargo.title', vessel.name);
    header.appendChild(title);

    const info = document.createElement('div');
    info.style.cssText = `font-size: 10px; color: ${THEME.textSecondary}; margin-top: 4px; text-align: center;`;
    if (troopsOnly) {
      const cap = vessel.troopCapacity ?? 0;
      const used = vessel.troopBayUsed ?? 0;
      const planetName = colony?.name ?? '???';
      info.innerHTML = `Ładownia desantowa — ${used}/${cap} pkt<br>` +
        `<span style="color:${THEME.textDim}; font-size:9px">Jednostki z planety: <b>${planetName}</b></span>`;
    } else {
      info.textContent = t('cargo.shipInfo', getName({ id: vessel.shipId, namePL: ship?.namePL }, 'ship'), cargoCapacity);
    }
    header.appendChild(info);

    // Pasek ładowności (wizualny) — tylko dla trybu cargo; w trybie troops pomiń
    const barContainer = document.createElement('div');
    const barFill = document.createElement('div');
    const barLabel = document.createElement('div');
    if (!troopsOnly) {
      barContainer.style.cssText = `margin-top: 6px; height: 14px; background: ${THEME.bgTertiary}; border: 1px solid ${THEME.border}; border-radius: 2px; position: relative; overflow: hidden;`;
      barFill.style.cssText = `height: 100%; border-radius: 1px; transition: width 0.2s;`;
      barContainer.appendChild(barFill);
      barLabel.style.cssText = `position: absolute; top: 0; left: 0; right: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font-size: 9px; color: ${THEME.textPrimary}; text-shadow: 0 0 3px #000;`;
      barContainer.appendChild(barLabel);
      header.appendChild(barContainer);
    }

    panel.appendChild(header);

    function updateCargoBar() {
      if (troopsOnly) return;  // brak paska w trybie troops
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

    // ── Aktualne cargo statku (ukryte w trybie troopsOnly) ──────────────────
    const cargoSection = document.createElement('div');
    cargoSection.style.cssText = 'margin-bottom: 8px;';

    const cargoHeader = document.createElement('div');
    cargoHeader.style.cssText = `font-size: 10px; color: ${THEME.textDim}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
    cargoHeader.textContent = t('cargo.onBoard');
    cargoSection.appendChild(cargoHeader);

    const cargoList = document.createElement('div');
    cargoSection.appendChild(cargoList);
    if (!troopsOnly) content.appendChild(cargoSection);

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
    if (!troopsOnly) content.appendChild(sep);

    // ── Załaduj z inventory ───────────────────────────────────────────────────
    const loadHeader = document.createElement('div');
    loadHeader.style.cssText = `font-size: 10px; color: ${THEME.textDim}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
    loadHeader.textContent = t('cargo.loadFrom');
    if (!troopsOnly) content.appendChild(loadHeader);

    const loadSection = document.createElement('div');
    if (!troopsOnly) content.appendChild(loadSection);

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

    // ── Sekcja Wojsko (tylko gdy statek ma troop_bay) ────────────────────────
    const troopSection = document.createElement('div');
    troopSection.style.cssText = 'margin-top: 10px;';
    if ((vessel.troopCapacity ?? 0) > 0) {
      const troopSep = document.createElement('div');
      troopSep.style.cssText = `height: 1px; background: ${THEME.border}; margin: 6px 0;`;
      // W trybie troopsOnly separator nad sekcją Wojsko jest zbędny
      if (!troopsOnly) content.appendChild(troopSep);

      const troopHeader = document.createElement('div');
      troopHeader.style.cssText = `font-size: 10px; color: ${THEME.accent}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
      content.appendChild(troopHeader);

      const loadedList = document.createElement('div');
      loadedList.style.cssText = 'margin-bottom: 6px;';
      content.appendChild(loadedList);

      const garrisonHeader = document.createElement('div');
      garrisonHeader.style.cssText = `font-size: 9px; color: ${THEME.textDim}; margin: 6px 0 2px; font-weight: bold; opacity: 0.7;`;
      garrisonHeader.textContent = '🪖 Garnizon planety:';
      content.appendChild(garrisonHeader);

      const garrisonList = document.createElement('div');
      content.appendChild(garrisonList);

      function _unitRow(unit, action) {
        const arc = UNIT_ARCHETYPES[unit.archetypeId];
        const name = arc?.descriptionPL?.split('.')[0] ?? unit.archetypeId;
        const size = getTransportSize(unit.archetypeId);
        const hp = Math.round(unit.hp ?? 0);
        const maxHp = arc?.baseStats?.hp ?? hp;

        const row = document.createElement('div');
        row.style.cssText = `display: flex; align-items: center; padding: 2px 4px; margin-bottom: 1px; background: rgba(${_bc.r},${_bc.g},${_bc.b},0.08); border-radius: 2px;`;

        const icon = document.createElement('span');
        icon.style.cssText = 'width: 18px; font-size: 10px; flex-shrink: 0;';
        icon.textContent = '🪖';
        row.appendChild(icon);

        const nameEl = document.createElement('span');
        nameEl.style.cssText = `flex: 1; font-size: 10px; color: ${THEME.textSecondary}; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
        nameEl.textContent = `${name} (${hp}/${maxHp} HP)`;
        row.appendChild(nameEl);

        const sizeSpan = document.createElement('span');
        sizeSpan.style.cssText = `font-size: 9px; color: ${THEME.textDim}; margin: 0 4px; white-space: nowrap; flex-shrink: 0;`;
        sizeSpan.textContent = `${size} pkt`;
        row.appendChild(sizeSpan);

        row.appendChild(action);
        return row;
      }

      function refreshTroopSection() {
        const cap = vessel.troopCapacity ?? 0;
        const used = vessel.troopBayUsed ?? 0;
        troopHeader.textContent = `⚔ TRANSPORT WOJSK — ${used}/${cap} pkt ${vessel.canDropTroops ? '🛩' : '(bez kapsuł desantowych)'}`;

        // Załadowane
        loadedList.innerHTML = '';
        const gum = window.KOSMOS?.groundUnitManager;
        // Self-heal: prune stale IDs (jednostki usunięte z GroundUnitManager)
        // oraz przelicz troopBayUsed aby zgadzał się z rzeczywistą zawartością ładowni.
        if (Array.isArray(vessel.groundUnits) && gum) {
          const alive = vessel.groundUnits.filter(id => gum.getUnit(id));
          if (alive.length !== vessel.groundUnits.length) {
            vessel.groundUnits = alive;
            let usedRecalc = 0;
            for (const id of alive) {
              const u = gum.getUnit(id);
              usedRecalc += getTransportSize(u?.archetypeId) ?? 0;
            }
            vessel.troopBayUsed = usedRecalc;
            changed = true;
          }
        }
        if ((vessel.groundUnits ?? []).length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = `font-size: 10px; color: ${THEME.textDim}; padding: 2px 0; font-style: italic;`;
          empty.textContent = '(ładownia pusta)';
          loadedList.appendChild(empty);
        } else {
          for (const unitId of vessel.groundUnits) {
            const unit = gum?.getUnit(unitId);
            if (!unit) continue;
            const btnUnload = _makeBtn('Wyładuj', THEME.yellow, () => {
              const planetId = colony?.planetId ?? vessel.colonyId;
              unloadGroundUnit(vessel, unit, planetId, unit.q ?? 0, unit.r ?? 0);
              changed = true;
              refreshTroopSection();
            });
            loadedList.appendChild(_unitRow(unit, btnUnload));
          }
        }

        // Garnizon planety (tylko player units, żywe, nie już w tym statku)
        garrisonList.innerHTML = '';
        const planetId = colony?.planetId ?? vessel.colonyId;
        const garrisonUnits = gum?.getUnitsOnPlanet?.(planetId) ?? [];
        const eligible = garrisonUnits.filter(u =>
          (u.owner == null || u.owner === 'player') &&
          u.hp > 0 &&
          u.status !== 'in_cargo' &&                                    // nie w innym statku
          u.transportStatus !== 'loaded' &&                             // ani nie załadowana w innym
          !vessel.groundUnits?.includes(u.id)                           // nie w tym statku
        );

        if (eligible.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = `font-size: 10px; color: ${THEME.textDim}; padding: 4px 6px; font-style: italic; line-height: 1.5;`;
          const planetName = colony?.name ?? '???';
          empty.innerHTML = `Brak jednostek na <b>${planetName}</b>.<br>` +
            `<span style="font-size:9px">Aby załadować z innej planety, przesuń tam statek (orbit lub hangar).</span>`;
          garrisonList.appendChild(empty);
        } else {
          for (const unit of eligible) {
            const size = getTransportSize(unit.archetypeId);
            const canFit = (used + size) <= cap;
            const btnLoad = _makeBtn('Załaduj', canFit ? THEME.successDim : THEME.border, () => {
              if (!canFit) return;
              const res = loadGroundUnit(vessel, unit);
              if (res?.ok) { changed = true; refreshTroopSection(); }
            });
            if (!canFit) {
              btnLoad.disabled = true;
              btnLoad.style.opacity = '0.3';
              btnLoad.style.cursor = 'default';
            }
            garrisonList.appendChild(_unitRow(unit, btnLoad));
          }
        }
      }
      refreshTroopSection();
    }

    // ── Sekcja Orbital Strike (tylko gdy statek ma baterię) ──────────────────
    // W trybie troopsOnly ukrywamy — to osobna mechanika, nie "wojsko".
    if (vessel.orbitalStrike && !troopsOnly) {
      const osSep = document.createElement('div');
      osSep.style.cssText = `height: 1px; background: ${THEME.border}; margin: 6px 0;`;
      content.appendChild(osSep);

      const osHeader = document.createElement('div');
      osHeader.style.cssText = `font-size: 10px; color: ${THEME.accent}; margin-bottom: 4px; font-weight: bold; letter-spacing: 0.5px;`;
      content.appendChild(osHeader);

      const osRow = document.createElement('div');
      osRow.style.cssText = `display: flex; align-items: center; padding: 2px 4px; background: rgba(${_bc.r},${_bc.g},${_bc.b},0.08); border-radius: 2px;`;
      content.appendChild(osRow);

      const osIcon = document.createElement('span');
      osIcon.style.cssText = 'width: 18px; font-size: 10px; flex-shrink: 0;';
      osIcon.textContent = '💥';
      osRow.appendChild(osIcon);

      const osName = document.createElement('span');
      osName.style.cssText = `flex: 1; font-size: 10px; color: ${THEME.textSecondary};`;
      osName.textContent = 'Pociski Orbitalne';
      osRow.appendChild(osName);

      const doLoadShells = (qty) => {
        const actual = loadOrbitalShells(vessel, qty, resSys);
        if (actual > 0) { changed = true; refreshOrbitalStrike(); }
      };
      const osBtn1 = _makeBtn('+1', THEME.successDim, () => doLoadShells(1));
      const osBtn5 = _makeBtn('+5', THEME.successDim, () => doLoadShells(5));
      const osBtnMax = _makeBtn('MAX', THEME.accent, () => doLoadShells(vessel.orbitalStrike.ammoCapacity ?? 10));
      osRow.appendChild(osBtn1);
      osRow.appendChild(osBtn5);
      osRow.appendChild(osBtnMax);

      function refreshOrbitalStrike() {
        const os = vessel.orbitalStrike;
        osHeader.textContent = `💥 BATERIA ORBITALNA — ${os.ammoCurrent ?? 0}/${os.ammoCapacity ?? 10} pocisków (${os.damage ?? 20} dmg)`;
        const avail = Math.floor(inventory.get('orbital_shells') ?? 0);
        const space = (os.ammoCapacity ?? 10) - (os.ammoCurrent ?? 0);
        const canLoad = Math.min(avail, space);
        for (const b of [osBtn1, osBtn5, osBtnMax]) {
          const disable = canLoad <= 0;
          b.disabled = disable;
          b.style.opacity = disable ? '0.3' : '1';
          b.style.cursor = disable ? 'default' : 'pointer';
        }
      }
      refreshOrbitalStrike();
    }

    panel.appendChild(content);

    // ── Stopka (fixed) ───────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 8px 16px; border-top: 1px solid ${THEME.border};
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; gap: 12px;
    `;

    // Opcjonalnie: checkbox „🔁 Powtarzaj misję (pętla)"
    const loopWrap = document.createElement('label');
    if (showRepeatCheckbox) {
      loopWrap.style.cssText = `display: flex; align-items: center; gap: 6px; color: ${THEME.textSecondary}; font-size: 10px; cursor: pointer; user-select: none;`;
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = repeatChecked;
      cb.style.cssText = `accent-color: ${THEME.accent}; cursor: pointer;`;
      cb.addEventListener('change', () => { repeatChecked = cb.checked; });
      loopWrap.appendChild(cb);
      const lbl = document.createElement('span');
      lbl.textContent = t('transport.loopCheckbox');
      lbl.title = t('transport.loopExplain');
      loopWrap.appendChild(lbl);
    } else {
      loopWrap.style.cssText = 'flex: 0;';
    }
    footer.appendChild(loopWrap);

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
      resolve({ changed, repeat: repeatChecked });
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
