// BottomContext — kontekstowy dolny panel (120px) widoczny gdy encja zaznaczona
//
// Zastępuje InfoPanel (prawy bok). Slide-up/slide-down animacja.
// Zakładki: ORBITA | FIZYKA | SKŁAD
// Lewo: nazwa + typ + dane orbitalne
// Centrum: treść zakładki
// Prawo: przycisk akcji + podsumowanie złóż

import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { DistanceUtils }  from '../utils/DistanceUtils.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';
import { showRenameModal } from '../ui/ModalInput.js';
import EventBus            from '../core/EventBus.js';
import { CIV_SIDEBAR_W }  from '../ui/CivPanelDrawer.js';

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
  const labels = { dense: 'Gęsta', thin: 'Cienka', breathable: 'Oddychalna', none: 'Brak' };
  const label = labels[atm] || atm;
  if (atm === 'breathable') return label + ' (zdatna)';
  if (entity.breathableAtmosphere) return label + ' (zdatna)';
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
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(lx, panelY, panelW, panelH);
    ctx.strokeStyle = C.border;
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
    ctx.fillText(entity.planetType ?? entity.type ?? '—', x + PAD, y + 34);

    // Kluczowe dane orbitalne
    const orb = entity.orbital;
    if (orb) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.text;
      let ly = y + 50;
      ctx.fillText(`a = ${orb.a.toFixed(3)} AU`, x + PAD, ly); ly += 14;
      ctx.fillText(`e = ${orb.e.toFixed(3)}`, x + PAD, ly); ly += 14;
      ctx.fillText(`T = ${orb.T.toFixed(2)} lat`, x + PAD, ly); ly += 14;

      // Odległość od homePlanet
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && homePl && entity !== homePl) {
        const dist = DistanceUtils.fromHomePlanetAU(entity);
        ctx.fillStyle = dist > 15 ? C.orange : C.text;
        ctx.fillText(`Odl: ${dist.toFixed(2)} AU`, x + PAD, ly);
      }
    }
  }

  // ── Sekcja centralna: zakładki + treść ──────────────────
  _drawTabContent(ctx, x, y, w, h, entity) {
    const PAD = 8;

    // Zakładki
    const tabs = ['orbit', 'physics'];
    if (entity.composition) tabs.push('composition');
    const tabLabels = { orbit: 'ORBITA', physics: 'FIZYKA', composition: 'SKŁAD' };
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
      actionLabel = '► Przejmij cywilizację';
    } else if (civMode && (isHome || colMgr?.hasColony(entity.id))) {
      actionLabel = '► Mapa planety';
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
      ctx.fillText('ZŁOŻA:', x + PAD, ly);
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

    if (tab === 'orbit' && entity.orbital) {
      const orb = entity.orbital;
      return [
        { k: 'Orbita', v: `${orb.a.toFixed(3)} AU` },
        { k: 'Mimośród', v: orb.e.toFixed(3) },
        { k: 'Okres', v: `${orb.T.toFixed(2)} lat` },
        { k: 'Stabilność', v: `${Math.round((entity.orbitalStability || 1) * 100)}%` },
        { k: 'Wiek', v: `${Math.floor(entity.age || 0).toLocaleString()} lat` },
      ];
    }

    if (tab === 'physics') {
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [
          { k: 'Masa', v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
          { k: 'Typ', v: entity.planetType || '—' },
          { k: 'Temp', v: '???', vc: C.orange },
          { k: 'Atm', v: '???', vc: C.orange },
          { k: 'Życie', v: '??? (wymaga rozpoznania)', vc: C.orange },
        ];
      }
      const ls = entity.lifeScore || 0;
      const lifeLabel = ls <= 0 ? 'Jałowa' :
        ls <= 20 ? 'Chemia prebiotyczna' :
        ls <= 50 ? 'Mikroorganizmy' :
        ls <= 80 ? 'Złożone życie' : 'Cywilizacja';
      return [
        { k: 'Masa', v: `${(entity.physics?.mass || 0).toFixed(2)} M⊕` },
        { k: 'Temp', v: (entity.temperatureC != null || entity.temperatureK != null) ? `${Math.round(entity.temperatureC ?? (entity.temperatureK - 273))} °C` : '—' },
        { k: 'Atm', v: _formatAtmosphere(entity) },
        { k: 'Życie', v: `${Math.round(ls)}%  ${lifeLabel}`,
          vc: ls > 80 ? C.yellow : ls > 0 ? C.green : C.text },
      ];
    }

    if (tab === 'composition' && entity.composition) {
      const homePl = window.KOSMOS?.homePlanet;
      if (window.KOSMOS?.civMode && entity !== homePl && !entity.explored) {
        return [{ k: 'Skład', v: '??? (wymaga rozpoznania)', vc: C.orange }];
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

    return [{ k: 'Typ', v: entity.type || '—' }];
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
        if (newName) entity.name = newName;
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
