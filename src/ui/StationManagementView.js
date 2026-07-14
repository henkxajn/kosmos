// StationManagementView — ekran zarządzania stacją orbitalną (S3.4 FAZA 3).
// Wołany z ColonyOverlay w TRYBIE STACJI (ColonyOverlay._stationMode) zamiast mapy hex — osobny plik,
// żeby nie puchł główny overlay (wzór planu 3.2). Rysowanie + rejestracja hit-zon przez callback addHit
// (ColonyOverlay._addHit); cała logika interakcji wraca do ColonyOverlay._onHit (typy 'station_mgmt_*').
//
// NIE woła switchActiveColony ani żadnej mutacji stanu gry — tylko rysuje bieżący snapshot encji stacji
// (Station) + jej depotu i deleguje akcje przez StationSystem intent methods (addPendingModuleOrder itd.).
// Statusy modułów (active/no_power/no_crew) i postęp zmieniają się PER TICK (StationSystem._tick) — widok
// jest bezstanowy, odświeżany przez dirty-loop UIManagera + subskrypcje station:* w ColonyOverlay.

import { THEME } from '../config/ThemeConfig.js';
import { t, getLocale } from '../i18n/i18n.js';
import { STATION_MODULES, stationModuleCost } from '../data/StationModuleData.js';
import { STATIONS } from '../data/StationData.js';
import { SHIPS } from '../data/ShipsData.js';
import { HULLS } from '../data/HullsData.js';
import { calcShipCost } from '../data/ShipModulesData.js';
import { classifyStationDepot } from './StationPanelLogic.js';

// Nazwa modułu wg locale (dane są dwujęzyczne w StationModuleData — bez duplikacji w i18n).
function moduleName(def) {
  return (getLocale() === 'en' ? def.nameEN : def.namePL) ?? def.id;
}

// Bilans energii/pracy z AKTYWNYCH modułów (mirror StationSystem._recomputeModuleStates, tylko odczyt).
function computeBalance(station) {
  let prod = 0, cons = 0, crew = 0;
  for (const m of station.modules) {
    if (m.active === false) continue;
    const def = STATION_MODULES[m.moduleType];
    if (!def) continue;
    const e = def.energy ?? 0;
    if (e > 0) prod += e; else cons += -e;
    crew += def.popWork ?? 0;
  }
  return { prod, cons, net: prod - cons, crew };
}

// Krótka etykieta statusu modułu + kolor.
function moduleStatus(m) {
  if (m.active !== false) return { label: '✓', color: THEME.success };
  if (m.inactiveReason === 'no_power') return { label: '⚡✗', color: THEME.warning };
  if (m.inactiveReason === 'no_crew')  return { label: '👥✗', color: THEME.info ?? '#88bbff' };
  return { label: '✗', color: THEME.danger };
}

/**
 * Rysuj ekran zarządzania stacją.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number,h:number}} area — obszar pod nagłówkiem overlayu
 * @param {import('../entities/Station.js').Station} station
 * @param {{ addHit:Function, techIsResearched:Function, pickerOpen:boolean, hoverType?:string }} view
 */
export function drawStationManagement(ctx, area, station, view) {
  const { x, y, w, h } = area;
  const { addHit, techIsResearched, pickerOpen, shipPickerOpen } = view;
  // B2 fix: gdy picker (modułów LUB statków) otwarty, ekran bazowy NIE rejestruje hit-zon — inaczej
  // bazowe strefy (dodane wcześniej) wygrywają z _hitTest=find() nad ✕/Buduj pickera (z-order bug).
  const modal = pickerOpen || shipPickerOpen;
  const bhit = modal ? (() => {}) : addHit;
  const PAD = 12;
  const maxModules = STATIONS[station.stationType]?.maxModules ?? 8;

  // ── NAGŁÓWEK ────────────────────────────────────────────────────────────────
  const bal = computeBalance(station);
  const availCrew = Math.max(station.pop ?? 0, station.popCapacity);
  let cy = y + PAD;

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.font = `bold 16px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.accent;
  ctx.fillText(`🛰 ${station.name ?? station.id}`, x + PAD, cy + 14);
  // ✏ rename
  const renW = 22, renX = x + PAD + ctx.measureText(`🛰 ${station.name ?? station.id}`).width + 10;
  ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
  ctx.strokeRect(renX + 0.5, cy + 0.5, renW, 18);
  ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.textSecondary;
  ctx.textAlign = 'center';
  ctx.fillText('✏', renX + renW / 2, cy + 13);
  ctx.textAlign = 'left';
  bhit(renX, cy, renW, 18, 'station_mgmt_rename', {});
  cy += 26;

  // Pasek statystyk
  const shipyardOn = station.hasActiveShipyard;
  ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  const stats = [
    { txt: `👥 ${t('station.mgmt.crew')}: ${station.pop ?? 0}/${station.popCapacity} (${t('station.mgmt.avail')} ${availCrew})`, color: THEME.textSecondary },
    { txt: `⚡ +${bal.prod} / -${bal.cons} (${t('station.mgmt.net')} ${bal.net >= 0 ? '+' : ''}${bal.net})`, color: bal.net >= 0 ? THEME.success : THEME.danger },
    { txt: `🛠 ${t('station.mgmt.shipyard')}: ${shipyardOn ? t('station.mgmt.on') : t('station.mgmt.off')}`, color: shipyardOn ? THEME.success : THEME.textDim },
    { txt: `💱 ${t('station.mgmt.tradeCap')}: ${station.tradeCapacity}`, color: THEME.textSecondary },
  ];
  let sx = x + PAD;
  for (const s of stats) {
    ctx.fillStyle = s.color;
    ctx.fillText(s.txt, sx, cy + 11);
    sx += ctx.measureText(s.txt).width + 22;
  }
  cy += 24;

  ctx.strokeStyle = THEME.border;
  ctx.beginPath(); ctx.moveTo(x + PAD, cy); ctx.lineTo(x + w - PAD, cy); ctx.stroke();
  cy += 10;

  // ── LEWA KOLUMNA: siatka slotów + kolejka stoczni ; PRAWA: depot ─────────────
  const rightW = Math.min(280, Math.floor(w * 0.34));
  const leftW = w - rightW - PAD * 3;
  const leftX = x + PAD;
  const rightX = x + w - rightW - PAD;
  const gridTop = cy;

  // Tytuł siatki
  ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.textHeader;
  ctx.fillText(`${t('station.mgmt.slots')} (${station.modules.length + station.pendingModuleOrders.length}/${maxModules})`, leftX, cy + 12);
  cy += 22;

  // Sloty: 2 kolumny (szerokie karty). Zbierz: moduły + pending + puste do maxModules.
  const slots = [];
  for (const m of station.modules) slots.push({ kind: 'module', m });
  for (const o of station.pendingModuleOrders) slots.push({ kind: 'pending', o });
  while (slots.length < maxModules) slots.push({ kind: 'empty' });

  const COLS = 2;
  const gap = 8;
  const cardW = Math.floor((leftW - gap * (COLS - 1)) / COLS);
  const cardH = 46;
  for (let i = 0; i < slots.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const bx = leftX + col * (cardW + gap);
    const by = cy + row * (cardH + gap);
    const slot = slots[i];

    if (slot.kind === 'empty') {
      // Pusty slot — klik otwiera picker modułów.
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = THEME.borderLight ?? THEME.border; ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, cardW - 1, cardH - 1);
      ctx.setLineDash([]);
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'center';
      ctx.fillText(`＋ ${t('station.mgmt.addModule')}`, bx + cardW / 2, by + cardH / 2 + 4);
      ctx.textAlign = 'left';
      bhit(bx, by, cardW, cardH, 'station_mgmt_addslot', {});
      continue;
    }

    // Tło karty
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(bx, by, cardW, cardH);
    ctx.strokeStyle = THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, cardW - 1, cardH - 1);

    if (slot.kind === 'module') {
      const def = STATION_MODULES[slot.m.moduleType];
      const st = moduleStatus(slot.m);
      ctx.font = `18px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(def?.icon ?? '▪', bx + 8, by + 28);
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = slot.m.active === false ? THEME.textDim : THEME.textPrimary;
      ctx.fillText(moduleName(def ?? {}), bx + 34, by + 20);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      const lvTxt = (def?.maxLevel ?? 1) > 1 ? `lv${slot.m.level ?? 1}` : '';
      ctx.fillText(`${lvTxt}`, bx + 34, by + 36);
      // Status badge (prawy-góra)
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = st.color;
      ctx.textAlign = 'right';
      ctx.fillText(slot.m.active === false ? `${st.label} ${t('station.mgmt.' + (slot.m.inactiveReason === 'no_crew' ? 'noCrew' : 'noPower'))}` : st.label, bx + cardW - 8, by + 18);
      ctx.textAlign = 'left';
      // R1 — 🗑 rozbiórka modułu (prawy-dół karty). Potwierdzenie + brak zwrotu → w ColonyOverlay._onHit.
      const dW = 18, dX = bx + cardW - dW - 6, dY = by + cardH - dW - 4;
      ctx.strokeStyle = THEME.danger; ctx.lineWidth = 1;
      ctx.strokeRect(dX + 0.5, dY + 0.5, dW, 16);
      ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
      ctx.fillText('🗑', dX + dW / 2, dY + 12);
      ctx.textAlign = 'left';
      bhit(dX, dY, dW, 16, 'station_mgmt_demolish', { moduleId: slot.m.id, moduleType: slot.m.moduleType });
    } else {
      // pending (queued / building) — pasek postępu
      const o = slot.o;
      const def = STATION_MODULES[o.moduleType];
      ctx.font = `18px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(def?.icon ?? '▪', bx + 8, by + 28);
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(moduleName(def ?? {}), bx + 34, by + 18);
      // Pasek postępu / status
      const barX = bx + 34, barY = by + 28, barW = cardW - 34 - 34, barH = 6;
      const frac = o.buildTime > 0 ? Math.min(1, (o.progress ?? 0) / o.buildTime) : 0;
      ctx.fillStyle = THEME.bgTertiary; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = o.status === 'building' ? THEME.mint : THEME.warning;
      ctx.fillRect(barX, barY, Math.round(barW * frac), barH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(o.status === 'building' ? `🔨 ${Math.round(frac * 100)}%` : `⏳ ${t('station.mgmt.queued')}`, barX, by + 42);
      // ✕ anuluj (prawy-górny)
      ctx.strokeStyle = THEME.danger; ctx.lineWidth = 1;
      ctx.strokeRect(bx + cardW - 22.5, by + 4.5, 16, 14);
      ctx.fillStyle = THEME.danger;
      ctx.textAlign = 'center';
      ctx.fillText('✕', bx + cardW - 14, by + 15);
      ctx.textAlign = 'left';
      bhit(bx + cardW - 22, by + 4, 16, 14, 'station_mgmt_cancelmodule', { orderId: o.id });
    }
  }
  const gridRows = Math.ceil(slots.length / COLS);
  let leftBottom = cy + gridRows * (cardH + gap);

  // Kolejka stoczni (pod siatką, tylko gdy stocznia aktywna). Nagłówek + „+ Buduj statek" (R2).
  if (station.hasActiveShipyard) {
    leftBottom += 6;
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textHeader;
    ctx.fillText(t('station.mgmt.shipQueue'), leftX, leftBottom + 12);
    // Przycisk „+ Buduj statek" (prawy) → ship picker.
    const abW = 110, abX = leftX + leftW - abW, abY = leftBottom;
    ctx.fillStyle = 'rgba(0,255,180,0.08)';
    ctx.fillRect(abX, abY, abW, 16);
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1;
    ctx.strokeRect(abX + 0.5, abY + 0.5, abW - 1, 15);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.accent; ctx.textAlign = 'center';
    ctx.fillText(`＋ ${t('station.mgmt.buildShip')}`, abX + abW / 2, abY + 12);
    ctx.textAlign = 'left';
    bhit(abX, abY, abW, 16, 'station_mgmt_addship', {});
    leftBottom += 20;
    const queues = station.shipQueues ?? [];
    if (queues.length === 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('station.mgmt.shipQueueEmpty'), leftX, leftBottom + 11);
    }
    for (let i = 0; i < queues.length; i++) {
      const q = queues[i];
      const ship = SHIPS[q.shipId] ?? HULLS[q.shipId];
      const frac = q.buildTime > 0 ? Math.min(1, (q.progress ?? 0) / q.buildTime) : 0;
      const ry = leftBottom + i * 20;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(`${ship?.icon ?? '🚀'} ${moduleName(ship ?? { namePL: q.shipId, nameEN: q.shipId })}`, leftX, ry + 11);
      ctx.fillStyle = THEME.mint;
      ctx.fillText(`${Math.round(frac * 100)}%`, leftX + leftW - 60, ry + 11);
      ctx.strokeStyle = THEME.danger; ctx.lineWidth = 1;
      ctx.strokeRect(leftX + leftW - 24.5, ry + 0.5, 16, 14);
      ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
      ctx.fillText('✕', leftX + leftW - 16, ry + 11);
      ctx.textAlign = 'left';
      bhit(leftX + leftW - 24, ry, 16, 14, 'station_mgmt_cancelship', { index: i });
    }
  }

  // ── PRAWA KOLUMNA: depot ────────────────────────────────────────────────────
  const depot = classifyStationDepot([...(station.depot?.inventory ?? [])]);
  let ry = gridTop;
  ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.accent;
  ctx.fillText(t('station.depot'), rightX, ry + 12);
  ry += 20;
  if (depot.resources.length === 0 && depot.commodities.length === 0) {
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(t('station.depotEmpty'), rightX + 6, ry + 11);
  } else {
    const drawList = (label, entries) => {
      if (!entries.length) return;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(label, rightX + 2, ry + 10); ry += 14;
      for (const [id, amt] of entries) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(`${id}: ${Math.round(amt)}`, rightX + 10, ry + 10);
        ry += 14;
      }
    };
    drawList(t('station.resources'), depot.resources);
    drawList(t('station.commodities'), depot.commodities);
  }

  // ── PICKERY (overlay nad ekranem; wzajemnie wykluczające się) ────────────────
  if (pickerOpen) {
    drawModulePicker(ctx, area, station, view, maxModules);
  } else if (shipPickerOpen) {
    drawShipPicker(ctx, area, station, view);
  }
}

// Picker modułów — centralny box z listą modułów do budowy (koszt have/need, tech-gate, Buduj/🔒).
function drawModulePicker(ctx, area, station, view, maxModules) {
  const { x, y, w, h } = area;
  const { addHit, techIsResearched } = view;
  const slotsFull = (station.modules.length + station.pendingModuleOrders.length) >= maxModules;

  const types = Object.keys(STATION_MODULES);
  const rowH = 46;
  const PW = Math.min(560, w - 40);
  const PH = Math.min(h - 40, 60 + types.length * rowH + 16);
  const px = x + Math.floor((w - PW) / 2);
  const py = y + Math.floor((h - PH) / 2);

  // Tło modalu
  ctx.fillStyle = 'rgba(4,8,14,0.97)';
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = THEME.borderActive ?? THEME.accent; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

  // Nagłówek + ✕
  ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
  ctx.fillText(t('station.mgmt.picker'), px + 12, py + 22);
  ctx.strokeStyle = THEME.border; ctx.strokeRect(px + PW - 26.5, py + 6.5, 20, 18);
  ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'center';
  ctx.fillText('✕', px + PW - 16, py + 19);
  ctx.textAlign = 'left';
  addHit(px + PW - 26, py + 6, 20, 18, 'station_mgmt_picker_close', {});

  let ry = py + 32;
  for (const type of types) {
    const def = STATION_MODULES[type];
    const locked = def.requires && !techIsResearched?.(def.requires);
    const cost = stationModuleCost(type);
    // Sprawdź czy stać (depot)
    let afford = true;
    const costParts = [];
    for (const [id, amt] of Object.entries(cost)) {
      const have = station.depot?.getAmount?.(id) ?? 0;
      if (have < amt) afford = false;
      costParts.push({ id, amt, have });
    }
    const canBuild = !locked && !slotsFull && afford;

    // Wiersz
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(px + 8, ry, PW - 16, rowH - 4);
    ctx.font = `18px ${THEME.fontFamily}`;
    ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
    ctx.fillText(def.icon ?? '▪', px + 16, ry + 24);
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
    ctx.fillText(moduleName(def), px + 42, ry + 16);
    // Koszt (have/need — czerwone gdy brak)
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    let costX = px + 42;
    for (const c of costParts) {
      const txt = `${c.id} ${Math.round(c.have)}/${c.amt}`;
      ctx.fillStyle = c.have < c.amt ? THEME.danger : THEME.textDim;
      ctx.fillText(txt, costX, ry + 34);
      costX += ctx.measureText(txt).width + 12;
    }
    // Efekt (krótko) + energia/praca
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'right';
    ctx.fillText(`⚡${def.energy >= 0 ? '+' : ''}${def.energy} 👥${def.popWork ?? 0}`, px + PW - 96, ry + 16);
    ctx.textAlign = 'left';

    // Przycisk Buduj / 🔒 / brak slotu
    const bw = 76, bh = 24, bx = px + PW - bw - 12, by = ry + (rowH - 4 - bh) / 2;
    ctx.fillStyle = canBuild ? 'rgba(0,255,180,0.10)' : 'rgba(60,60,70,0.25)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = canBuild ? THEME.accent : THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = canBuild ? THEME.accent : THEME.textDim;
    ctx.textAlign = 'center';
    const btnLabel = locked ? `🔒` : slotsFull ? t('station.mgmt.full') : t('station.mgmt.build');
    ctx.fillText(btnLabel, bx + bw / 2, by + bh / 2 + 4);
    ctx.textAlign = 'left';
    if (canBuild) addHit(bx, by, bw, bh, 'station_mgmt_build', { moduleType: type });

    ry += rowH;
  }

  // Tło pickera NA KOŃCU — _hitTest=find, przyciski (dodane wyżej) wygrywają; tło konsumuje resztę.
  addHit(px, py, PW, PH, 'station_mgmt_picker_bg', {});
}

// Ship picker — lista PROJEKTÓW GRACZA (kadłub + moduły z window.KOSMOS.unitDesigns) do budowy w
// stoczni stacji — parytet ze stocznią kolonijną (S3.4 FAZA 3 R2 / decyzja #10). Tech-gate na KADŁUBIE
// (🔒), koszt have/need z depotu = calcShipCost(hull, moduły). Reuse queueStationShip(hullId, modules)
// (ColonyOverlay._onHit). Pusta lista → „Brak projektów — stwórz projekt w stoczni".
function drawShipPicker(ctx, area, station, view) {
  const { x, y, w, h } = area;
  const { addHit, techIsResearched } = view;

  // Projekty gracza: preferuj przekazane w view.designs (testowalność headless), inaczej z window.KOSMOS.
  const designs = view.designs ?? (typeof window !== 'undefined' ? window.KOSMOS?.unitDesigns : null) ?? [];
  const rowH = 46;
  const PW = Math.min(560, w - 40);
  const PH = Math.min(h - 40, 60 + Math.max(1, designs.length) * rowH + 16);
  const px = x + Math.floor((w - PW) / 2);
  const py = y + Math.floor((h - PH) / 2);

  ctx.fillStyle = 'rgba(4,8,14,0.97)';
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = THEME.borderActive ?? THEME.accent; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

  ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
  ctx.fillText(t('station.mgmt.shipPicker'), px + 12, py + 22);
  ctx.strokeStyle = THEME.border; ctx.strokeRect(px + PW - 26.5, py + 6.5, 20, 18);
  ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'center';
  ctx.fillText('✕', px + PW - 16, py + 19);
  ctx.textAlign = 'left';
  addHit(px + PW - 26, py + 6, 20, 18, 'station_mgmt_shippicker_close', {});

  // Pusta lista projektów → komunikat kierujący do projektanta (Command/Shipyard).
  if (designs.length === 0) {
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
    ctx.fillText(t('station.mgmt.noDesigns'), px + PW / 2, py + PH / 2);
    ctx.textAlign = 'left';
    addHit(px, py, PW, PH, 'station_mgmt_shippicker_bg', {});
    return;
  }

  let ry = py + 32;
  for (const tpl of designs) {
    const hull = HULLS[tpl.hullId] ?? SHIPS[tpl.hullId];
    if (!hull) continue;                                   // projekt na nieznanym kadłubie — pomiń
    const mods = (tpl.modules ?? []).filter(Boolean);
    const locked = hull.requires && !techIsResearched?.(hull.requires);
    const { cost: rawC, commodityCost: comC } = calcShipCost(hull, mods);
    const cost = { ...rawC, ...comC };
    let afford = true;
    const costParts = [];
    for (const [cid, amt] of Object.entries(cost)) {
      const have = station.depot?.getAmount?.(cid) ?? 0;
      if (have < amt) afford = false;
      costParts.push({ id: cid, amt, have });
    }
    const canBuild = !locked && afford;

    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fillRect(px + 8, ry, PW - 16, rowH - 4);
    ctx.font = `18px ${THEME.fontFamily}`;
    ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
    ctx.fillText(hull.icon ?? '🚀', px + 16, ry + 24);
    // Nazwa PROJEKTU (nie kadłuba) + kadłub w nawiasie.
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
    ctx.fillText(`${tpl.name ?? moduleName(hull)}`, px + 42, ry + 16);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.fillText(`${moduleName(hull)} · ${mods.length} mod`, px + 42 + ctx.measureText(`${tpl.name ?? moduleName(hull)}  `).width, ry + 16);
    let costX = px + 42;
    for (const c of costParts) {
      const txt = `${c.id} ${Math.round(c.have)}/${c.amt}`;
      ctx.fillStyle = c.have < c.amt ? THEME.danger : THEME.textDim;
      ctx.fillText(txt, costX, ry + 34);
      costX += ctx.measureText(txt).width + 12;
    }

    const bw = 76, bh = 24, bx = px + PW - bw - 12, by = ry + (rowH - 4 - bh) / 2;
    ctx.fillStyle = canBuild ? 'rgba(0,255,180,0.10)' : 'rgba(60,60,70,0.25)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = canBuild ? THEME.accent : THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = canBuild ? THEME.accent : THEME.textDim;
    ctx.textAlign = 'center';
    ctx.fillText(locked ? '🔒' : t('station.mgmt.build'), bx + bw / 2, by + bh / 2 + 4);
    ctx.textAlign = 'left';
    if (canBuild) addHit(bx, by, bw, bh, 'station_mgmt_buildship', { hullId: tpl.hullId, modules: mods, name: tpl.name });

    ry += rowH;
  }

  addHit(px, py, PW, PH, 'station_mgmt_shippicker_bg', {});
}
