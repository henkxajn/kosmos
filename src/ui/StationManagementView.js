// StationManagementView — render zarządzania stacją orbitalną (S3.4 FAZA 3; C6c-3: pełnoekranowy
// drawStationManagement RETIRED — zarządzanie stacją to teraz zakładka Stacja w ColonyOverlay).
// Eksporty żywe: drawStationManageCompact (embed body zakładki) + drawStationPickerModal (floating picker
// modułu/statku). Rysowanie + rejestracja hit-zon przez callback addHit (ColonyOverlay._addHit); cała logika
// interakcji wraca do ColonyOverlay._onHit (typy 'station_mgmt_*').
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
import { resolveHomeColony } from '../utils/TransferStore.js';
import { drawResourceIcon } from './ResourceIcons.js';
import { clampScroll, scrollThumb } from './InfoPanelLayoutLogic.js';   // C6c-3 follow-up — internal-scroll-box (drawScrollBox)

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

// ── C6c-2b-i: helpery compact renderera (wąska kolumna) ──
function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function sectionLine(ctx, x, y, w, label) {   // mirror ColonyOverlay._drawInfoSection (spójność wizualna zakładki)
  ctx.font = `bold 10px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x, y + 10);
  ctx.strokeStyle = THEME.borderActive; ctx.globalAlpha = 0.5; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y + 15); ctx.lineTo(x + w, y + 15); ctx.stroke();
  ctx.globalAlpha = 1;
  return y + 24;
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
    // Orbital Logistics Hub — moduł unique (np. logistics_hub) max 1 na stację → już obecny/w kolejce = niebudowalny.
    const alreadyHas = !!def.unique && (
      station.modules.some(m => m.moduleType === type) ||
      station.pendingModuleOrders.some(o => o.moduleType === type));
    const canBuild = !locked && !slotsFull && afford && !alreadyHas;

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
    const btnLabel = locked ? `🔒` : alreadyHas ? '✓' : slotsFull ? t('station.mgmt.full') : t('station.mgmt.build');
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
// Bok ikony kosztu (px) + odstęp między chipami.
const COST_ICON = 15;
const COST_GAP = 12;

// Szerokość chipu kosztu = ikona + odstęp + liczba wymaganej ilości. Font PRZED wołaniem.
function costChipWidth(ctx, amt) {
  return COST_ICON + 3 + ctx.measureText(String(amt)).width;
}

// Rozkłada listę kosztów (ikona + ilość) na wiersze mieszczące się w maxW.
// Zwraca tablicę wierszy, każdy = tablica { c, w }. Font musi być ustawiony PRZED wołaniem.
function layoutCostChips(ctx, costParts, maxW) {
  const lines = [[]];
  let lineW = 0;
  for (const c of costParts) {
    const w = costChipWidth(ctx, c.amt);
    if (lineW > 0 && lineW + COST_GAP + w > maxW) { lines.push([]); lineW = 0; }
    lines[lines.length - 1].push({ c, w });
    lineW += (lineW > 0 ? COST_GAP : 0) + w;
  }
  return lines;
}

// ── Reusable internal-scroll-box (StationManagementView-local) ────────────────────────────────────
// Wspólny szkielet przewijanego pudełka modalu — CAŁOŚĆ z InfoPanelLayoutLogic (JEDNO źródło prawdy,
// headless-proven, jak pruneZones/fitTabFontPx): clampScroll (klamp offsetu), clip pasma treści (fix
// bleed-through — wiersze poza pudełkiem nie malują się na tło/UI pod spodem), pruneZones (via
// view.pruneHits — hit-zony poza pasmem usuwane → off-fold nieklikalny, scroll-invariant; ta sama klasa
// bugów co stepper/pinned-header w C6c), scrollThumb (kciuk). Wywołujący liczy contentH i rysuje wiersze
// w callbacku przy `baseY − scroll`, REJESTRUJĄC hity na SCROLLOWANYCH pozycjach; helper domyka
// clip → prune → thumb. Ship picker = jedyny obecny użytkownik; module picker (stała liczba typów, nie
// przekracza viewportu) może dostać to samo bez przepisywania (podać drawRows + contentH).
//   box = { px, py, PW, PH, headerH }; view.{scroll,hitCount,pruneHits} = plumbing z ColonyOverlay.
// Zwraca { scroll: sklampowany, viewportH } — wywołujący raportuje scroll w górę (snap stanu, mirror _infoScroll).
function drawScrollBox(ctx, view, box, contentH, drawRows) {
  const { px, py, PW, PH, headerH } = box;
  const top = py + headerH, bot = py + PH;
  const viewportH = Math.max(0, PH - headerH);
  const scroll = clampScroll(view.scroll ?? 0, contentH, viewportH);
  const hitStart = view.hitCount?.() ?? 0;             // zony treści zaczynają się TU (nagłówek/✕ dodane wcześniej)
  ctx.save();
  ctx.beginPath(); ctx.rect(px, top, PW, viewportH); ctx.clip();
  drawRows(scroll);                                    // wywołujący rysuje wiersze przy (baseY − scroll) + rejestruje hity
  ctx.restore();
  view.pruneHits?.(hitStart, top, bot);               // hit-zony poza [top,bot] → usunięte (off-fold nieklikalny)
  const thumb = scrollThumb(scroll, contentH, viewportH, top);
  if (thumb) { ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(px + PW - 4, thumb.y, 3, thumb.h); }
  return { scroll, viewportH };
}

function drawShipPicker(ctx, area, station, view) {
  const { x, y, w, h } = area;
  const { addHit, techIsResearched } = view;

  // Projekty gracza: preferuj przekazane w view.designs (testowalność headless), inaczej z window.KOSMOS.
  const designs = view.designs ?? (typeof window !== 'undefined' ? window.KOSMOS?.unitDesigns : null) ?? [];
  const bw = 84, bh = 26;                                  // przycisk Buduj
  const PW = Math.min(760, w - 40);
  const HEADER_H = 40;
  const cw = PW - 32;                                      // szerokość treści (margines 16 po bokach)
  const costW = cw - bw - 16;                              // koszty zawijają się z dala od przycisku

  // Pass pomiarowy: policz wysokość każdego wiersza (zawinięte koszty) → dokładne PH.
  const rows = [];
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
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const costLines = layoutCostChips(ctx, costParts, costW);
    const rowH = 28 + costLines.length * 19 + 10;          // nagłówek wiersza + wiersze kosztów + padding
    rows.push({ tpl, hull, mods, locked, costParts, costLines, afford, rowH });
  }

  const bodyH = rows.reduce((s, r) => s + r.rowH, 0) || 48;
  const PH = Math.min(h - 40, HEADER_H + bodyH + 12);
  const px = x + Math.floor((w - PW) / 2);
  const py = y + Math.floor((h - PH) / 2);

  ctx.fillStyle = 'rgba(4,8,14,0.98)';
  ctx.fillRect(px, py, PW, PH);
  ctx.strokeStyle = THEME.borderActive ?? THEME.accent; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

  // Nagłówek + separator.
  ctx.font = `bold ${THEME.fontSizeNormal + 1}px ${THEME.fontFamily}`;
  ctx.fillStyle = THEME.accent; ctx.textAlign = 'left';
  ctx.fillText(t('station.mgmt.shipPicker'), px + 14, py + 25);
  ctx.strokeStyle = THEME.border; ctx.strokeRect(px + PW - 28.5, py + 9.5, 20, 18);
  ctx.fillStyle = THEME.textSecondary; ctx.textAlign = 'center';
  ctx.fillText('✕', px + PW - 18, py + 22);
  ctx.textAlign = 'left';
  addHit(px + PW - 28, py + 9, 20, 18, 'station_mgmt_shippicker_close', {});
  ctx.strokeStyle = THEME.border;
  ctx.beginPath(); ctx.moveTo(px + 8, py + HEADER_H - 4.5); ctx.lineTo(px + PW - 8, py + HEADER_H - 4.5); ctx.stroke();

  // Pusta lista projektów → komunikat kierujący do projektanta (Command/Shipyard).
  if (rows.length === 0) {
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
    ctx.fillText(t('station.mgmt.noDesigns'), px + PW / 2, py + HEADER_H + bodyH / 2);
    ctx.textAlign = 'left';
    addHit(px, py, PW, PH, 'station_mgmt_shippicker_bg', {});
    return { scroll: 0, contentH: bodyH, viewportH: Math.max(0, PH - HEADER_H) };
  }

  // ── Przewijane pudełko projektów (drawScrollBox: clampScroll → clip → pruneZones → scrollThumb) ──
  const sb = drawScrollBox(
    ctx, view, { px, py, PW, PH, headerH: HEADER_H }, bodyH,
    (sc) => {
      let ry = py + HEADER_H - sc;                          // kursor SCROLL-RELATIVE (hity rejestrowane tu → scroll-invariant przez prune)
      for (const r of rows) {
        const { tpl, hull, mods, locked, costLines, afford, rowH } = r;
        const canBuild = !locked && afford;

        ctx.fillStyle = 'rgba(255,255,255,0.02)';
        ctx.fillRect(px + 8, ry + 2, PW - 16, rowH - 4);

        // Ikona kadłuba.
        ctx.font = `18px ${THEME.fontFamily}`;
        ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
        ctx.fillText(hull.icon ?? '🚀', px + 16, ry + 24);

        // Nazwa PROJEKTU + kadłub·liczba modułów obok (przycięte, by nie wchodzić pod przycisk).
        const nameX = px + 42;
        ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
        ctx.fillStyle = locked ? THEME.textDim : THEME.textPrimary;
        const name = `${tpl.name ?? moduleName(hull)}`;
        ctx.fillText(name, nameX, ry + 20);
        const subX = nameX + ctx.measureText(name).width + 8;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = THEME.textDim;
        const subMaxX = px + PW - bw - 20;                     // koniec strefy tekstu przed przyciskiem
        if (subX < subMaxX) {
          ctx.save();
          ctx.beginPath(); ctx.rect(subX, ry, subMaxX - subX, 26); ctx.clip();
          ctx.fillText(`${moduleName(hull)} · ${mods.length} mod`, subX, ry + 20);
          ctx.restore();
        }

        // Koszty — ikona surowca/towaru + wymagana ilość; czerwony gdy brakuje. Zawinięte wiersze.
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        let cy = ry + 42;
        for (const line of costLines) {
          let cx = nameX;
          for (const chip of line) {
            const short = chip.c.have < chip.c.amt;
            drawResourceIcon(ctx, chip.c.id, cx, cy - 6, COST_ICON, null);
            ctx.fillStyle = short ? THEME.danger : THEME.textSecondary;
            ctx.fillText(String(chip.c.amt), cx + COST_ICON + 3, cy);
            cx += chip.w + COST_GAP;
          }
          cy += 19;
        }

        // Przycisk Buduj — wyśrodkowany pionowo, prawy górny obszar wiersza.
        const bx = px + PW - bw - 12, by = ry + 8;
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
    });

  addHit(px, py, PW, PH, 'station_mgmt_shippicker_bg', {});   // absorber PO drawScrollBox (po prune) → nieprunowany
  return { scroll: sb.scroll, contentH: bodyH, viewportH: sb.viewportH };
}

/**
 * C6c-2b — compact station management embedded w zakładce Stacja (wąska kolumna 300-460px). BODY (BEZ nazwy
 * — ta jest w pinowanym nagłówku, ColonyOverlay._drawStationHeaderPinned): statystyki (pionowo) → moduły
 * (1-kol) → kolejka stoczni → depot. Scroll-aware: rysuje od area.y, ZWRACA endCy (panel przewija). Reużywa
 * czyste helpery (computeBalance/moduleStatus/moduleName). AKCJE (🗑 demolish / ✕ cancel / ＋ dodaj moduł /
 * ＋ buduj statek) przez view.addHit — hity znikają gdy picker otwarty (bhit=noop). ✏ rename = pinowany nagłówek.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,y:number,w:number}} area
 * @param {import('../entities/Station.js').Station} station
 * @param {{addHit?:Function, techIsResearched?:Function, pickerOpen?:boolean, shipPickerOpen?:boolean}} view
 * @returns {number} endCy
 */
export function drawStationManageCompact(ctx, area, station, view) {
  const { x, y, w } = area;
  const bal = computeBalance(station);
  // C6c-2b-ii — bhit = addHit, ale NOOP gdy picker otwarty (bazowe hity nie konkurują z modalem; wzór
  // pełnego drawStationManagement `bhit = modal ? noop : addHit`). Picker (moduł/statek) rysuje ColonyOverlay
  // jako floating modal poza clipem scrolla (_drawStationPicker). 2b-i przekazywało {} → wszystko read-only.
  const { addHit = () => {}, pickerOpen, shipPickerOpen } = view ?? {};
  const bhit = (pickerOpen || shipPickerOpen) ? (() => {}) : addHit;
  let cy = y;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

  // Nazwa + ✏ rename PRZENIESIONE do pinowanego nagłówka (ColonyOverlay._drawStationHeaderPinned) — C6c-2b-ii
  // FIX: w scrollowanym body ✏ w 1. wierszu był prunowany po przewinięciu. Compact body zaczyna od statystyk.

  // Statystyki (pionowo — wąska kolumna)
  const stat = (txt, color) => {
    ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = color; ctx.textAlign = 'left';
    ctx.fillText(truncate(ctx, txt, w), x, cy + 10); cy += 15;
  };
  stat(`👥 ${t('station.mgmt.crew')}: ${station.pop ?? 0}/${station.popCapacity} (${t('station.mgmt.avail')} ${station.pop ?? 0})`, THEME.textSecondary);
  stat(`⚡ +${bal.prod} / -${bal.cons} (${t('station.mgmt.net')} ${bal.net >= 0 ? '+' : ''}${bal.net})`, bal.net >= 0 ? THEME.success : THEME.danger);
  stat(`🛠 ${t('station.mgmt.shipyard')}: ${station.hasActiveShipyard ? t('station.mgmt.on') : t('station.mgmt.off')}`, station.hasActiveShipyard ? THEME.success : THEME.textDim);
  stat(`💱 ${t('station.mgmt.tradeCap')}: ${station.tradeCapacity}`, THEME.textSecondary);
  if (station.modules.some(m => m.active === false && m.inactiveReason === 'no_crew')) {
    stat(`⚠ ${t('station.mgmt.noCrewHint')}`, THEME.warning);
  }
  cy += 4;

  // Moduły (1-kol: zbudowane + w budowie) — read-only (bez 🗑/＋/✕)
  const maxModules = STATIONS[station.stationType]?.maxModules ?? 8;
  cy = sectionLine(ctx, x, cy, w, `${t('station.mgmt.slots')} (${station.modules.length + station.pendingModuleOrders.length}/${maxModules})`);
  for (const m of station.modules) {
    const def = STATION_MODULES[m.moduleType]; const st = moduleStatus(m);
    const lv = (def?.maxLevel ?? 1) > 1 ? ` lv${m.level ?? 1}` : '';
    ctx.font = `11px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = m.active === false ? THEME.textDim : THEME.textPrimary;
    ctx.fillText(truncate(ctx, `${def?.icon ?? '▪'} ${moduleName(def ?? {})}${lv}`, w - 54), x, cy + 11);
    ctx.font = `10px ${THEME.fontFamily}`;
    ctx.fillStyle = st.color; ctx.textAlign = 'right';
    ctx.fillText(st.label, x + w - 22, cy + 11);
    // 🗑 demolish (K2: rozbiórka ZASIEDLONEGO habitatu zablokowana → demolish_blocked, komunikat zamiast modalu)
    const modCap = (def?.popCapacity ?? 0) * (m.level || 1);
    const demolishBlocked = modCap > 0 && (station.pop ?? 0) > ((station.popCapacity ?? 0) - modCap);
    ctx.fillStyle = demolishBlocked ? THEME.textDim : THEME.danger; ctx.textAlign = 'center';
    ctx.fillText('🗑', x + w - 8, cy + 11); ctx.textAlign = 'left';
    bhit(x + w - 18, cy, 18, 16, demolishBlocked ? 'station_mgmt_demolish_blocked' : 'station_mgmt_demolish',
         { moduleId: m.id, moduleType: m.moduleType });
    cy += 16;
  }
  for (const o of station.pendingModuleOrders) {
    const def = STATION_MODULES[o.moduleType];
    const frac = o.buildTime > 0 ? Math.min(1, (o.progress ?? 0) / o.buildTime) : 0;
    ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(truncate(ctx, `${def?.icon ?? '▪'} ${moduleName(def ?? {})}`, w - 82), x, cy + 10);
    ctx.fillStyle = o.status === 'building' ? THEME.mint : THEME.warning; ctx.textAlign = 'right';
    ctx.fillText(o.status === 'building' ? `🔨 ${Math.round(frac * 100)}%` : '⏳', x + w - 20, cy + 10);
    ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
    ctx.fillText('✕', x + w - 8, cy + 10); ctx.textAlign = 'left';
    bhit(x + w - 18, cy, 18, 14, 'station_mgmt_cancelmodule', { orderId: o.id });
    cy += 15;
  }

  // ＋ Dodaj moduł (gdy są wolne sloty) → picker modułów (station_mgmt_addslot)
  if (station.modules.length + station.pendingModuleOrders.length < maxModules) {
    const bh = 18;
    ctx.setLineDash([4, 3]); ctx.strokeStyle = THEME.borderLight ?? THEME.border; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, cy + 0.5, w - 1, bh - 1); ctx.setLineDash([]);
    ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`＋ ${t('station.mgmt.addModule')}`, x + w / 2, cy + bh / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    bhit(x, cy, w, bh, 'station_mgmt_addslot', {});
    cy += bh + 2;
  }

  // Kolejka stoczni (read-only) — tylko gdy stocznia aktywna
  if (station.hasActiveShipyard) {
    cy += 4;
    cy = sectionLine(ctx, x, cy, w, t('station.mgmt.shipQueue'));
    // ＋ Buduj statek → picker statków (station_mgmt_addship)
    const abH = 16;
    ctx.fillStyle = 'rgba(0,255,180,0.08)'; ctx.fillRect(x, cy, w, abH);
    ctx.strokeStyle = THEME.accent; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, cy + 0.5, w - 1, abH - 1);
    ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.accent; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`＋ ${t('station.mgmt.buildShip')}`, x + w / 2, cy + abH / 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    bhit(x, cy, w, abH, 'station_mgmt_addship', {});
    cy += abH + 4;
    const queues = station.shipQueues ?? [];
    if (queues.length === 0) {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      ctx.fillText(t('station.mgmt.shipQueueEmpty'), x + 2, cy + 10); cy += 15;
    } else {
      for (let i = 0; i < queues.length; i++) {
        const q = queues[i];
        const ship = SHIPS[q.shipId] ?? HULLS[q.shipId];
        const frac = q.buildTime > 0 ? Math.min(1, (q.progress ?? 0) / q.buildTime) : 0;
        ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(truncate(ctx, `${ship?.icon ?? '🚀'} ${moduleName(ship ?? { namePL: q.shipId, nameEN: q.shipId })}`, w - 64), x, cy + 10);
        ctx.fillStyle = THEME.mint; ctx.textAlign = 'right';
        ctx.fillText(`${Math.round(frac * 100)}%`, x + w - 20, cy + 10);
        ctx.fillStyle = THEME.danger; ctx.textAlign = 'center';
        ctx.fillText('✕', x + w - 8, cy + 10); ctx.textAlign = 'left';
        bhit(x + w - 18, cy, 18, 14, 'station_mgmt_cancelship', { index: i });
        cy += 15;
      }
    }
  }

  // Depot (read-only) — pula / wspólny magazyn / własny depot (1:1 dane z pełnego ekranu)
  cy += 4;
  cy = sectionLine(ctx, x, cy, w, t('station.depot'));
  const motherColony = resolveHomeColony(station);
  if (motherColony) {
    const poolSnap = window.KOSMOS?.systemPoolService?.getPoolSnapshot?.(motherColony.planetId);
    if (poolSnap) {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left';
      ctx.fillStyle = THEME.accent;   ctx.fillText(truncate(ctx, t('station.systemPool'), w), x + 2, cy + 10); cy += 14;
      ctx.fillStyle = THEME.textDim;  ctx.fillText(truncate(ctx, poolSnap.byBody.map(b => b.colony.name ?? b.colony.planetId).join(', '), w - 10), x + 10, cy + 10); cy += 14;
      for (const [id, amt] of [...poolSnap.total].filter(([, v]) => v > 0).slice(0, 10)) {
        ctx.fillStyle = THEME.textSecondary; ctx.fillText(`${id}: ${Math.round(amt)}`, x + 10, cy + 10); cy += 14;
      }
    } else {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.textAlign = 'left';
      ctx.fillStyle = THEME.textSecondary; ctx.fillText(truncate(ctx, t('station.sharedStorage'), w), x + 2, cy + 10); cy += 14;
      ctx.fillStyle = THEME.accent;        ctx.fillText(truncate(ctx, `▸ ${motherColony.name ?? motherColony.planetId}`, w - 10), x + 10, cy + 10); cy += 14;
    }
  } else {
    if (station.depotDetached) {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.danger; ctx.textAlign = 'left';
      ctx.fillText(truncate(ctx, t('station.cutOffFromSupply'), w), x + 2, cy + 10); cy += 16;
    }
    const depot = classifyStationDepot([...(station.depot?.inventory ?? [])]);
    if (depot.resources.length === 0 && depot.commodities.length === 0) {
      ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
      ctx.fillText(t('station.depotEmpty'), x + 6, cy + 10); cy += 15;
    } else {
      const drawList = (label, entries) => {
        if (!entries.length) return;
        ctx.font = `10px ${THEME.fontFamily}`; ctx.fillStyle = THEME.textDim; ctx.textAlign = 'left';
        ctx.fillText(label, x + 2, cy + 10); cy += 14;
        for (const [id, amt] of entries) {
          ctx.fillStyle = THEME.textSecondary; ctx.fillText(`${id}: ${Math.round(amt)}`, x + 10, cy + 10); cy += 14;
        }
      };
      drawList(t('station.resources'), depot.resources);
      drawList(t('station.commodities'), depot.commodities);
    }
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  return cy;
}

/**
 * C6c-2b-ii — wrapper pickera modułów/statków dla floating-modal w zakładce Stacja. Utrzymuje
 * drawModulePicker/drawShipPicker WEWNĘTRZNYMI (bez eksportu). ColonyOverlay woła to z _drawStationPicker
 * (backdrop + absorber dokłada ColonyOverlay). Reużywa 1:1 istniejące pickery (te same hity station_mgmt_*).
 * @param {'module'|'ship'} kind
 */
export function drawStationPickerModal(ctx, area, station, view, kind) {
  const maxModules = STATIONS[station.stationType]?.maxModules ?? 8;
  if (kind === 'ship') return drawShipPicker(ctx, area, station, view);
  drawModulePicker(ctx, area, station, view, maxModules);
  return null;
}
