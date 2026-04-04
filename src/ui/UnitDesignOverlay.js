// UnitDesignOverlay — panel Projektowania Jednostek (klawisz U)
//
// Lewa połowa: projektowanie statków (wybór kadłuba, sloty, moduły, szablony).
// Prawa połowa: placeholder dla jednostek naziemnych.
// Szablony zapisywane w window.KOSMOS.unitDesigns[] — dostępne w stoczni (Flota).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { HULLS, getSlotCounts } from '../data/HullsData.js';
import { SHIP_MODULES, UTILITY_SLOT_TYPES, calcShipStats, calcShipCost }
                         from '../data/ShipModulesData.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { COMMODITIES }   from '../data/CommoditiesData.js';
import { showRenameModal } from './ModalInput.js';
import { t, getName }    from '../i18n/i18n.js';

// ── Stałe layoutu ────────────────────────────────────────────────────────────
const PAD       = 8;
const ROW_H     = 22;
const HULL_BTN_H = 48;
const SLOT_H    = 26;
const MOD_ROW_H = 24;
const TPL_ROW_H = 28;
const HEADER_H  = 28;
const DIVIDER_W = 1;

// Ikony kategorii modułów
const CATEGORY_ICONS = {
  propulsion: '🔥',
  cargo:      '📦',
  science:    '🔬',
  special:    '🤖',
  habitat:    '🏠',
  armor:      '🛡',
  fuel:       '⛽',
  weapon:     '🔫',
};

const CATEGORY_LABELS_PL = {
  propulsion: 'Napęd',
  cargo:      'Ładownia',
  science:    'Nauka',
  special:    'Specjalne',
  habitat:    'Habitat',
  armor:      'Pancerz',
  fuel:       'Paliwo',
  weapon:     'Broń',
};

const CATEGORY_LABELS_EN = {
  propulsion: 'Propulsion',
  cargo:      'Cargo',
  science:    'Science',
  special:    'Special',
  habitat:    'Habitat',
  armor:      'Armor',
  fuel:       'Fuel',
  weapon:     'Weapon',
};

// ══════════════════════════════════════════════════════════════════════════════
// UnitDesignOverlay
// ══════════════════════════════════════════════════════════════════════════════

export class UnitDesignOverlay extends BaseOverlay {
  constructor() {
    super(null);

    // ── Stan designera ──────────────────────────────────────────
    this._selectedHullId = null;     // 'hull_small' | 'hull_medium' | 'hull_large' | null
    this._slotAssignments = [];      // tablica modId|null dopasowana do hull.slots
    this._activeSlotIndex = -1;      // który slot jest aktywny (picker modułów)

    // Szablony
    this._editingTemplateId = null;  // null = nowy, string = edytujemy istniejący
    this._scrollTemplates = 0;
    this._scrollModules = 0;

    // Scroll globalny
    this._scrollLeft = 0;
  }

  // ── BaseOverlay API ───────────────────────────────────────────────────────

  hide() {
    super.hide();
    this._activeSlotIndex = -1;
    this._scrollModules = 0;
  }

  handleScroll(delta, mx, my) {
    if (!this.visible) return false;
    const b = this._bounds;
    if (!b) return false;
    if (mx < b.ox || mx > b.ox + b.ow || my < b.oy || my > b.oy + b.oh) return false;

    const halfW = b.ow / 2;
    if (mx < b.ox + halfW) {
      // Lewa połowa — zawsze scrolluj cały panel
      this._scrollLeft = Math.max(0, this._scrollLeft + delta * 3);
    }
    return true;
  }

  // ── Główna metoda rysowania ───────────────────────────────────────────────

  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    this._bounds = { ox, oy, ow, oh };

    // Tło overlay
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);

    // Podziel na 2 połowy
    const halfW = Math.floor(ow / 2);

    // ── Lewa połowa: PROJEKTOWANIE STATKÓW ─────────────────────
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, halfW, oh);
    ctx.clip();
    this._drawShipDesigner(ctx, ox, oy, halfW, oh);
    ctx.restore();

    // ── Separator pionowy ──────────────────────────────────────
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = DIVIDER_W;
    ctx.beginPath();
    ctx.moveTo(ox + halfW, oy);
    ctx.lineTo(ox + halfW, oy + oh);
    ctx.stroke();

    // ── Prawa połowa: JEDNOSTKI NAZIEMNE (placeholder) ─────────
    this._drawGroundPlaceholder(ctx, ox + halfW, oy, ow - halfW, oh);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHIP DESIGNER (lewa połowa)
  // ═══════════════════════════════════════════════════════════════════════════

  _drawShipDesigner(ctx, x, y, w, h) {
    // Scroll — przesuwamy renderowanie w górę
    let cy = y + PAD - this._scrollLeft;
    const useLang = (window.KOSMOS?.lang ?? 'pl') === 'en';

    // ── Nagłówek ──────────────────────────────────────────────
    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('unitDesign.shipDesign'), x + w / 2, cy + 14);
    ctx.textAlign = 'left';
    cy += HEADER_H;

    // ── Wybór kadłuba ─────────────────────────────────────────
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillText(t('unitDesign.selectHull'), x + PAD, cy + 11);
    cy += 16;

    const hullIds = Object.keys(HULLS);
    const btnW = Math.floor((w - PAD * 2 - (hullIds.length - 1) * 4) / hullIds.length);

    for (let i = 0; i < hullIds.length; i++) {
      const hull = HULLS[hullIds[i]];
      const bx = x + PAD + i * (btnW + 4);
      const isSelected = this._selectedHullId === hull.id;
      const counts = getSlotCounts(hull.id);

      // Tło przycisku
      ctx.fillStyle = isSelected ? THEME.accentMed : THEME.accentDim;
      ctx.fillRect(bx, cy, btnW, HULL_BTN_H);
      ctx.strokeStyle = isSelected ? THEME.borderActive : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, cy + 0.5, btnW - 1, HULL_BTN_H - 1);

      // Ikona + nazwa
      ctx.fillStyle = isSelected ? THEME.accent : THEME.textPrimary;
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${hull.icon} ${getName(hull)}`, bx + btnW / 2, cy + 18);

      // Sloty
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillText(`${counts.propulsion}P + ${counts.utility}U = ${counts.total}`, bx + btnW / 2, cy + 34);
      // Masa
      ctx.fillText(`${hull.baseMass}t`, bx + btnW / 2, cy + 44);
      ctx.textAlign = 'left';

      this._addHit(bx, cy, btnW, HULL_BTN_H, 'select_hull', { hullId: hull.id });
    }
    cy += HULL_BTN_H + PAD;

    // ── Siatka slotów (jeśli kadłub wybrany) ──────────────────
    if (this._selectedHullId) {
      const hull = HULLS[this._selectedHullId];

      // Separator
      this._drawSeparator(ctx, x + PAD, cy, x + w - PAD, cy);
      cy += 4;

      ctx.fillStyle = THEME.textHeader;
      ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.fillText(t('unitDesign.slots'), x + PAD, cy + 11);

      // Licznik
      const filledCount = this._slotAssignments.filter(Boolean).length;
      ctx.fillStyle = THEME.textSecondary;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${filledCount}/${hull.slots.length}`, x + w - PAD, cy + 11);
      ctx.textAlign = 'left';
      cy += 18;

      for (let i = 0; i < hull.slots.length; i++) {
        const slotDef = hull.slots[i];
        const modId = this._slotAssignments[i];
        const mod = modId ? SHIP_MODULES[modId] : null;
        const isActive = this._activeSlotIndex === i;

        const sx = x + PAD;
        const sw = w - PAD * 2;

        // Tło slotu
        ctx.fillStyle = isActive ? THEME.accentMed : (i % 2 === 0 ? 'transparent' : THEME.accentDim);
        ctx.fillRect(sx, cy, sw, SLOT_H);
        if (isActive) {
          ctx.strokeStyle = THEME.borderActive;
          ctx.lineWidth = 1;
          ctx.strokeRect(sx + 0.5, cy + 0.5, sw - 1, SLOT_H - 1);
        }

        // Typ slotu
        const slotLabel = slotDef.type === 'propulsion' ? 'P' : 'U';
        const slotColor = slotDef.type === 'propulsion' ? THEME.warning : THEME.info;
        ctx.fillStyle = slotColor;
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillText(slotLabel, sx + 4, cy + 16);

        // Moduł lub pusty
        if (mod) {
          ctx.fillStyle = THEME.textPrimary;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillText(`${mod.icon} ${getName(mod)}`, sx + 20, cy + 16);

          // Przycisk usunięcia [x]
          const xBtnX = sx + sw - 20;
          ctx.fillStyle = THEME.danger;
          ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillText('✕', xBtnX + 4, cy + 16);
          this._addHit(xBtnX, cy, 20, SLOT_H, 'clear_slot', { index: i });
        } else {
          ctx.fillStyle = THEME.textDim;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          const emptyLabel = slotDef.type === 'propulsion'
            ? t('unitDesign.propulsionSlot')
            : t('unitDesign.utilitySlot');
          ctx.fillText(`  ${emptyLabel}...`, sx + 20, cy + 16);
        }

        this._addHit(sx, cy, sw - 22, SLOT_H, 'select_slot', { index: i });
        cy += SLOT_H;
      }

      cy += 4;

      // ── Picker modułów (jeśli slot aktywny) ────────────────
      if (this._activeSlotIndex >= 0 && this._activeSlotIndex < hull.slots.length) {
        cy = this._drawModulePicker(ctx, x, cy, w, 300, hull);
      }

      // ── Podgląd statystyk ──────────────────────────────────
      cy = this._drawStatsPreview(ctx, x, cy, w);

      // ── Przyciski akcji ────────────────────────────────────
      this._drawSeparator(ctx, x + PAD, cy, x + w - PAD, cy);
      cy += 6;

      const hasEngine = this._slotAssignments.some(id => {
        const m = SHIP_MODULES[id];
        return m && m.slotType === 'propulsion';
      });

      // Przycisk zapisu szablonu
      const saveBtnW = Math.floor((w - PAD * 3) / 2);
      const saveBtnStyle = hasEngine ? 'primary' : 'disabled';
      this._drawButton(ctx, t('unitDesign.saveTemplate'), x + PAD, cy, saveBtnW, 24, saveBtnStyle);
      if (hasEngine) {
        this._addHit(x + PAD, cy, saveBtnW, 24, 'save_template', { label: t('unitDesign.saveTemplate') });
      }

      // Przycisk wyczyść
      this._drawButton(ctx, t('unitDesign.clear'), x + PAD * 2 + saveBtnW, cy, saveBtnW, 24, 'secondary');
      this._addHit(x + PAD * 2 + saveBtnW, cy, saveBtnW, 24, 'clear_design', { label: t('unitDesign.clear') });

      if (!hasEngine) {
        cy += 28;
        ctx.fillStyle = THEME.warning;
        ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
        ctx.fillText(`⚠ ${t('unitDesign.needEngine')}`, x + PAD, cy + 8);
      }

      cy += 30;
    }

    // ── Lista zapisanych szablonów ─────────────────────────────
    this._drawSavedTemplates(ctx, x, cy, w, 999);

    cy += 40; // margines dolny

    // Ogranicz scroll do zakresu treści
    const contentH = (cy + this._scrollLeft) - y;
    const maxScroll = Math.max(0, contentH - h);
    if (this._scrollLeft > maxScroll) this._scrollLeft = maxScroll;
  }

  // ── Picker modułów dla aktywnego slotu ────────────────────────────────────

  _drawModulePicker(ctx, x, cy, w, _maxH, hull) {
    const slotDef = hull.slots[this._activeSlotIndex];
    const isPropulsion = slotDef.type === 'propulsion';
    const techSys = window.KOSMOS?.techSystem;

    this._drawSeparator(ctx, x + PAD, cy, x + w - PAD, cy);
    cy += 4;

    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const pickerLabel = isPropulsion ? t('unitDesign.propulsionSlot') : t('unitDesign.utilitySlot');
    ctx.fillText(`${pickerLabel} — ${t('unitDesign.pickModule')}`, x + PAD, cy + 10);
    cy += 16;

    // Zbierz dostępne moduły wg kategorii
    const modules = Object.values(SHIP_MODULES).filter(m => {
      if (isPropulsion) return m.slotType === 'propulsion';
      return UTILITY_SLOT_TYPES.has(m.slotType);
    });

    // Grupuj wg slotType
    const groups = {};
    for (const m of modules) {
      if (!groups[m.slotType]) groups[m.slotType] = [];
      groups[m.slotType].push(m);
    }

    // Renderuj inline — scroll obsługiwany globalnie przez _scrollLeft
    for (const [cat, mods] of Object.entries(groups)) {
      const useLang = (window.KOSMOS?.lang ?? 'pl') === 'en';
      const catLabel = useLang ? CATEGORY_LABELS_EN[cat] : CATEGORY_LABELS_PL[cat];
      ctx.fillStyle = THEME.textLabel;
      ctx.font = `bold ${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillText(`${CATEGORY_ICONS[cat] ?? ''} ${catLabel ?? cat}`, x + PAD + 4, cy + 10);
      cy += 14;

      for (const mod of mods) {
        const isLocked = mod.requires && !techSys?.isResearched(mod.requires);
        const mx = x + PAD + 8;
        const mw = w - PAD * 2 - 8;

        const isHover = this._hoverZone?.type === 'pick_module' &&
                        this._hoverZone?.data?.moduleId === mod.id;

        ctx.fillStyle = isHover ? THEME.accentDim : 'transparent';
        ctx.fillRect(mx, cy, mw, MOD_ROW_H);

        if (isLocked) {
          ctx.fillStyle = THEME.textDim;
          ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
          ctx.fillText(`🔒 ${mod.icon} ${getName(mod)}`, mx + 4, cy + 15);
        } else {
          ctx.fillStyle = THEME.textPrimary;
          ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
          ctx.fillText(`${mod.icon} ${getName(mod)}`, mx + 4, cy + 15);

          const statTxt = this._moduleStatSummary(mod);
          if (statTxt) {
            ctx.fillStyle = THEME.textSecondary;
            ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
            ctx.textAlign = 'right';
            ctx.fillText(statTxt, x + w - PAD - 4, cy + 15);
            ctx.textAlign = 'left';
          }

          this._addHit(mx, cy, mw, MOD_ROW_H, 'pick_module', { moduleId: mod.id });
        }

        cy += MOD_ROW_H;
      }
    }

    cy += 4;
    return cy;
  }

  // ── Podgląd statystyk aktualnego projektu ─────────────────────────────────

  _drawStatsPreview(ctx, x, cy, w) {
    const hull = HULLS[this._selectedHullId];
    if (!hull) return cy;

    const mods = this._slotAssignments.filter(Boolean);
    if (mods.length === 0) return cy;

    this._drawSeparator(ctx, x + PAD, cy, x + w - PAD, cy);
    cy += 4;

    const stats = calcShipStats(hull, mods);

    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(t('unitDesign.statsPreview'), x + PAD, cy + 10);
    cy += 16;

    const col1 = x + PAD + 4;
    const col2 = x + Math.floor(w / 2);
    const sFont = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;

    ctx.font = sFont;

    // Linia 1: prędkość + zasięg
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`⚡ ${stats.speed.toFixed(1)} AU/y`, col1, cy + 10);
    ctx.fillText(`🎯 ${stats.range.toFixed(0)} AU`, col2, cy + 10);
    cy += 14;

    // Linia 2: cargo + paliwo
    ctx.fillText(`📦 ${stats.cargo}t`, col1, cy + 10);
    ctx.fillText(`⛽ ${stats.fuelCapacity.toFixed(0)} (${stats.fuelType})`, col2, cy + 10);
    cy += 14;

    // Linia 3: masa + przeżywalność
    ctx.fillText(`⚖ ${stats.totalMass.toFixed(0)}t`, col1, cy + 10);
    if (stats.survivalBonus > 0) {
      ctx.fillText(`🛡 +${(stats.survivalBonus * 100).toFixed(0)}%`, col2, cy + 10);
    }
    if (stats.colonistCapacity > 0) {
      ctx.fillText(`🏠 ${stats.colonistCapacity} POP`, col2 + 60, cy + 10);
    }
    cy += 14;

    // Linia 4: koszt (skrócony)
    const costs = calcShipCost(hull, mods);
    const costParts = [];
    for (const [res, qty] of Object.entries(costs.cost)) {
      if (qty > 0) costParts.push(`${RESOURCE_ICONS[res] ?? res}${qty}`);
    }
    if (costParts.length > 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(costParts.join(' '), col1, cy + 10);
      cy += 14;
    }

    cy += 4;
    return cy;
  }

  // ── Lista zapisanych szablonów ────────────────────────────────────────────

  _drawSavedTemplates(ctx, x, cy, w, maxH) {
    this._drawSeparator(ctx, x + PAD, cy, x + w - PAD, cy);
    cy += 4;

    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(t('unitDesign.savedTemplates'), x + PAD, cy + 10);
    cy += 18;

    const templates = window.KOSMOS?.unitDesigns ?? [];
    if (templates.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillText(t('unitDesign.noTemplates'), x + PAD + 4, cy + 10);
      return;
    }

    for (let i = 0; i < templates.length; i++) {
      if (cy + TPL_ROW_H > x + maxH) break;
      const tpl = templates[i];
      const hull = HULLS[tpl.hullId];
      const isHover = this._hoverZone?.type === 'tpl_row' &&
                      this._hoverZone?.data?.index === i;

      ctx.fillStyle = isHover ? THEME.accentDim : (i % 2 === 0 ? 'transparent' : 'rgba(0,255,180,0.02)');
      ctx.fillRect(x + PAD, cy, w - PAD * 2, TPL_ROW_H);

      // Ikona kadłuba + nazwa szablonu
      ctx.fillStyle = THEME.textPrimary;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const hullIcon = hull?.icon ?? '?';
      const modCount = tpl.modules.filter(Boolean).length;
      ctx.fillText(`${hullIcon} ${tpl.name}`, x + PAD + 4, cy + 17);

      // Szybkie staty
      const stats = hull ? calcShipStats(hull, tpl.modules.filter(Boolean)) : null;
      if (stats) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
        ctx.fillText(`${modCount}mod  ⚡${stats.speed.toFixed(1)}  📦${stats.cargo}t`, x + PAD + 150, cy + 17);
      }

      // Przyciski [Edytuj] [Usuń]
      const btnW2 = 42;
      const btnH2 = 18;
      const btnY = cy + 4;
      const editX = x + w - PAD - btnW2 * 2 - 6;
      const delX  = x + w - PAD - btnW2;

      this._drawButton(ctx, t('unitDesign.edit'), editX, btnY, btnW2, btnH2, 'secondary');
      this._addHit(editX, btnY, btnW2, btnH2, 'edit_template', { index: i, label: t('unitDesign.edit') });

      this._drawButton(ctx, t('unitDesign.delete'), delX, btnY, btnW2, btnH2, 'danger');
      this._addHit(delX, btnY, btnW2, btnH2, 'delete_template', { index: i, label: t('unitDesign.delete') });

      this._addHit(x + PAD, cy, w - PAD * 2 - btnW2 * 2 - 12, TPL_ROW_H, 'tpl_row', { index: i });

      cy += TPL_ROW_H;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUND UNITS PLACEHOLDER (prawa połowa)
  // ═══════════════════════════════════════════════════════════════════════════

  _drawGroundPlaceholder(ctx, x, y, w, h) {
    // Nagłówek
    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('unitDesign.groundUnits'), x + w / 2, y + PAD + 14);

    // Placeholder
    ctx.fillStyle = THEME.textDim;
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillText(t('unitDesign.groundPlaceholder'), x + w / 2, y + h / 2);
    ctx.textAlign = 'left';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HIT HANDLING
  // ═══════════════════════════════════════════════════════════════════════════

  _onHit(zone) {
    switch (zone.type) {
      case 'select_hull': {
        const hullId = zone.data.hullId;
        if (this._selectedHullId === hullId) break; // już wybrany
        this._selectedHullId = hullId;
        const hull = HULLS[hullId];
        this._slotAssignments = new Array(hull.slots.length).fill(null);
        this._activeSlotIndex = -1;
        this._editingTemplateId = null;
        this._scrollModules = 0;
        break;
      }

      case 'select_slot': {
        const idx = zone.data.index;
        this._activeSlotIndex = this._activeSlotIndex === idx ? -1 : idx;
        this._scrollModules = 0;
        break;
      }

      case 'clear_slot': {
        const idx = zone.data.index;
        this._slotAssignments[idx] = null;
        if (this._activeSlotIndex === idx) this._activeSlotIndex = -1;
        break;
      }

      case 'pick_module': {
        const modId = zone.data.moduleId;
        if (this._activeSlotIndex >= 0) {
          this._slotAssignments[this._activeSlotIndex] = modId;
          // Przejdź do następnego pustego slotu tego samego typu lub zamknij
          this._advanceToNextSlot();
        }
        break;
      }

      case 'save_template': {
        this._saveTemplate();
        break;
      }

      case 'clear_design': {
        if (this._selectedHullId) {
          const hull = HULLS[this._selectedHullId];
          this._slotAssignments = new Array(hull.slots.length).fill(null);
          this._activeSlotIndex = -1;
          this._editingTemplateId = null;
        }
        break;
      }

      case 'edit_template': {
        const tpl = (window.KOSMOS?.unitDesigns ?? [])[zone.data.index];
        if (tpl) this._loadTemplate(tpl);
        break;
      }

      case 'delete_template': {
        const templates = window.KOSMOS?.unitDesigns;
        if (templates && zone.data.index < templates.length) {
          templates.splice(zone.data.index, 1);
        }
        break;
      }
    }
  }

  // ── Logika zapisu szablonu ────────────────────────────────────────────────

  async _saveTemplate() {
    const hull = HULLS[this._selectedHullId];
    if (!hull) return;

    // Domyślna nazwa
    const defaultName = this._editingTemplateId
      ? (window.KOSMOS?.unitDesigns?.find(t => t.id === this._editingTemplateId)?.name ?? getName(hull))
      : getName(hull);

    const name = await showRenameModal(defaultName);
    if (!name) return;

    const templates = window.KOSMOS?.unitDesigns;
    if (!templates) return;

    const modules = [...this._slotAssignments];

    if (this._editingTemplateId) {
      // Aktualizacja istniejącego
      const existing = templates.find(t => t.id === this._editingTemplateId);
      if (existing) {
        existing.name = name;
        existing.hullId = this._selectedHullId;
        existing.modules = modules;
      }
    } else {
      // Nowy szablon
      const id = `ud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      templates.push({
        id,
        name,
        hullId: this._selectedHullId,
        modules,
      });
    }

    // Reset po zapisie
    this._editingTemplateId = null;
  }

  // ── Ładowanie szablonu do edycji ──────────────────────────────────────────

  _loadTemplate(tpl) {
    const hull = HULLS[tpl.hullId];
    if (!hull) return;

    this._selectedHullId = tpl.hullId;
    // Dopasuj tablicę slotów do rozmiaru kadłuba
    this._slotAssignments = new Array(hull.slots.length).fill(null);
    for (let i = 0; i < Math.min(tpl.modules.length, hull.slots.length); i++) {
      this._slotAssignments[i] = tpl.modules[i] ?? null;
    }
    this._editingTemplateId = tpl.id;
    this._activeSlotIndex = -1;
  }

  // ── Przejdź do następnego pustego slotu ───────────────────────────────────

  _advanceToNextSlot() {
    const hull = HULLS[this._selectedHullId];
    if (!hull) { this._activeSlotIndex = -1; return; }

    const currentType = hull.slots[this._activeSlotIndex]?.type;

    // Szukaj następnego pustego slotu tego samego typu
    for (let i = this._activeSlotIndex + 1; i < hull.slots.length; i++) {
      if (hull.slots[i].type === currentType && !this._slotAssignments[i]) {
        this._activeSlotIndex = i;
        return;
      }
    }
    // Szukaj od początku
    for (let i = 0; i < this._activeSlotIndex; i++) {
      if (hull.slots[i].type === currentType && !this._slotAssignments[i]) {
        this._activeSlotIndex = i;
        return;
      }
    }
    // Brak pustych — zamknij picker
    this._activeSlotIndex = -1;
  }

  // ── Krótkie podsumowanie statów modułu (do prawej strony wiersza) ─────────

  _moduleStatSummary(mod) {
    const parts = [];
    const s = mod.stats;
    if (s.speedMult != null && s.speedMult !== 1.0) parts.push(`×${s.speedMult} spd`);
    if (s.cargoAdd)            parts.push(`+${s.cargoAdd}t`);
    if (s.fuelCapacityAdd)     parts.push(`+${s.fuelCapacityAdd} fuel`);
    if (s.discoveryBonus)      parts.push(`+${(s.discoveryBonus * 100).toFixed(0)}% disc`);
    if (s.colonistCapacity)    parts.push(`${s.colonistCapacity} POP`);
    if (s.survivalBonus)       parts.push(`+${(s.survivalBonus * 100).toFixed(0)}% surv`);
    if (s.attackPower)         parts.push(`⚔${s.attackPower}`);
    if (s.fuelMult != null && s.fuelMult !== 1.0) parts.push(`×${s.fuelMult} fuel/AU`);
    return parts.join('  ');
  }
}
