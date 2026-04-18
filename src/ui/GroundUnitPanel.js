// GroundUnitPanel — panel katalogu + rekrutacji jednostek naziemnych
//
// Renderuje PRAWĄ POŁOWĘ UnitDesignOverlay (lewa = ship designer).
// Nie dziedziczy po BaseOverlay — jest komponentem delegowanym przez parent overlay.
//
// Hit zones przekazywane przez parent (prefix 'ground:') dla dispatchu kliknięć.
// Hover tooltipy czytane z parent._hoverZone (po `startsWith('ground:')`).
//
// Komunikacja:
//   - window.KOSMOS.colonyManager.getActiveColony()     → aktywna kolonia
//   - window.KOSMOS.colonyManager.startGroundUnitBuild() → uruchom rekrutację
//   - EventBus: brak bezpośrednich emitów (manager emituje za nas)

import { THEME }                    from '../config/ThemeConfig.js';
import { UNIT_ARCHETYPES }          from '../data/unitArchetypes.js';
import { GROUND_ABILITIES }         from '../data/groundAbilities.js';
import { HUMANITY_UNITS }           from '../data/factions/humanity.js';
import { GroundUnitFactory }        from '../systems/GroundUnitFactory.js';
import { t, getLocale }             from '../i18n/i18n.js';

// ── Layout constants ──────────────────────────────────────────
const PAD            = 8;
const HEADER_H       = 28;
const COLONY_INFO_H  = 22;
const TILES_ROW_H    = 68;
const SPRITE_SIZE    = 92;
const STATS_LINE_H   = 18;
const COST_H         = 22;
const ACTIONS_H      = 30;

const DEFAULT_ARCHETYPE = 'shock_infantry';

// Emoji fallback icons per archetype (gdy sprite jeszcze ładuje lub brak PNG)
const ARCHETYPE_ICONS = {
  shock_infantry:   '🪖',
  rocket_artillery: '🚀',
  garrison_unit:    '🛡',
  aa_platform:      '🎯',
  medic_unit:       '⚕',
  recon_drone:      '🛰',
};

// Ikony statystyk
const STAT_ICONS = { hp: '❤', ac: '🛡', dmg: '⚔', rng: '🎯', mov: '👣' };

// Krótkie nazwy dla badge'ów counter/tile
const ARCHETYPE_SHORT = {
  shock_infantry:   'SHOCK',
  rocket_artillery: 'ROCKET',
  garrison_unit:    'GARR',
  aa_platform:      'AA',
  medic_unit:       'MEDIC',
  recon_drone:      'DRONE',
};

// ══════════════════════════════════════════════════════════════
// GroundUnitPanel
// ══════════════════════════════════════════════════════════════

export class GroundUnitPanel {
  /**
   * @param {Object} deps
   * @param {Function} deps.addHit      — (x,y,w,h,type,data) → dodaje hit do parent'a z prefix 'ground:'
   * @param {Function} deps.getHoverZone — () → parent._hoverZone (do tooltipów)
   * @param {Function} deps.getMouse    — () → {x, y} aktualna pozycja kursora
   */
  constructor({ addHit, getHoverZone, getMouse }) {
    this._addHit       = addHit;
    this._getHoverZone = getHoverZone ?? (() => null);
    this._getMouse     = getMouse ?? (() => ({ x: 0, y: 0 }));

    this._selectedArchetypeId = DEFAULT_ARCHETYPE;
    this._selectedFactionId   = 'humanity';     // faction selector ukryty do unlocku
    this._scrollRight         = 0;
    this._sprites             = new Map();       // archetypeId → HTMLImageElement
    this._recruitToast        = null;            // { text, success, expireAt }

    this._loadSprites();
  }

  _loadSprites() {
    for (const [archetypeId, def] of Object.entries(HUMANITY_UNITS)) {
      const img = GroundUnitFactory.loadUnitSprite(def.sprite);
      this._sprites.set(archetypeId, img);
    }
  }

  // ── Helpery języka ───────────────────────────────────────────

  _isEn() { return getLocale() === 'en'; }

  _archDesc(arch) {
    return this._isEn() ? (arch.descriptionEN ?? arch.id) : (arch.descriptionPL ?? arch.id);
  }

  _abilityName(ab) {
    return this._isEn() ? (ab.nameEN ?? ab.id) : (ab.namePL ?? ab.id);
  }

  _abilityDesc(ab) {
    return this._isEn() ? (ab.descriptionEN ?? '') : (ab.descriptionPL ?? '');
  }

  _shortName(archId) {
    return ARCHETYPE_SHORT[archId] ?? archId.toUpperCase().slice(0, 6);
  }

  // ── Helpery gameplay ─────────────────────────────────────────

  _getActiveColony() {
    return window.KOSMOS?.colonyManager?.getActiveColony?.() ?? null;
  }

  _getRecruitCost() {
    return { minerals: 50, energy: 20 };
  }

  _canAfford(colony) {
    if (!colony?.resourceSystem?.canAfford) return false;
    return colony.resourceSystem.canAfford(this._getRecruitCost());
  }

  _hoverTypeIs(normalizedType) {
    const hz = this._getHoverZone();
    return hz?.type === `ground:${normalizedType}`;
  }

  _hoverMatches(normalizedType, predicate) {
    const hz = this._getHoverZone();
    if (hz?.type !== `ground:${normalizedType}`) return false;
    return predicate(hz.data ?? {});
  }

  // ══════════════════════════════════════════════════════════════
  // MAIN DRAW
  // ══════════════════════════════════════════════════════════════

  draw(ctx, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();

    let cy = y + PAD;
    cy = this._drawHeader(ctx, x, cy, w);
    cy = this._drawColonyInfo(ctx, x, cy, w);

    this._drawSep(ctx, x + PAD, cy, w - PAD * 2);
    cy += 6;

    cy = this._drawArchetypeTiles(ctx, x, cy, w);

    this._drawSep(ctx, x + PAD, cy, w - PAD * 2);
    cy += 6;

    // Detail view — clipped with scroll
    const bottomReservedH = COST_H + ACTIONS_H + PAD * 2;
    const detailTop = cy;
    const detailH   = y + h - bottomReservedH - detailTop;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, detailTop, w, detailH);
    ctx.clip();
    this._drawDetail(ctx, x, detailTop - this._scrollRight, w);
    ctx.restore();

    // Fixed bottom area
    const bottomY = y + h - bottomReservedH;
    this._drawSep(ctx, x + PAD, bottomY, w - PAD * 2);
    this._drawCostRow(ctx, x, bottomY + 4, w);
    this._drawActions(ctx, x, bottomY + COST_H + 6, w);

    ctx.restore();

    // Tooltip draws poza clip'em głównego panelu (może wystawać)
    this._drawTooltip(ctx, x, y, w, h);
  }

  // ── Sekcje ───────────────────────────────────────────────────

  _drawHeader(ctx, x, cy, w) {
    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(t('groundPanel.title'), x + w / 2, cy + 14);
    ctx.textAlign = 'left';
    return cy + HEADER_H;
  }

  _drawColonyInfo(ctx, x, cy, w) {
    const colony = this._getActiveColony();
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;

    if (colony) {
      const label = `${t('groundPanel.colony')}: `;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(label, x + PAD, cy + 14);
      const lblW = ctx.measureText(label).width;
      ctx.fillStyle = THEME.textPrimary;
      ctx.fillText(colony.name ?? '?', x + PAD + lblW, cy + 14);

      const pop = Math.floor(colony.civSystem?.population ?? 0);
      ctx.fillStyle = THEME.textDim;
      ctx.textAlign = 'right';
      ctx.fillText(`${pop} POP`, x + w - PAD, cy + 14);
      ctx.textAlign = 'left';
    } else {
      ctx.fillStyle = THEME.warning;
      ctx.fillText(t('groundPanel.noColony'), x + PAD, cy + 14);
    }

    return cy + COLONY_INFO_H;
  }

  _drawArchetypeTiles(ctx, x, cy, w) {
    const arches = Object.keys(UNIT_ARCHETYPES);
    const count  = arches.length;
    const gap    = 6;
    const available = w - PAD * 2 - gap * (count - 1);
    const tileW  = Math.floor(available / count);
    const tileH  = TILES_ROW_H - 6;

    for (let i = 0; i < count; i++) {
      const archId = arches[i];
      const override = HUMANITY_UNITS[archId] ?? {};
      const tx = x + PAD + i * (tileW + gap);
      const ty = cy;
      const isSelected = this._selectedArchetypeId === archId;
      const isHover = this._hoverMatches('select_tile', d => d.archetypeId === archId);

      // Tło + border
      ctx.fillStyle = isSelected ? 'rgba(0, 255, 180, 0.15)' :
                      (isHover   ? 'rgba(0, 255, 180, 0.05)' : 'rgba(0, 0, 0, 0.25)');
      ctx.fillRect(tx, ty, tileW, tileH);
      ctx.strokeStyle = isSelected ? THEME.accent : THEME.border;
      ctx.lineWidth   = isSelected ? 1.5 : 1;
      ctx.strokeRect(tx + 0.5, ty + 0.5, tileW - 1, tileH - 1);

      // Sprite (lub placeholder)
      const img = this._sprites.get(archId);
      const spriteSize = tileH - 18;
      if (img?.complete && img.naturalWidth > 0) {
        const sx = tx + (tileW - spriteSize) / 2;
        const sy = ty + 3;
        ctx.drawImage(img, sx, sy, spriteSize, spriteSize);
      }

      // Ikona overlay (top-left)
      ctx.fillStyle = THEME.textPrimary;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillText(ARCHETYPE_ICONS[archId] ?? '?', tx + 3, ty + 12);

      // Short label (bottom)
      ctx.fillStyle = isSelected ? THEME.accent : THEME.textSecondary;
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(this._shortName(archId), tx + tileW / 2, ty + tileH - 4);
      ctx.textAlign = 'left';

      this._addHit(tx, ty, tileW, tileH, 'select_tile', { archetypeId: archId });
    }

    return cy + TILES_ROW_H;
  }

  _drawDetail(ctx, x, cy, w) {
    const archId   = this._selectedArchetypeId;
    const arch     = UNIT_ARCHETYPES[archId];
    if (!arch) return cy;
    const override = HUMANITY_UNITS[archId] ?? {};
    const color    = override.color ?? '#94A3B8';

    // ── Title (name + role badge) ──
    const name = (override.name ?? archId).toUpperCase();
    ctx.fillStyle = THEME.textHeader;
    ctx.font = `bold ${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillText(`${ARCHETYPE_ICONS[archId] ?? ''} ${name}`, x + PAD, cy + 14);

    const roleLabel = t(`groundPanel.role.${arch.role}`);
    ctx.fillStyle = color;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'right';
    ctx.fillText(roleLabel, x + w - PAD, cy + 14);
    ctx.textAlign = 'left';
    cy += 20;

    // ── Description (wrap) ──
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const descLines = this._wrapText(ctx, this._archDesc(arch), w - PAD * 2);
    for (const line of descLines) {
      ctx.fillText(line, x + PAD, cy + 12);
      cy += 14;
    }
    cy += 8;

    // ── Sprite (big) + Stats (side-by-side) ──
    const spriteX = x + PAD;
    const spriteY = cy;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(spriteX, spriteY, SPRITE_SIZE, SPRITE_SIZE);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(spriteX + 0.5, spriteY + 0.5, SPRITE_SIZE - 1, SPRITE_SIZE - 1);

    const img = this._sprites.get(archId);
    if (img?.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, spriteX + 2, spriteY + 2, SPRITE_SIZE - 4, SPRITE_SIZE - 4);
    }

    // Stats grid (po prawej od sprite'a)
    const statsX = spriteX + SPRITE_SIZE + 14;
    let statY = spriteY;
    const stats = [
      ['hp',  arch.baseStats.hp],
      ['ac',  arch.baseStats.ac],
      ['dmg', arch.baseStats.dmg],
      ['rng', arch.baseStats.rng],
      ['mov', arch.baseStats.mov],
    ];

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    for (const [key, val] of stats) {
      const isHover = this._hoverMatches('stat_hover', d => d.statKey === key);
      if (isHover) {
        ctx.fillStyle = 'rgba(0, 255, 180, 0.08)';
        ctx.fillRect(statsX - 2, statY, w - PAD - (statsX - x) + 2, STATS_LINE_H);
      }
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(STAT_ICONS[key], statsX, statY + 12);
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t(`groundPanel.stat.${key}`), statsX + 18, statY + 12);
      ctx.fillStyle = THEME.textPrimary;
      ctx.textAlign = 'right';
      ctx.fillText(String(val), x + w - PAD, statY + 12);
      ctx.textAlign = 'left';

      this._addHit(statsX, statY, w - PAD - (statsX - x), STATS_LINE_H, 'stat_hover', { statKey: key });
      statY += STATS_LINE_H;
    }

    cy = Math.max(cy + SPRITE_SIZE, statY) + 10;

    // ── Ability ──
    if (arch.ability) {
      const ab = GROUND_ABILITIES[arch.ability];
      if (ab) {
        ctx.fillStyle = THEME.textLabel;
        ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillText(t('groundPanel.ability'), x + PAD, cy + 10);
        cy += 14;

        const typeLabel = ab.type === 'active'
          ? t('groundPanel.ability.active')
          : t('groundPanel.ability.passive');
        const cdLabel   = ab.cooldown > 0 ? ` · ${t('groundPanel.ability.cooldown')} ${ab.cooldown}` : '';

        // Hover highlight dla całego wiersza zdolności
        const isHover = this._hoverMatches('ability_hover', d => d.abilityId === ab.id);
        if (isHover) {
          ctx.fillStyle = 'rgba(0, 255, 180, 0.08)';
          ctx.fillRect(x + PAD - 2, cy, w - PAD * 2 + 4, 16);
        }

        ctx.fillStyle = THEME.accent;
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillText(`▸ ${this._abilityName(ab)}`, x + PAD, cy + 12);

        ctx.fillStyle = THEME.textDim;
        ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
        ctx.textAlign = 'right';
        ctx.fillText(`[${typeLabel}${cdLabel}]`, x + w - PAD, cy + 12);
        ctx.textAlign = 'left';

        this._addHit(x + PAD, cy, w - PAD * 2, 16, 'ability_hover', { abilityId: ab.id });
        cy += 20;
      }
    }

    // ── Counters + CounteredBy ──
    if (arch.counters?.length > 0 || arch.counteredBy?.length > 0) {
      cy += 2;
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;

      if (arch.counters.length > 0) {
        ctx.fillStyle = THEME.textLabel;
        ctx.fillText(t('groundPanel.counters'), x + PAD, cy + 10);
        let badgeX = x + PAD + 90;
        for (const cid of arch.counters) {
          badgeX = this._drawCounterBadge(ctx, badgeX, cy + 1, cid, true);
        }
        cy += 18;
      }

      if (arch.counteredBy.length > 0) {
        ctx.fillStyle = THEME.textLabel;
        ctx.fillText(t('groundPanel.counteredBy'), x + PAD, cy + 10);
        let badgeX = x + PAD + 90;
        for (const cid of arch.counteredBy) {
          badgeX = this._drawCounterBadge(ctx, badgeX, cy + 1, cid, false);
        }
        cy += 18;
      }
    }

    // ── Special Rules ──
    if (arch.specialRules?.length > 0) {
      cy += 4;
      ctx.fillStyle = THEME.textLabel;
      ctx.font = `bold ${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      ctx.fillText(t('groundPanel.rules'), x + PAD, cy + 10);
      cy += 14;

      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
      for (const rule of arch.specialRules) {
        const lines = this._wrapText(ctx, `• ${rule}`, w - PAD * 2 - 8);
        for (const line of lines) {
          ctx.fillText(line, x + PAD + 4, cy + 10);
          cy += 12;
        }
      }
    }

    return cy;
  }

  /** Rysuj badge counter/counteredBy, zwróć nowy X po badge'u. */
  _drawCounterBadge(ctx, bx, by, archId, isCounter) {
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    const label = this._shortName(archId) + (isCounter ? ' +30%' : '');
    const bw = ctx.measureText(label).width + 12;
    const bh = 14;

    const bgColor     = isCounter ? 'rgba(60, 170, 80, 0.18)'   : 'rgba(216, 90, 48, 0.18)';
    const borderColor = isCounter ? 'rgba(109, 209, 122, 0.6)'  : 'rgba(216, 90, 48, 0.55)';
    const textColor   = isCounter ? '#9ee4a6'                   : '#e9b19c';

    const isHover = this._hoverMatches('counter_hover', d => d.archetypeId === archId && d.isCounter === isCounter);

    ctx.fillStyle = isHover ? borderColor : bgColor;
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.fillStyle = isHover ? '#fff' : textColor;
    ctx.fillText(label, bx + 6, by + 10);

    this._addHit(bx, by, bw, bh, 'counter_hover', { archetypeId: archId, isCounter });
    return bx + bw + 4;
  }

  _drawCostRow(ctx, x, cy, w) {
    const cost = this._getRecruitCost();
    const colony = this._getActiveColony();
    const canAfford = this._canAfford(colony);

    ctx.fillStyle = THEME.textLabel;
    ctx.font = `bold ${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    ctx.fillText(t('groundPanel.cost'), x + PAD, cy + 12);

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = canAfford || !colony ? THEME.textPrimary : THEME.danger;
    const costText = `⛏ ${cost.minerals}   ⚡ ${cost.energy}   ⏱ 1.0 ${t('groundPanel.year')}`;
    ctx.textAlign = 'right';
    ctx.fillText(costText, x + w - PAD, cy + 12);
    ctx.textAlign = 'left';
  }

  _drawActions(ctx, x, cy, w) {
    const colony = this._getActiveColony();
    const canAfford = this._canAfford(colony);
    const canRecruit = !!colony && canAfford;

    const btnW = Math.floor((w - PAD * 3) * 0.66);
    const btnH = 24;

    const style = canRecruit ? 'primary' : 'disabled';
    const label = !colony
      ? t('groundPanel.recruitDisabled')
      : (canAfford ? t('groundPanel.recruit') : t('groundPanel.cannotAfford'));

    this._drawButton(ctx, label, x + PAD, cy, btnW, btnH, style);
    if (canRecruit) {
      this._addHit(x + PAD, cy, btnW, btnH, 'recruit', { archetypeId: this._selectedArchetypeId });
    }

    // Queue badge (right)
    const queueX = x + PAD * 2 + btnW;
    const queueW = w - PAD * 3 - btnW;
    const queueCount = colony?.groundUnitQueues?.length ?? 0;
    this._drawButton(ctx, `📋 ${t('groundPanel.queue')} ${queueCount}`, queueX, cy, queueW, btnH, 'secondary');

    // Toast (transient feedback nad przyciskami)
    this._drawToast(ctx, x, cy - 22, w);
  }

  _drawToast(ctx, x, cy, w) {
    if (!this._recruitToast) return;
    const now = Date.now();
    if (now > this._recruitToast.expireAt) {
      this._recruitToast = null;
      return;
    }
    const opacity = Math.min(1, (this._recruitToast.expireAt - now) / 1500);
    const color = this._recruitToast.success ? THEME.accent : THEME.danger;

    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(this._recruitToast.text, x + w / 2, cy + 14);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // ── Low-level helpers ────────────────────────────────────────

  _drawButton(ctx, label, x, y, w, h, style = 'secondary') {
    const S = {
      primary:   { b: THEME.accent,      t: THEME.accent,        bg: 'rgba(0, 255, 180, 0.10)' },
      secondary: { b: THEME.borderLight, t: THEME.textSecondary, bg: 'rgba(255, 255, 255, 0.02)' },
      disabled:  { b: THEME.border,      t: THEME.textDim,       bg: 'transparent' },
    }[style] ?? { b: THEME.border, t: THEME.textDim, bg: 'transparent' };

    ctx.fillStyle = S.bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = S.b;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.fillStyle = S.t;
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 4);
    ctx.textAlign = 'left';
  }

  _drawSep(ctx, x, y, w) {
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 0.5);
    ctx.lineTo(x + w, y + 0.5);
    ctx.stroke();
  }

  _wrapText(ctx, text, maxWidth) {
    const words = (text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ══════════════════════════════════════════════════════════════
  // TOOLTIPS
  // ══════════════════════════════════════════════════════════════

  _drawTooltip(ctx, x, y, w, h) {
    const hz = this._getHoverZone();
    if (!hz || !hz.type?.startsWith('ground:')) return;

    const type = hz.type.slice(7); // strip 'ground:'
    const data = hz.data ?? {};

    let title = '';
    let body  = '';

    if (type === 'select_tile') {
      const arch     = UNIT_ARCHETYPES[data.archetypeId];
      const override = HUMANITY_UNITS[data.archetypeId] ?? {};
      if (!arch) return;
      title = override.name ?? data.archetypeId;
      body  = this._archDesc(arch);
    } else if (type === 'stat_hover') {
      title = t(`groundPanel.stat.${data.statKey}`);
      body  = t(`groundPanel.stat.${data.statKey}.full`);
    } else if (type === 'ability_hover') {
      const ab = GROUND_ABILITIES[data.abilityId];
      if (!ab) return;
      title = this._abilityName(ab);
      body  = this._abilityDesc(ab);
    } else if (type === 'counter_hover') {
      const arch     = UNIT_ARCHETYPES[data.archetypeId];
      const override = HUMANITY_UNITS[data.archetypeId] ?? {};
      if (!arch) return;
      title = `${override.name ?? data.archetypeId}  ${data.isCounter ? '(+30% DMG)' : '(−30% DMG)'}`;
      body  = this._archDesc(arch);
    } else {
      return;
    }

    this._drawTooltipBox(ctx, title, body, x, y, w, h);
  }

  _drawTooltipBox(ctx, title, body, panelX, panelY, panelW, panelH) {
    const mouse   = this._getMouse();
    const maxW    = 260;
    const padX    = 10;
    const padY    = 8;

    // Szerokość wrap'a body w font tiny
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    const bodyLines = this._wrapText(ctx, body, maxW - padX * 2);

    // Zmierz najszerszy wiersz body (tiny font)
    let maxBodyW = 0;
    for (const line of bodyLines) {
      maxBodyW = Math.max(maxBodyW, ctx.measureText(line).width);
    }

    // Zmierz title w innym fontie (small bold)
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const titleW = ctx.measureText(title).width;

    // Ramka dopasowana do najszerszego elementu (title lub najdłuższa linia body)
    const contentW = Math.max(titleW, maxBodyW);
    const boxW = Math.min(maxW, Math.max(contentW + padX * 2, 140));
    const boxH = padY + 16 + bodyLines.length * 13 + padY;

    // Pozycja — cursor + offset, clamp do panelu
    let bx = mouse.x + 14;
    let by = mouse.y + 14;
    if (bx + boxW > panelX + panelW) bx = mouse.x - boxW - 14;
    if (by + boxH > panelY + panelH) by = panelY + panelH - boxH - 4;
    if (bx < panelX + 2) bx = panelX + 2;
    if (by < panelY + 2) by = panelY + 2;

    // Tło
    ctx.fillStyle = 'rgba(10, 16, 22, 0.95)';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = THEME.accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    // Title
    ctx.fillStyle = THEME.accent;
    ctx.font = `bold ${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillText(title, bx + padX, by + padY + 12);

    // Body
    ctx.fillStyle = THEME.textSecondary;
    ctx.font = `${THEME.fontSizeTiny}px ${THEME.fontFamily}`;
    let ly = by + padY + 28;
    for (const line of bodyLines) {
      ctx.fillText(line, bx + padX, ly);
      ly += 13;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PUBLIC API (woła UnitDesignOverlay)
  // ══════════════════════════════════════════════════════════════

  /** Scroll dla detail view. */
  handleScroll(delta, _mx, _my) {
    this._scrollRight = Math.max(0, this._scrollRight + delta * 3);
    return true;
  }

  /** Obsługa kliknięcia w hit zone (type bez prefixu 'ground:'). */
  onHit(type, data) {
    if (type === 'select_tile') {
      this._selectedArchetypeId = data.archetypeId;
      this._scrollRight = 0;
      return true;
    }
    if (type === 'recruit') {
      this._doRecruit();
      return true;
    }
    // stat_hover / ability_hover / counter_hover — tylko hover, ignoruj kliknięcia
    return false;
  }

  _doRecruit() {
    const colony = this._getActiveColony();
    if (!colony) return;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.startGroundUnitBuild) {
      console.warn('[GroundUnitPanel] ColonyManager.startGroundUnitBuild not available');
      return;
    }

    const result = colMgr.startGroundUnitBuild(
      colony.planetId,
      this._selectedArchetypeId,
      this._selectedFactionId,
    );

    if (result?.ok) {
      this._recruitToast = {
        text:    t('groundPanel.buildSuccess'),
        success: true,
        expireAt: Date.now() + 2000,
      };
    } else {
      const reason = result?.reason ? `: ${result.reason}` : '';
      this._recruitToast = {
        text:    t('groundPanel.buildFailed') + reason,
        success: false,
        expireAt: Date.now() + 2500,
      };
    }
  }

  /** Reset stanu przy zamknięciu overlaya. */
  hide() {
    this._scrollRight = 0;
    this._recruitToast = null;
  }
}
