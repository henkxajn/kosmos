// EconomyOverlay — panel Gospodarki (klawisz E)
//
// Jedna instancja zarejestrowana pod 'economy' (Produkcja) / 'budget' / 'flows' — strony grupy Ekonomii na zestawie konsoli
// (ARC KONSOLE K3/K4; KZ-E: ścieżka konsoli jest jedyną ścieżką). Rysunek: `EconomyConsoleView.js` (Budżet, Przepływy) i
// `ProductionConsoleView.js` (Produkcja); tu — dane (budżet, rozbicie przepływów, encje zakładek), stan, wejście i podpowiedzi DOM.
// Dane czytane LIVE z ColonyManager / ResourceSystem / FactorySystem.

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME }         from '../config/ThemeConfig.js';
import { ALL_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES, formatRecipe }
                         from '../data/CommoditiesData.js';
import { BUILDINGS }     from '../data/BuildingsData.js';
import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';
import { resolveHomeColony } from '../utils/TransferStore.js';
import { t, getName } from '../i18n/i18n.js';
import { getIconPath } from './ResourceIcons.js';
import { applyConsoleHalo, withAdaptiveHalo } from './ConsoleKit.js';
import { drawEconomyConsole } from './EconomyConsoleView.js';
import { drawProductionConsole } from './ProductionConsoleView.js';
import { applyEconChip, taxEffect } from './EconomyConsoleLogic.js';

// Strona grupy dla aktywnego id (ta sama instancja pod trzema id); overlay rysuje się tylko jako aktywny, więc innego id nie ma —
// fallback = Produkcja (`economy`), jak dawny domyślny `_centerTab`
const activePage = () => {
  const id = window.KOSMOS?.overlayManager?.active;
  return id === 'budget' || id === 'flows' ? id : 'economy';
};

// Ikona do tooltipa DOM: <img> PNG gdy istnieje plik, inaczej emoji (fallback).
function _iconHtml(id, emoji, size = 15) {
  const path = getIconPath(id);
  if (path) return `<img src="${path}" width="${size}" height="${size}" style="vertical-align:middle;margin-right:3px" alt="">`;
  return emoji ? `${emoji} ` : '';
}

// ══════════════════════════════════════════════════════════════════════════════
// EconomyOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class EconomyOverlay extends BaseOverlay {
  constructor() {
    super(null);
    // Strona wyprowadzana z overlayManager.active (`activePage`): 'economy' (Produkcja) | 'budget' | 'flows'
    this._collapsed = {            // zwijane kategorie (konsola Budżetu/Przepływów czyta 'commodities' — strefa `toggle_cat`)
      mined: false,
      harvested: false,
      commodities: false,
    };
    // Zakres (Produkcja, Przepływy): null = globalny, string = kolonia lub stacja
    this._selectedColonyId = null;

    // Flows — wybrany zasób w matrycy zużycia (master-detail)
    this._flowSelectedResId = null;

    // Tooltip DOM (hover na wierszach surowców/towarów)
    this._hoverResourceId = null;
    this._mouseScreenX = 0;
    this._mouseScreenY = 0;
    this._createTooltipEl();

    // K3 — konsola Budżetu i Przepływów: strefy ostatniej klatki (wejście czyta je stąd, bez
    // window.inner*), zaznaczona linia Budżetu, przewijanie listy i inspektora, skala UI z rysunku (podpowiedzi DOM)
    this.consoleZones = null;
    this._consoleListRect = null;
    this._consoleInspRect = null;
    this._consoleTooltip = null;
    this._budgetLine = null;
    this._kitScrollList = 0;
    this._kitScrollInsp = 0;
    this._kitInspContentH = 0;
    this._uiScale = 1;
    // K4 — konsola Produkcji: wybrany towar (bohater + inspektor), rozwinięty wybór zakresu w nagłówku listy
    this._prodGoodId = null;
    this._prodScopeOpen = false;
  }

  // ── Encje zakładek: kolonie + stacje GRACZA (overlay-local; NIE ColonyManager — audyt §2) ──
  // Stacja = encja-fasada o kontrakcie kolonii (planetId/name/resourceSystem=depot/factorySystem=null).

  // Fasady stacji gracza — budowane świeżo (getByType cache'owany; kilka stacji = koszt znikomy).
  _playerStationFacades() {
    return EntityManager.getByType('station')
      .filter(s => s.ownerEmpireId === 'player')
      // S3.4c (D9) — stacja z matką dzieli magazyn kolonii → zakładka-fasada byłaby duplikatem
      // przeglądu kolonii-matki. Pokazujemy TYLKO sieroty (własny depot); matka = resolveHomeColony≠null.
      .filter(s => resolveHomeColony(s) === null)
      .map(s => ({
        planetId:       s.id,        // klucz zakładki/filtra/hit (audyt §5)
        name:           s.name,
        resourceSystem: s.depot,     // depot ma .inventory (Map) + getAmount — kontrakt jak resourceSystem (audyt §4)
        factorySystem:  null,        // brak fabryk → przegląd pomija (697); zarządzanie wyłączone (hasManagement)
        isOutpost:      true,        // defensywnie (pominięcie w alertach)
        isStation:      true,        // marker jedynej kosmetycznej gałęzi (hasManagement + empty-state)
      }));
  }

  // Lista encji do zakładek: kolonie GRACZA + fasady stacji gracza. Kolonie imperiów AI
  // są ukryte (getPlayerColonies, nie getAllColonies) — gracz nie widzi gospodarki przeciwników.
  _getTabEntities() {
    const colMgr = window.KOSMOS?.colonyManager;
    return [...(colMgr?.getPlayerColonies() ?? []), ...this._playerStationFacades()];
  }

  // Rozwiąż wybraną encję po id: kolonia LUB fasada stacji. Zwraca FASADĘ (nie surową encję —
  // blok magazynu konsoli czyta .resourceSystem). Tylko stacje gracza (parytet z _getTabEntities).
  _resolveEntity(id) {
    if (!id) return null;
    const colMgr = window.KOSMOS?.colonyManager;
    return colMgr?.getColony(id) ?? this._playerStationFacades().find(f => f.planetId === id) ?? null;
  }

  // ── Tooltip DOM ─────────────────────────────────────────────────────────

  hide() {
    super.hide();
    this._hoverResourceId = null;
    this._hideTooltip();
    this._closeMinStockInput();
  }

  // ── Inline DOM input dla minimalnego zapasu ─────────────────────────────
  // Tworzymy pływające pole nad canvas dokładnie w miejscu kliknięcia
  // (kafelek między [−] a [+]). Wpisana wartość = docelowy bonus zapasu.
  _openMinStockInput(colonyId, commodityId, canvasX, canvasY, boxW, boxH, baseTarget) {
    this._closeMinStockInput();

    const colMgr = window.KOSMOS?.colonyManager;
    const col = colMgr?.getColony(colonyId);
    const fs = col?.factorySystem;
    if (!fs) return;

    // Skala logiczne → fizyczne piksele; K4 — skala UI zapamiętana w draw() (bez window.inner*)
    const SCALE = this._uiScale || 1;
    const sx = canvasX * SCALE;
    const sy = canvasY * SCALE;
    const sw = boxW * SCALE;
    const sh = boxH * SCALE;

    // Wpisywana wartość = docelowy safety stock (nie bonus).
    // Bonus = max(0, target - baseTarget), gdzie baseTarget to domyślny próg
    // bez bonusu gracza (zależny od kontekstu: tier w sekcji min-zapasów,
    // lub zużycie bieżącej konsumpcji).
    const base = Math.max(0, baseTarget ?? 0);
    const currentBonus = fs.getDemandBonus?.(commodityId) ?? 0;
    const currentTarget = base + currentBonus;

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = '999';
    input.step = '1';
    input.value = String(currentTarget);
    Object.assign(input.style, {
      position: 'fixed',
      left: `${Math.round(sx)}px`,
      top:  `${Math.round(sy)}px`,
      width: `${Math.round(sw)}px`,
      height: `${Math.round(sh)}px`,
      boxSizing: 'border-box',
      padding: '0 3px',
      margin: '0',
      background: THEME.bgPrimary,
      border: `1px solid ${THEME.borderActive}`,
      color: THEME.accent,
      fontFamily: THEME.fontFamily,
      fontSize: `${Math.max(10, Math.round(sh * 0.65))}px`,
      textAlign: 'center',
      outline: 'none',
      zIndex: '300',
      caretColor: THEME.accent,
    });
    // Ukryj strzałki number (spójność stylu)
    input.style.appearance = 'textfield';

    document.body.appendChild(input);
    this._minStockInput = input;

    let done = false;
    const commit = () => {
      if (done) return;
      done = true;
      const raw = parseInt(input.value, 10);
      const val = Number.isFinite(raw) ? Math.max(0, Math.min(999, raw)) : 0;
      // val = docelowy safety stock → przelicz na bonus nad bazą
      const newBonus = Math.max(0, val - base);
      fs.setDemandBonus(commodityId, newBonus);
      this._closeMinStockInput();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      this._closeMinStockInput();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    // Nie propaguj klików do canvas (nie zamknij overlay ani nie trigger hit zones)
    for (const evt of ['click', 'mousedown', 'mouseup']) {
      input.addEventListener(evt, (e) => e.stopPropagation());
    }

    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  }

  _closeMinStockInput() {
    const el = this._minStockInput;
    if (!el) return;
    this._minStockInput = null;
    // Zdejmij listener blur żeby nie wywołał commit przy unmount
    el.onblur = null;
    if (el.parentNode) el.parentNode.removeChild(el);
  }

  _createTooltipEl() {
    if (this._tooltipEl) return;
    const el = document.createElement('div');
    el.id = 'economy-tooltip';
    el.style.cssText = `
      position: fixed; z-index: 200; pointer-events: none;
      display: none; max-width: 340px; padding: 8px 10px;
      background: rgba(6,12,20,0.96); border: 1px solid ${THEME.borderActive};
      border-radius: 4px; font-family: 'Courier New', monospace;
      font-size: 11px; color: ${THEME.textSecondary}; line-height: 1.5;
    `;
    document.body.appendChild(el);
    this._tooltipEl = el;
  }

  _showTooltip() {
    if (!this._hoverResourceId || !this._tooltipEl) {
      this._hideTooltip();
      return;
    }
    const html = this._buildResourceTooltip(this._hoverResourceId);
    if (!html) { this._hideTooltip(); return; }

    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';

    // Pozycjonowanie — obok kursora, nie wychodząc poza ekran
    const rect = this._tooltipEl.getBoundingClientRect();
    let tx = this._mouseScreenX + 16;
    let ty = this._mouseScreenY - 8;
    const W = window.innerWidth;
    const H = window.innerHeight;
    if (tx + rect.width > W - 10) tx = this._mouseScreenX - rect.width - 12;
    if (ty + rect.height > H - 10) ty = H - rect.height - 10;
    if (ty < 4) ty = 4;
    if (tx < 4) tx = 4;

    this._tooltipEl.style.left = `${Math.round(tx)}px`;
    this._tooltipEl.style.top  = `${Math.round(ty)}px`;
  }

  _hideTooltip() {
    if (this._tooltipEl) this._tooltipEl.style.display = 'none';
  }

  _buildResourceTooltip(resourceId) {
    // Określ źródło danych: per-kolonia/stacja lub globalne (overlay-local — audyt §2)
    const selCol = this._resolveEntity(this._selectedColonyId);
    const colonies = this._getTabEntities();
    const sourceColonies = selCol ? [selCol] : colonies;

    // Szukaj definicji zasobu/towaru
    const resDef = ALL_RESOURCES[resourceId];
    const comDef = COMMODITIES[resourceId];
    const def = resDef || comDef;
    if (!def) return '';

    const icon = def.icon ?? '·';
    const name = getName(def, resDef ? 'resource' : 'commodity');

    // Zbierz ilość i stawkę (jak blok magazynu konsoli)
    let totalAmt = 0;
    let totalRate = 0;
    for (const col of sourceColonies) {
      const rs = col.resourceSystem;
      if (!rs) continue;
      totalAmt += rs.inventory?.get(resourceId) ?? 0;
      const observed = rs._deltaTracker?.observedPerYear;
      if (observed?.size > 0) {
        totalRate += observed.get(resourceId) ?? 0;
      } else if (rs._inventoryPerYear) {
        totalRate += rs._inventoryPerYear.get(resourceId) ?? 0;
      }
    }

    // Zbierz breakdown ze wszystkich źródłowych kolonii
    const allProducers = {};
    const allConsumers = {};
    for (const col of sourceColonies) {
      const rs = col.resourceSystem;
      if (!rs || typeof rs.getResourceBreakdown !== 'function') continue;   // depot stacji nie ma breakdown (audyt §4)
      const bd = rs.getResourceBreakdown(resourceId);
      for (const [type, g] of Object.entries(bd.producers)) {
        if (!allProducers[type]) allProducers[type] = { total: 0, count: 0 };
        allProducers[type].total += g.total;
        allProducers[type].count += g.count;
      }
      for (const [type, g] of Object.entries(bd.consumers)) {
        if (!allConsumers[type]) allConsumers[type] = { total: 0, count: 0 };
        allConsumers[type].total += g.total;
        allConsumers[type].count += g.count;
      }
    }

    // Buduj HTML
    const lines = [];
    lines.push(`<div style="font-weight:bold;color:${THEME.accent}">${_iconHtml(resourceId, icon)}${name}</div>`);
    lines.push(`<div>${t('econPanel.tooltipAmount')} ${_fmtAmt(totalAmt)}</div>`);

    // Faza 4: droid/android — pokaż ile jednostek ZAINSTALOWANYCH. Install KONSUMUJE droida z magazynu,
    // więc licznik magazynu ≠ liczba pracujących droidów; bez tego gracz nie widzi drugiej puli.
    if (comDef?.isDroidUnit) {
      let installed = 0;
      for (const col of sourceColonies) installed += col.buildingSystem?.countInstalledSynthetics?.(resourceId) ?? 0;
      lines.push(`<div style="color:${THEME.textDim}">${t('econPanel.installedSynthetic', installed)}</div>`);
    }

    const rateColor = totalRate > 0 ? THEME.success : totalRate < 0 ? THEME.danger : THEME.textDim;
    const rateSign = totalRate > 0 ? '+' : '';
    lines.push(`<div style="color:${rateColor}">${t('econPanel.tooltipBalance')} ${rateSign}${totalRate.toFixed(1)}${t('econPanel.perYear')}</div>`);

    // FIX C: pełna receptura (materiały + koszt Kr) — wiersz produkcji skraca ją z ellipsis, więc hover
    // ujawnia komplet (report: cost + pełna lista materiałów zawsze dostępne na hover).
    if (comDef?.recipe) {
      lines.push(`<div style="color:${THEME.textSecondary};margin-top:4px">${t('econPanel.recipeLabel')} ${formatRecipe(comDef.recipe, comDef.creditCost)}</div>`);
    }

    // Producenci
    const prodKeys = Object.keys(allProducers);
    if (prodKeys.length > 0) {
      lines.push(`<div style="color:${THEME.textDim};margin-top:4px">${t('econPanel.producers')}</div>`);
      for (const type of prodKeys) {
        const g = allProducers[type];
        const { icon: bIcon, name: bName } = _resolveTypeName(type);
        const cnt = g.count > 1 ? ` ×${g.count}` : '';
        lines.push(`<div style="color:${THEME.success}">${bIcon} ${bName}${cnt}  +${g.total.toFixed(1)}/r</div>`);
      }
    }

    // Konsumenci
    const consKeys = Object.keys(allConsumers);
    if (consKeys.length > 0) {
      lines.push(`<div style="color:${THEME.textDim};margin-top:4px">${t('econPanel.consumers')}</div>`);
      for (const type of consKeys) {
        const g = allConsumers[type];
        const { icon: bIcon, name: bName } = _resolveTypeName(type);
        const cnt = g.count > 1 ? ` ×${g.count}` : '';
        const val = Math.abs(g.total).toFixed(1);
        lines.push(`<div style="color:${THEME.danger}">${bIcon} ${bName}${cnt}  -${val}/r</div>`);
      }
    }

    if (prodKeys.length === 0 && consKeys.length === 0) {
      lines.push(`<div style="color:${THEME.textDim};margin-top:4px">${t('econPanel.noActiveProducers')}</div>`);
    }

    // Sekcja blokady produkcji (tylko towary z recepturą; tech-lock / brak składników).
    if (comDef) {
      const block = this._productionBlockHtml(resourceId);
      if (block) lines.push(block);
    }

    return lines.join('');
  }

  // Tooltip: dlaczego towaru NIE da się wyprodukować — tech-lock całej receptury,
  // sub-składniki zablokowane technologicznie, lub brakujące składniki w magazynie.
  // Zwraca HTML (string) lub '' gdy nie dotyczy (nie-towar / bez receptury / produkowalny).
  _productionBlockHtml(commodityId) {
    const def = COMMODITIES[commodityId];
    if (!def || !def.recipe) return '';   // surowiec lub towar bez receptury (np. prefab bazowy)

    // Kolonia do sprawdzenia: wybrana (jeśli jest) inaczej aktywna.
    const checkCol = this._resolveEntity(this._selectedColonyId)
      ?? window.KOSMOS?.colonyManager?.getActiveColony?.();
    const fs = checkCol?.factorySystem ?? window.KOSMOS?.factorySystem;
    if (!fs) return '';

    const lines = [];

    // 1) Cała receptura zablokowana technologicznie → jeden powód, koniec.
    if (typeof fs.isRecipeAvailable === 'function' && !fs.isRecipeAvailable(commodityId)) {
      const techName = def.requiresTech ? (t(`tech.${def.requiresTech}.name`) || def.requiresTech) : '?';
      return `<div style="color:${THEME.danger};margin-top:4px">🔒 ${t('ui.requiresTech', techName)}</div>`;
    }

    // 2) Sub-składniki (commodity) zablokowane technologicznie.
    const techBlocked = typeof fs._getTechBlockedIngredients === 'function'
      ? fs._getTechBlockedIngredients(commodityId) : [];
    for (const b of techBlocked) {
      const ingName  = getName(COMMODITIES[b.ingredientId] ?? { id: b.ingredientId }, 'commodity');
      const techName = b.requiresTech ? (t(`tech.${b.requiresTech}.name`) || b.requiresTech) : '?';
      lines.push(`<div style="color:${THEME.warning}">⚠ ${ingName}: ${t('ui.requiresTech', techName)}</div>`);
    }

    // 3) Brakujące składniki w magazynie (receptura per szt. vs inventory).
    // Receptura SKALOWANA (fs._getScaledRecipe) — spójna z rzeczywistą bramką
    // _hasIngredients; bez tego tooltip czytał surową recepturę i pokazywał „wszystko
    // OK" mimo STALL-u w scenariuszu boosted (×5 tier-1) → blocker był niewidoczny.
    const inv = checkCol?.resourceSystem?.inventory;
    if (inv && typeof inv.get === 'function') {
      const scaledRecipe = typeof fs._getScaledRecipe === 'function'
        ? fs._getScaledRecipe(def.recipe, commodityId) : def.recipe;
      const missing = [];
      for (const [resId, qty] of Object.entries(scaledRecipe)) {
        const have = inv.get(resId) ?? 0;
        if (have < qty) missing.push({ resId, have, need: qty });
      }
      if (missing.length > 0) {
        lines.push(`<div style="color:${THEME.textDim};margin-top:4px">${t('econPanel.missingInputs')}</div>`);
        for (const m of missing) {
          const rdef  = ALL_RESOURCES[m.resId] ?? COMMODITIES[m.resId] ?? { id: m.resId };
          const mName = getName(rdef, ALL_RESOURCES[m.resId] ? 'resource' : 'commodity');
          lines.push(`<div style="color:${THEME.danger}">${_iconHtml(m.resId, rdef.icon, 13)}${mName}: ${Math.floor(m.have)}/${m.need}</div>`);
        }
      }
    }

    // 4) Faza 4: creditCost — niewypłacalność kolonii PAUZUJE produkcję (droid = sink Kr).
    if ((def.creditCost ?? 0) > 0) {
      const credits = checkCol?.credits ?? 0;
      const line = credits < def.creditCost
        ? `<div style="color:${THEME.danger};margin-top:4px">💰 ${t('econPanel.insufficientCredits', def.creditCost)} (${Math.floor(credits)} Kr)</div>`
        : `<div style="color:${THEME.textDim};margin-top:4px">💰 ${t('econPanel.creditCostPerUnit', def.creditCost)}</div>`;
      lines.push(line);
    }

    return lines.join('');
  }

  // ── Główna metoda rysowania ──────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    // Multi-rejestracja: ta sama instancja jest pod id 'economy'/'budget'/'flows' — aktywne id (czip grupy) wybiera stronę
    const page = activePage();
    // K3 — poświata za całym rysunkiem konsoli; zdjęta przez restore (pasek walki i reszta UI bez niej)
    ctx.save();
    applyConsoleHalo(ctx);
    try {
      withAdaptiveHalo(ctx, W, H, () => {
        if (page === 'economy') drawProductionConsole(this, ctx, W, H);   // K4 — Produkcja
        else drawEconomyConsole(this, ctx, W, H, page);
      });
    } finally { ctx.restore(); }
  }

  // Inline DOM input ilości jednorazowego zlecenia (wzór _openMinStockInput).
  _openOneShotQtyInput(colonyId, commodityId, canvasX, canvasY) {
    this._closeMinStockInput();   // współdzielony slot inputu
    const colMgr = window.KOSMOS?.colonyManager;
    const fs = colMgr?.getColony(colonyId)?.factorySystem;
    if (!fs) return;

    const SCALE = this._uiScale || 1;   // K4 — jw.
    const boxW = 50, boxH = 18;
    const sx = (canvasX ?? 100) * SCALE, sy = (canvasY ?? 100) * SCALE;
    const sw = boxW * SCALE, sh = boxH * SCALE;

    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.max = '9999'; input.step = '1'; input.value = '10';
    Object.assign(input.style, {
      position: 'fixed', left: `${Math.round(sx)}px`, top: `${Math.round(sy)}px`,
      width: `${Math.round(sw)}px`, height: `${Math.round(sh)}px`, boxSizing: 'border-box',
      padding: '0 3px', margin: '0', background: THEME.bgPrimary,
      border: `1px solid ${THEME.borderActive}`, color: THEME.accent, fontFamily: THEME.fontFamily,
      fontSize: `${Math.max(10, Math.round(sh * 0.6))}px`, textAlign: 'center', outline: 'none',
      zIndex: '300', caretColor: THEME.accent,
    });
    input.style.appearance = 'textfield';
    document.body.appendChild(input);
    this._minStockInput = input;

    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const raw = parseInt(input.value, 10);
      const val = Number.isFinite(raw) ? Math.max(1, Math.min(9999, raw)) : 0;
      if (val >= 1) fs.setOneShotJob(commodityId, val);
      this._closeMinStockInput();
    };
    const cancel = () => { if (done) return; done = true; this._closeMinStockInput(); };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      e.stopPropagation();
    });
    input.addEventListener('blur', commit);
    for (const evt of ['click', 'mousedown', 'mouseup']) input.addEventListener(evt, (e) => e.stopPropagation());
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  // Podgląd kosztu zlecenia droida: "Zbuduj N → N×receptura + N×Kr Kr"
  _droidCostPreview(def, n) {
    const scaled = {};
    for (const [r, q] of Object.entries(def.recipe ?? {})) scaled[r] = q * n;
    const kr = (def.creditCost ?? 0) * n;
    return t('econPanel.droidCostPreview', n, formatRecipe(scaled), kr);
  }

  // Wspólny tekst powodu STALL (wiersz alokacji + sekcja droidów). null → brak.
  _stallReasonMsg(sr) {
    if (!sr) return null;
    if (sr.kind === 'tech_blocked') {
      const b = sr.blocked[0];
      const ing = COMMODITIES[b.ingredientId];
      const tn = b.requiresTech ? (t(`tech.${b.requiresTech}.name`) || b.requiresTech) : '?';
      return `⚠ ${ing ? getName(ing, 'commodity') : b.ingredientId}: ${t('ui.requiresTech', tn)}`;
    }
    if (sr.kind === 'missing_ingredient') {
      const m = sr.missing[0];
      const rdef = ALL_RESOURCES[m.resId] ?? COMMODITIES[m.resId] ?? { id: m.resId };
      const rn = rdef.symbol ?? getName(rdef, ALL_RESOURCES[m.resId] ? 'resource' : 'commodity');
      const extra = sr.missing.length > 1 ? ` +${sr.missing.length - 1}` : '';
      return t('econPanel.stallMissing', rn, Math.floor(m.need), Math.floor(m.have)) + extra;
    }
    if (sr.kind === 'insolvent') return t('econPanel.stallInsolvent', sr.creditCost, Math.floor(sr.credits));
    if (sr.kind === 'no_points') return t('econPanel.stallNoPoints');
    return null;   // target_done / inne → brak komunikatu STALL
  }

  // Lokalny stan „ile zbudować" per (kolonia, droid) — commit dopiero na [Zbuduj].
  _getDroidBuildQty(colonyId, commodityId) {
    if (!this._droidBuildQty) this._droidBuildQty = {};
    return this._droidBuildQty[`${colonyId}:${commodityId}`] ?? 1;
  }
  _setDroidBuildQty(colonyId, commodityId, n) {
    if (!this._droidBuildQty) this._droidBuildQty = {};
    this._droidBuildQty[`${colonyId}:${commodityId}`] = Math.max(1, Math.min(99, Math.floor(n) || 1));
  }

  // ── Router kliknięć fabryki ───────────────────────────────────────────────

  _handleFactoryBtn(data) {
    const colMgr = window.KOSMOS?.colonyManager;
    const col = colMgr?.getColony(data.colonyId);
    if (!col) return;
    const fs = col.factorySystem;
    if (!fs) return;

    switch (data.action) {
      // ── Master-switch produkcji (offline/online) ─────
      case 'toggle_production':
        fs.setProductionEnabled(!fs.isProductionEnabled());
        break;

      // ── Tryb reaktywny — bonus zapasu ─────────────
      case 'demand_plus':
        fs.setDemandBonus(data.commodityId, fs.getDemandBonus(data.commodityId) + 1);
        break;
      case 'demand_minus':
        fs.setDemandBonus(data.commodityId, fs.getDemandBonus(data.commodityId) - 1);
        break;
      case 'demand_set_input':
        this._openMinStockInput(
          data.colonyId, data.commodityId,
          data.boxCanvasX, data.boxCanvasY, data.boxW, data.boxH,
          data.baseTarget ?? 0
        );
        break;

      // ── Jednorazowe zlecenie (one-shot) ──────────────
      case 'oneshot_pick':
        this._openOneShotQtyInput(data.colonyId, data.commodityId, data.boxCanvasX, data.boxCanvasY);
        break;
      case 'oneshot_cancel':
        fs.cancelOneShotJob();
        break;

      // ── Zlecenia droidów (dobra inwestycyjne, Build-N) ──
      case 'droid_qty_minus':
        this._setDroidBuildQty(data.colonyId, data.commodityId, this._getDroidBuildQty(data.colonyId, data.commodityId) - 1);
        break;
      case 'droid_qty_plus':
        this._setDroidBuildQty(data.colonyId, data.commodityId, this._getDroidBuildQty(data.colonyId, data.commodityId) + 1);
        break;
      case 'droid_build':
        fs.setDroidOrder(data.commodityId, this._getDroidBuildQty(data.colonyId, data.commodityId));
        break;
      case 'droid_cancel':
        fs.cancelDroidOrder(data.commodityId);
        break;

      // ── Tryb reaktywny — zlecenia eksportowe (Plan B) ─
      case 'export_toggle_enabled':
        // K4 (Finding 742) — ładunek adresuje kolonię strefy (zakres Produkcji), nie aktywną kolonię
        EventBus.emit('factory:setExportEnabled', { enabled: !fs.exportPrefs.enabled, colonyId: data.colonyId });
        break;
      case 'export_toggle_tier':
        EventBus.emit('factory:setExportTier', { tier: data.tier, enabled: !fs.exportPrefs.tiers[data.tier], colonyId: data.colonyId });
        break;
    }
  }

  // ── Przepływy — dane rozbicia (konsola: bohater, inspektor, wiersze listy) ──

  // Agreguje producentów/konsumentów zasobu per typ źródła, GLOBALNIE (kolonie gracza).
  // Replika logiki ResourceSystem.getResourceBreakdown, ale per-kolonia (nie active-only):
  //   §1 zarejestrowani producenci (budynki/POP/colony_base), §2 kopalnie (raw),
  //   §3 konsumpcja fabryk (składniki). Zwraca { producers:{type:total}, consumers:{type:total} }.
  _gatherFlowBreakdown(resId) {
    const producers = {};
    const consumers = {};
    const colonies = window.KOSMOS?.colonyManager?.getPlayerColonies?.() ?? [];
    const isBoosted = window.KOSMOS?.scenario === 'civilization_boosted';

    const add = (tgt, type, v) => { tgt[type] = (tgt[type] ?? 0) + v; };

    for (const col of colonies) {
      const rs = col.resourceSystem;
      if (!rs?._producers) continue;
      const bSys = col.buildingSystem;

      // §1 — zarejestrowani producenci/konsumenci
      for (const [pid, rates] of rs._producers) {
        const val = rates[resId] ?? 0;
        if (val === 0) continue;
        let type = pid;
        if (pid.startsWith('building_')) {
          const tileKey = pid.slice('building_'.length);
          type = bSys?._active?.get(tileKey)?.building?.id ?? 'unknown';
        } else if (pid.startsWith('capital_')) type = 'colony_base';
        else if (pid === 'civilization_consumption') type = 'pop_consumption';
        add(val > 0 ? producers : consumers, type, Math.abs(val));
      }

      // §2 — wydobycie z kopalni (raw, nie rejestrowane jako producer)
      const deposits = bSys?._deposits;
      if (deposits && bSys._cachedMineLevel > 0) {
        const rateMult = isBoosted ? 5 : 1;
        let mineOutput = 0;
        for (const dep of deposits) {
          if (dep.remaining <= 0 || dep.resourceId !== resId) continue;
          const depletion = dep.remaining / dep.totalAmount;
          mineOutput += bSys._cachedMineLevel * 10 * rateMult * dep.richness * depletion;
        }
        if (mineOutput > 0) add(producers, 'mine', mineOutput);
      }

      // §3 — konsumpcja fabryk (składniki, via spend — nie rejestrowane jako consumer)
      const factSys = col.factorySystem;
      if (factSys?._allocations) {
        const demandRates = rs._producers.get('prosperity_consumption') ?? {};
        let factoryCons = 0;
        for (const [commodityId, alloc] of factSys._allocations) {
          if (alloc._paused) continue;
          const cdef = COMMODITIES[commodityId];
          if (!cdef?.recipe) continue;
          const recipe = factSys._getScaledRecipe?.(cdef.recipe, commodityId) ?? cdef.recipe;
          const needed = recipe[resId];
          if (!needed || needed <= 0) continue;
          const speedMult = isBoosted ? 1.5 : 1;
          const capacityPerYear = alloc.points * speedMult / cdef.baseTime;
          const demandPerYear = Math.abs(demandRates[commodityId] ?? 0);
          const unitsPerYear = demandPerYear > 0 ? Math.min(capacityPerYear, demandPerYear) : capacityPerYear;
          factoryCons += unitsPerYear * needed;
        }
        if (factoryCons > 0) add(consumers, 'factory', factoryCons);
      }
    }

    return { producers, consumers };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BUDŻET — dane pulpitu finansowego (konsola Budżetu; port z CivilizationOverlay)
  // Dane z TYCH SAMYCH źródeł co Civilization: ColonyManager (kredyty/podatki),
  // VesselManager (utrzymanie floty), GroundUnitManager (utrzymanie jednostek).
  // ══════════════════════════════════════════════════════════════════════════

  // Zbiera dane budżetowe wyłącznie dla kolonii GRACZA (getPlayerColonies — bez AI).
  _gatherBudgetData() {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;

    const colonies     = colMgr?.getPlayerColonies() ?? [];
    const fullColonies = colonies.filter(c => !c.isOutpost);

    let totalCredits = 0, totalCreditsPerYear = 0, totalResearch = 0;
    const globalResources = {};   // id → { stock, rate }

    for (const col of colonies) {
      const res = col.resourceSystem;
      totalCredits        += col.credits ?? 0;
      totalCreditsPerYear += col.creditsPerYear ?? 0;

      if (res?.inventory) {
        for (const [id, stock] of res.inventory) {
          if (!globalResources[id]) globalResources[id] = { stock: 0, rate: 0 };
          globalResources[id].stock += stock;
        }
      }
      const dt = res?._deltaTracker;
      if (dt?.observedPerYear) {
        for (const [id, rate] of dt.observedPerYear) {
          if (!globalResources[id]) globalResources[id] = { stock: 0, rate: 0 };
          globalResources[id].rate += rate;
        }
        totalResearch += dt.observedPerYear.get('research') ?? 0;
      }
    }

    // Podatki — suma przychodu z pełnych kolonii + globalna stawka
    let taxIncome = 0;
    for (const col of fullColonies) taxIncome += colMgr?.calculateTaxIncome(col) ?? 0;
    const taxRate   = colMgr?.taxRate ?? 0.08;
    const taxEffect = this._getTaxEffectLabel(taxRate);

    // Utrzymanie jednostek naziemnych (Kr/civYear) — tabela GROUND_UNIT_UPKEEP
    let totalUnitUpkeep = 0, unitUpkeepCount = 0;
    const guMgr   = window.KOSMOS?.groundUnitManager;
    const upTable = colMgr?.constructor?.GROUND_UNIT_UPKEEP;
    if (guMgr && upTable) {
      for (const u of guMgr._units?.values?.() ?? []) {
        if (u.owner !== 'player' && u.factionId !== 'humanity') continue;
        const up = upTable[u.archetypeId];
        if (!up) continue;
        totalUnitUpkeep += up.credits ?? 0;
        unitUpkeepCount++;
      }
    }

    // Utrzymanie floty (Kr/rok) — getTotalFleetUpkeep filtruje wraki + statki AI.
    // W2-5: stawka jest już EFEKTYWNA (rezerwa płaci 10 %), a rozbicie służba/rezerwa idzie
    // z jednego licznika, żeby panele nie liczyły tego samego na dwa sposoby.
    const totalFleetUpkeep = vMgr?.getTotalFleetUpkeep?.() ?? 0;
    const fleetUpkeep = vMgr?.getFleetUpkeepBreakdown?.() ?? null;
    let fleetUpkeepCount = 0;
    for (const v of (vMgr?.getAllVessels?.() ?? [])) {
      if (v.isWreck) continue;
      if (v.ownerEmpireId && v.ownerEmpireId !== 'player') continue;
      fleetUpkeepCount++;
    }

    // Population 2.0 Faza 3 (§3.7) — płace (Kr/rok) = Σ getTotalLaborCost pełnych kolonii gracza.
    let totalLaborCost = 0;
    for (const col of fullColonies) totalLaborCost += col.civSystem?.getTotalLaborCost?.() ?? 0;

    return {
      totalCredits, totalCreditsPerYear, totalResearch,
      globalResources, taxIncome, taxRate, taxEffect,
      totalUnitUpkeep, unitUpkeepCount,
      totalFleetUpkeep, fleetUpkeepCount, fleetUpkeep,
      totalLaborCost,
    };
  }

  // Etykieta efektu stawki podatkowej na konsumpcję (PL/EN). Port z CivilizationOverlay.
  _getTaxEffectLabel(rate) {
    // K3 / Finding 725 — etykiety przez t() (klucze econPanel.taxEffect.*); formuła w EconomyConsoleLogic.taxEffect (bez zmian)
    const e = taxEffect(rate);
    return t(e.key, e.pct);
  }

  // ── Obsługa kliknięć ───────────────────────────────────────────────────

  handleClick(x, y) {
    if (!this.visible) return false;
    // K3 — geometria wyłącznie ze stref ostatniej klatki (bez window.inner*); klik w ramie zawsze pochłonięty
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    this._lastClickX = x;   // tax_slider — stawka z pozycji X kliknięcia
    const hit = this._hitTest(x, y);
    if (hit) this._onHit(hit);
    return true;
  }

  _onHit(zone) {
    switch (zone.type) {
      case 'close':
        this.hide();
        break;
      case 'tab':
        // K3 — czip grupy w nagłówku konsoli (D-K-15): Budżet / Produkcja / Handel / Rynek / Przepływy
        if (zone.data?.id) applyEconChip(zone.data.id, window.KOSMOS?.overlayManager);
        break;
      case 'toggle_cat':
        this._collapsed[zone.data.catKey] = !this._collapsed[zone.data.catKey];
        break;
      case 'flow_res':
        this._flowSelectedResId = zone.data.resId;
        this._kitScrollInsp = 0;
        break;
      case 'budget_line':   // K3 — wybór linii Budżetu (inspektor pokazuje jej rozbicie)
        this._budgetLine = zone.data.lineId;
        this._kitScrollInsp = 0;
        break;
      case 'prod_good':     // K4 — wybór towaru konsoli Produkcji (bohater: łańcuch; inspektor: akcje)
        this._prodGoodId = zone.data.commodityId;
        this._kitScrollInsp = 0;
        break;
      case 'prod_scope_toggle':   // K4 — rozwiń / zwiń wybór zakresu (Finding 732 — pełna lista encji zamiast czipów)
        this._prodScopeOpen = !this._prodScopeOpen;
        this._kitScrollList = 0;
        break;
      case 'colony_filter':
        this._selectedColonyId = zone.data.colonyId;
        this._prodScopeOpen = false;   // K4 — wybór zakresu zamyka listę wyboru
        this._kitScrollList = 0;
        break;
      case 'factory_btn':
        this._handleFactoryBtn(zone.data);
        break;
      case 'tax_slider': {
        // Klik na pasku podatków (zakładka BUDŻET) → stawka proporcjonalna do pozycji X.
        // taxRate jest setterem z clampem 0–0.25 w ColonyManager.
        const colMgr = window.KOSMOS?.colonyManager;
        if (!colMgr) break;
        const hitX = this._lastClickX ?? 0;
        const relX = Math.max(0, Math.min(zone.data.barW, hitX - zone.data.barX));
        colMgr.taxRate = Math.round((relX / zone.data.barW) * 0.25 * 100) / 100;
        break;
      }
    }
  }

  handleMouseMove(x, y) {
    if (!this.visible) {
      this._hoverResourceId = null;
      this._hideTooltip();
      return;
    }
    this._hoverZone = this._hitTest(x, y);

    // Pozycja myszy w pikselach ekranowych (do pozycjonowania tooltipa); K3 — skala UI zapamiętana w draw()
    const scale = this._uiScale || 1;
    this._mouseScreenX = x * scale;
    this._mouseScreenY = y * scale;

    // Sprawdź hover na wierszu surowca/towaru
    if (this._hoverZone?.type === 'resource_hover') {
      this._hoverResourceId = this._hoverZone.data.resourceId;
      this._showTooltip();
    } else if (this._hoverZone?.data?.tooltip) {
      // Slice 5D: generyczny tooltip tekstowy z pola zone.data.tooltip (np. master-switch fabryk).
      this._hoverResourceId = null;
      this._showTextTooltip(this._hoverZone.data.tooltip);
    } else {
      this._hoverResourceId = null;
      this._hideTooltip();
    }
  }

  /** Slice 5D: generyczny tooltip tekstowy (reuse _tooltipEl + pozycjonowanie flip-off-control). */
  _showTextTooltip(html) {
    if (!this._tooltipEl || !html) { this._hideTooltip(); return; }
    this._tooltipEl.innerHTML = html;
    this._tooltipEl.style.display = 'block';
    const rect = this._tooltipEl.getBoundingClientRect();
    let tx = this._mouseScreenX + 16, ty = this._mouseScreenY - 8;
    if (tx + rect.width  > window.innerWidth  - 10) tx = this._mouseScreenX - rect.width - 12;
    if (ty + rect.height > window.innerHeight - 10) ty = window.innerHeight - rect.height - 10;
    if (ty < 4) ty = 4; if (tx < 4) tx = 4;
    this._tooltipEl.style.left = `${Math.round(tx)}px`;
    this._tooltipEl.style.top  = `${Math.round(ty)}px`;
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    // K3 — lista i inspektor przewijane osobno; klamra w rysunku (drawList / inspektor)
    const f = this.consoleZones?.frame;
    if (!f || x < f.x || x > f.x + f.w || y < f.y || y > f.y + f.h) return false;
    const inR = (r) => r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inR(this._consoleListRect)) this._kitScrollList = Math.max(0, this._kitScrollList + delta * 0.5);
    else if (inR(this._consoleInspRect)) this._kitScrollInsp = Math.max(0, this._kitScrollInsp + delta * 0.5);
    return true;
  }
}

// ── Rozwiąż nazwę i ikonę typu producenta/konsumenta ──────────────────────
function _resolveTypeName(type) {
  if (type === 'pop_consumption') return { icon: '👥', name: t('econPanel.resolvePopConsumption') };
  if (type === 'prosperity_consumption') return { icon: '🏠', name: t('econPanel.resolveProsperityConsumption') };
  if (type === 'factory') return { icon: '🏭', name: t('econPanel.resolveFactory') };
  if (type === 'mine') return { icon: '⛏', name: t('econPanel.resolveMine') };
  const def = BUILDINGS[type];
  return { icon: def?.icon ?? '?', name: def ? getName(def, 'building') : type };
}

// ── Formatowanie ilości ───────────────────────────────────────────────────
function _fmtAmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}
