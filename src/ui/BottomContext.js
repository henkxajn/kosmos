// BottomContext — kontekstowy dolny panel (120px) widoczny gdy encja zaznaczona
//
// Zastępuje InfoPanel (prawy bok). Slide-up/slide-down animacja.
// Zakładki: ORBITA | FIZYKA | SKŁAD
// Lewo: nazwa + typ + dane orbitalne
// Centrum: treść zakładki
// Prawo: przycisk akcji + podsumowanie złóż

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { DistanceUtils }  from '../utils/DistanceUtils.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { showRenameModal } from '../ui/ModalInput.js';
import EventBus            from '../core/EventBus.js';
import { CIV_SIDEBAR_W }  from '../ui/CivPanelDrawer.js';
import { t }              from '../i18n/i18n.js';

const CTX_H   = COSMIC.BOTTOM_CTX_H; // 120px
const BAR_H   = COSMIC.BOTTOM_BAR_H; // 30px
const OUTLINER_W = COSMIC.OUTLINER_W; // 180px
const ANIM_SPEED = 0.12; // prędkość animacji slide (0→1)

const C = {
  get bg()     { return THEME.bgPrimary; },
  get border() { return THEME.border; },
  get title()  { return THEME.accent; },
  get label()  { return THEME.textLabel; },
  get text()   { return THEME.textSecondary; },
  get bright() { return THEME.textPrimary; },
  get green()  { return THEME.success; },
  get red()    { return THEME.danger; },
  get orange() { return THEME.warning; },
  get yellow() { return THEME.yellow; },
  get blue()   { return THEME.info; },
  get dim()    { return THEME.textDim; },
};

function _fmtNum(n) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

function _truncate(str, maxLen) {
  if (!str) return '';
  return str.length <= maxLen ? str : str.slice(0, maxLen - 1) + '…';
}

// Formatuj atmosferę z etykietą PL + info o zdatności do życia
function _formatAtmosphere(entity) {
  const atm = entity.atmosphere || 'none';
  const label = t(`atmosphere.${atm}`);
  if (atm === 'breathable') return label + ' ' + t('atmosphere.habitable');
  if (entity.breathableAtmosphere) return label + ' ' + t('atmosphere.habitable');
  return label;
}

export class BottomContext {
  constructor() {
    this._tab         = 'orbit'; // 'orbit' | 'physics' | 'composition'
    this._scrollY     = 0;       // scroll offset treści
    this._slideProgress = 0;     // animacja 0=ukryty, 1=widoczny
    this._prevEntity  = null;    // poprzednia encja (do detekcji zmiany)
  }

  // Lewy offset — nie nachodzić na sidebar w civMode
  _leftX() {
    return window.KOSMOS?.civMode ? CIV_SIDEBAR_W : 0;
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, entity) {
    // Animacja slide-up/down
    if (entity) {
      this._slideProgress = Math.min(1, this._slideProgress + ANIM_SPEED);
    } else {
      this._slideProgress = Math.max(0, this._slideProgress - ANIM_SPEED);
    }
    if (this._slideProgress <= 0) return;

    // Reset scrolla przy zmianie encji
    if (entity !== this._prevEntity) {
      this._scrollY = 0;
      if (entity && !entity.composition && this._tab === 'composition') {
        this._tab = 'orbit';
      }
      this._prevEntity = entity;
    }

    const lx = this._leftX();
    const panelW = W - OUTLINER_W - lx;
    const panelH = Math.round(CTX_H * this._slideProgress);
    const panelY = H - BAR_H - panelH;

    // Tło
    ctx.fillStyle = bgAlpha(0.42);
    ctx.fillRect(lx, panelY, panelW, panelH);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, panelY); ctx.lineTo(lx + panelW, panelY); ctx.stroke();
    // Prawa krawędź (oddzielenie od Outlinera)
    ctx.beginPath(); ctx.moveTo(lx + panelW, panelY); ctx.lineTo(lx + panelW, panelY + panelH); ctx.stroke();

    if (!entity || this._slideProgress < 0.3) return;

    // Clipping do panelu
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, panelY, panelW, panelH);
    ctx.clip();

    const sectionW = Math.floor(panelW / 3);

    // ── Lewo (33%): Nagłówek encji ──
    this._drawEntityHeader(ctx, lx, panelY, sectionW, panelH, entity);

    // Separator pionowy
    ctx.strokeStyle = C.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx + sectionW, panelY + 8); ctx.lineTo(lx + sectionW, panelY + panelH - 8); ctx.stroke();

    // ── Centrum (33%): Zakładki + treść ──
    this._drawTabContent(ctx, lx + sectionW, panelY, sectionW, panelH, entity);

    // Separator pionowy
    ctx.beginPath(); ctx.moveTo(lx + sectionW * 2, panelY + 8); ctx.lineTo(lx + sectionW * 2, panelY + panelH - 8); ctx.stroke();

    // ── Prawo (33%): Akcje + złoża ──
    this._drawActionSection(ctx, lx + sectionW * 2, panelY, panelW - sectionW * 2, panelH, entity);

    ctx.restore();
  }

  // ── Sekcja lewa: nagłówek encji ─────────────────────────
  _drawEntityHeader(ctx, x, y, w, h, entity) {
    const PAD = 10;

    // Nazwa
    ctx.font = `${THEME.fontSizeLarge}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.textAlign = 'left';
    ctx.fillText(_truncate(entity.name, 22), x + PAD, y + 20);

    // Przycisk rename ✏
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText('✏', x + w - 22, y + 20);

    // Typ
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    const typeLabel = entity.type === 'star'
      ? `${entity.spectralType ?? '?'}-type star`
      : (entity.planetType ?? entity.type ?? '—');
    ctx.fillText(typeLabel, x + PAD, y + 34);

    // Kluczowe dane — gwiazda vs ciało orbitalne
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.text;
    let ly = y + 50;
    if (entity.type === 'star') {
      // Dane gwiazdy: masa, luminosity, temperatura, HZ
      ctx.fillText(`${t('context.mass')}: ${(entity.physics?.mass ?? 0).toFixed(2)} M☉`, x + PAD, ly); ly += 14;
      ctx.fillText(`L: ${(entity.luminosity ?? 0).toFixed(2)} L☉`, x + PAD, ly); ly += 14;
      ctx.fillText(`T: ${(entity.temperature ?? 0).toLocaleString()} K`, x + PAD, ly); ly += 14;
      const hz = entity.habitableZone;
      if (hz) ctx.fillText(`HZ: ${hz.min.toFixed(2)}–${hz.max.toFixed(2)} AU`, x + PAD, ly);
    } else {
      const orb = entity.orbital;
      if (orb) {
        ctx.fillText(`a = ${orb.a.toFixed(3)} AU`, x + PAD, ly); ly += 14;
        ctx.fillText(`e = ${orb.e.toFixed(3)}`, x + PAD, ly); ly += 14;
        ctx.fillText(`T = ${orb.T.toFixed(2)} lat`, x + PAD, ly); ly += 14;

        // Odległość od homePlanet
        const homePl = window.KOSMOS?.homePlanet;
        if (window.KOSMOS?.civMode && homePl && entity !== homePl) {
          const dist = DistanceUtils.fromHomePlanetAU(entity);
          ctx.fillStyle = dist > 15 ? C.orange : C.text;
          ctx.fillText(t('ui.distShort', dist.toFixed(2)), x + PAD, ly);
        }
      }
    }
  }

  // ── Sekcja centralna: zakładki + treść ──────────────────
  _drawTabContent(ctx, x, y, w, h, entity) {
    const PAD = 8;

    // Zakładki
    const tabs = ['orbit', 'physics'];
    if (entity.composition) tabs.push('composition');
    const tabLabels = { orbit: t('context.orbit'), physics: t('context.physics'), composition: t('context.composition') };
    const tabW = Math.floor((w - PAD * 2) / tabs.length);

    tabs.forEach((tab, i) => {
      const tx = x + PAD + i * (tabW + 2);
      const ty = y + 6;
      const active = tab === this._tab;
      ctx.fillStyle = active ? THEME.border : THEME.bgPrimary;
      ctx.fillRect(tx, ty, tabW, 16);
      ctx.strokeStyle = active ? THEME.borderActive : C.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, tabW, 16);
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = active ? C.bright : C.text;
      ctx.textAlign = 'center';
      ctx.fillText(tabLabels[tab], tx + tabW / 2, ty + 11);
    });
    ctx.textAlign = 'left';

    // Treść
    const lines = this._getInfoLines(entity);
    const contentY = y + 28;
    const contentH = h - 32;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, contentY, w, contentH);
    ctx.clip();

    lines.forEach((line, i) => {
      const ly = contentY + 12 + i * 14 - this._scrollY;
      if (ly < contentY - 14 || ly > contentY + contentH + 14) return;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = line.c || C.text;
      ctx.fillText(line.k + ': ', x + PAD, ly);
      ctx.fillStyle = line.vc || C.bright;
      const kw = ctx.measureText(line.k + ': ').width;
      ctx.fillText(line.v, x + PAD + kw, ly);
    });

    ctx.restore();
  }

  // ── Sekcja prawa: akcje + złoża ─────────────────────────
  _drawActionSection(ctx, x, y, w, h, entity) {
    const PAD = 10;
    const civMode = window.KOSMOS?.civMode;
    const homePl = window.KOSMOS?.homePlanet;
    const isHome = homePl && entity.id === homePl.id;
    const colMgr = window.KOSMOS?.colonyManager;

    let ly = y + 20;

    // Przycisk akcji
    let actionLabel = null;
    if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) {
      actionLabel = t('context.takeCiv');
    } else if (civMode && (isHome || colMgr?.hasColony(entity.id))) {
      actionLabel = t('context.openMap');
    }

    if (actionLabel) {
      const BW = w - PAD * 2;
      const BH = 20;
      ctx.fillStyle = THEME.border;
      ctx.fillRect(x + PAD, ly - 4, BW, BH);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + PAD, ly - 4, BW, BH);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.textAlign = 'center';
      ctx.fillText(actionLabel, x + w / 2, ly + 10);
      ctx.textAlign = 'left';
      ly += BH + 8;
    }

    // Podsumowanie złóż (2 kolumny jeśli >5)
    const deposits = entity.deposits ?? [];
    if (deposits.length > 0 && (entity.explored || !civMode || isHome)) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText(t('ui.deposits'), x + PAD, ly);
      ly += 12;
      const colW = Math.floor((w - PAD * 2) / 2); // szerokość kolumny
      const useTwoCols = deposits.length > 5;
      for (let i = 0; i < deposits.length; i++) {
        const d = deposits[i];
        const pct = d.totalAmount > 0 ? d.remaining / d.totalAmount : 0;
        const rich = d.richness ?? pct;
        const stars = rich >= 0.7 ? '★★★' : rich >= 0.4 ? '★★' : '★';
        const color = pct <= 0 ? THEME.textDim : rich >= 0.7 ? C.green : rich >= 0.4 ? C.orange : C.red;
        ctx.fillStyle = color;
        if (useTwoCols) {
          const col = i % 2;           // 0=lewa, 1=prawa kolumna
          const row = Math.floor(i / 2);
          ctx.fillText(`${d.resourceId} ${stars}`, x + PAD + col * colW, ly + row * 11);
        } else {
          ctx.fillText(`${d.resourceId} ${stars}`, x + PAD, ly + i * 11);
        }
      }
    }
  }

  // ── Linie informacyjne (jak stary _getInfoLines) ────────
  _getInfoLines(entity) {
    const tab = this._tab;

    // Gwiazda — specjalne info (brak zakładek orbit/physics/composition)
    if (entity.type === 'star') {
      const hz = entity.habitableZone;
      return [
        { k: t('context.type'), v: `${entity.spectralType ?? '?'}-type` },
        { k: t('context.mass'), v: `${(entity.physics?.mass ?? 0).toFixed(2)} M☉` },
        { k: 'Luminosity', v: `${(entity.luminosity ?? 0).toFixed(2)} L☉` },
        { k: t('context.temp'), v: `${(entity.temperature ?? 0).toLocaleString()} K` },
        ...(hz ? [{ k: 'HZ', v: `${hz.min.toFixed(2)}–${hz.max.toFixed(2)} AU` }] : []),
      ];
    }

    if (tab === 'orbit' && entity.orbital) {
      const orb = entity.orbital;
      return [
        { k: t('context.orbitLabel'), v: `${orb.a.toFixed(3)} AU` },
        { k: t('context.eccentricity'), v: orb.e.toFixed(3) },
        { k: t('context.period'), v: `${orb.T.toFixed(2)} lat` },
        { k: t('context.stability'), v: `${Math.round((entity.orbitalStability || 1) * 100)}%` },
        { k: t('context.age'), v: `${Math.floor(entity.age || 0).toLocaleString()} lat` },
      ];
    }

    if (tab === 'physics') {
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [
          { k: t('context.mass'), v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
          { k: t('context.type'), v: entity.planetType || '—' },
          { k: t('context.temp'), v: '???', vc: C.orange },
          { k: t('context.atm'), v: '???', vc: C.orange },
          { k: t('context.life'), v: t('ui.unexplored'), vc: C.orange },
        ];
      }
      const ls = entity.lifeScore || 0;
      const lifeLabel = ls <= 0 ? t('life.barren') :
        ls <= 20 ? t('life.prebiotic') :
        ls <= 50 ? t('life.microorganisms') :
        ls <= 80 ? t('life.complex') : t('life.civilization');
      return [
        { k: t('context.mass'), v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
        { k: t('context.temp'), v: (entity.temperatureC != null || entity.temperatureK != null) ? `${Math.round(entity.temperatureC ?? (entity.temperatureK - 273))} °C` : '—' },
        { k: t('context.atm'), v: _formatAtmosphere(entity) },
        { k: t('context.life'), v: `${Math.round(ls)}%  ${lifeLabel}`,
          vc: ls > 80 ? C.yellow : ls > 0 ? C.green : C.text },
      ];
    }

    if (tab === 'composition' && entity.composition) {
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [{ k: t('context.composition'), v: t('ui.unexplored'), vc: C.orange }];
      }
      const entries = Object.entries(entity.composition)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      return entries.map(([k, v]) => ({
        k, v: `${v.toFixed(1)}%`,
        vc: v > 20 ? C.yellow : v > 10 ? C.orange : C.text,
      }));
    }

    return [{ k: t('context.type'), v: entity.type || '—' }];
  }

  // ── Hit testing ──────────────────────────────────────────
  hitTest(x, y, W, H, entity) {
    if (!entity || this._slideProgress <= 0) return false;

    const lx = this._leftX();
    const panelW = W - OUTLINER_W - lx;
    const panelH = Math.round(CTX_H * this._slideProgress);
    const panelY = H - BAR_H - panelH;

    if (x < lx || x > lx + panelW || y < panelY || y > panelY + panelH) return false;

    const sectionW = Math.floor(panelW / 3);

    // Zakładki (centrum, górny rząd)
    const tabY = panelY + 6;
    if (y >= tabY && y <= tabY + 16 && x >= lx + sectionW && x < lx + sectionW * 2) {
      const tabs = ['orbit', 'physics'];
      if (entity.composition) tabs.push('composition');
      const PAD = 8;
      const tabW = Math.floor((sectionW - PAD * 2) / tabs.length);
      for (let i = 0; i < tabs.length; i++) {
        const tx = lx + sectionW + PAD + i * (tabW + 2);
        if (x >= tx && x <= tx + tabW) {
          this._tab = tabs[i];
          this._scrollY = 0;
          return true;
        }
      }
    }

    // Rename ✏ (lewa sekcja, prawy górny róg)
    if (x >= lx + sectionW - 22 && x <= lx + sectionW && y >= panelY + 8 && y <= panelY + 28) {
      showRenameModal(entity.name).then(newName => {
        if (newName) {
          entity.name = newName;
          EventBus.emit('body:renamed', { entity, name: newName });
        }
      });
      return true;
    }

    // Przycisk akcji (prawa sekcja)
    if (x >= lx + sectionW * 2) {
      return this._hitTestAction(x, y, lx + sectionW * 2, panelY, panelW - sectionW * 2, panelH, entity);
    }

    return true; // pochłoń klik w panelu
  }

  _hitTestAction(x, y, sx, sy, sw, sh, entity) {
    const PAD = 10;
    const civMode = window.KOSMOS?.civMode;
    const homePl = window.KOSMOS?.homePlanet;
    const isHome = homePl && entity.id === homePl.id;
    const colMgr = window.KOSMOS?.colonyManager;

    // Przycisk akcji
    const BW = sw - PAD * 2;
    const BY = sy + 16;
    const BH = 20;
    if (x >= sx + PAD && x <= sx + PAD + BW && y >= BY && y <= BY + BH) {
      if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) {
        EventBus.emit('planet:colonize', { planet: entity });
        return true;
      }
      if (civMode && (isHome || colMgr?.hasColony(entity.id))) {
        if (colMgr) colMgr.switchActiveColony(entity.id);
        window.KOSMOS?.overlayManager?.openPanel('colony');
        return true;
      }
    }
    return true;
  }

  // Obsługa scrolla
  handleWheel(x, y, deltaY, W, H, entity) {
    if (!entity || this._slideProgress <= 0) return false;
    const lx = this._leftX();
    const panelW = W - OUTLINER_W - lx;
    const panelH = Math.round(CTX_H * this._slideProgress);
    const panelY = H - BAR_H - panelH;
    const sectionW = Math.floor(panelW / 3);
    // Tylko w środkowej sekcji (zakładki)
    if (x >= lx + sectionW && x < lx + sectionW * 2 && y >= panelY && y <= panelY + panelH) {
      this._scrollY = Math.max(0, this._scrollY + deltaY * 0.3);
      return true;
    }
    return false;
  }

  // Sprawdza czy punkt nad panelem
  isOver(x, y, W, H, entity) {
    if (!entity || this._slideProgress <= 0) return false;
    const lx = this._leftX();
    const panelW = W - OUTLINER_W - lx;
    const panelH = Math.round(CTX_H * this._slideProgress);
    const panelY = H - BAR_H - panelH;
    return x >= lx && x < lx + panelW && y >= panelY && y <= panelY + panelH;
  }
}
