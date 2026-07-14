// BottomContext — pływający panel info o zaznaczonej encji (redesign UI v1, Slice 1).
//
// Wcześniej: przyklejony do dołu pasek (full-width − Outliner). Teraz: zwarta karta
// zakotwiczona PRZY klikniętym ciele 3D (mirror StationPanel: getBodyScreenPosition +
// clamp do obszaru mapy). Te same dane i zakładki (ORBITA | FIZYKA | SKŁAD), tylko układ
// pionowy i pozycja przy ciele. Sygnatury draw/hitTest/handleWheel/isOver bez zmian —
// UIManager woła je tak samo (karta sama liczy swoją pozycję).

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC }         from '../config/LayoutConfig.js';
import { DistanceUtils }  from '../utils/DistanceUtils.js';
import { showRenameModal } from '../ui/ModalInput.js';
import EventBus            from '../core/EventBus.js';
import { CIV_SIDEBAR_W }  from '../ui/CivPanelDrawer.js';
import { t }              from '../i18n/i18n.js';
import { computeFloatingPlacement } from '../ui/BottomContextLogic.js';
import { FloatingPanel }  from '../ui/FloatingPanel.js';

const TOP_BAR_H  = COSMIC.TOP_BAR_H;    // 46px
const BAR_H      = COSMIC.BOTTOM_BAR_H; // 26px
const OUTLINER_W = COSMIC.OUTLINER_W;   // 170px
const ANIM_SPEED = 0.16;                // prędkość fade (0→1)

// Wymiary karty
const PW       = 240; // szerokość pływającej karty
const PAD      = 8;
const LINE_H   = 14;  // wiersz treści
const HEADER_H = 22;  // nazwa + przyciski
const TAB_H    = 18;  // rząd zakładek
const ACTION_H = 22;  // przycisk akcji
const DEP_ROW_H = 12; // wiersz złoża

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
    this._tab           = 'orbit'; // 'orbit' | 'physics' | 'composition'
    this._slideProgress = 0;       // fade: 0=ukryty, 1=widoczny
    this._prevEntity    = null;    // poprzednia encja (detekcja zmiany)
    this._hitZones      = [];      // [{x,y,w,h,type,tab?}] zbudowane w draw()
    this._cardRect      = null;    // {x,y,w,h} ostatnio narysowanej karty
    this._minimized     = false;   // true = tylko pasek tytułowy (bez treści)
    this._float         = new FloatingPanel();  // C1 (S3.4b) — drag za nagłówek
    this._lastRect      = null;    // {px,py,PW,PH,b,dragZone} z ostatniego draw (drag hit-test)

    // C2 (S3.4b) — wybór ciała (klik 3D / restore z doku) pokazuje kartę i zdejmuje jego belkę.
    EventBus.on('body:selected', ({ entity }) => {
      this._minimized = false;
      if (entity) window.KOSMOS?.panelDock?.unregister?.('body:' + entity.id);
    });
  }

  // Obszar mapy (origin + rozmiar) — karta nie wychodzi poza niego.
  _bounds(W, H) {
    const civMode = window.KOSMOS?.civMode;
    const ox = civMode ? CIV_SIDEBAR_W : 0;
    const oy = TOP_BAR_H;
    const resBar = civMode ? (COSMIC.RESOURCE_BAR_H ?? 0) : 0; // Slice 3 — pasek surowców nad BottomBar
    // UI v3 — w civMode rezerwa dolna = pasek nawigacji + listwa dziennika; poza = dolny pasek.
    const bottomRes = civMode ? (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H) : BAR_H;
    return { ox, oy, ow: W - OUTLINER_W - ox, oh: H - bottomRes - resBar - oy };
  }

  _visibleTabs(entity) {
    if (entity.type === 'star') return []; // gwiazda: treść stała, bez zakładek
    const tabs = ['orbit', 'physics'];
    if (entity.composition) tabs.push('composition');
    return tabs;
  }

  _distLine(entity) {
    if (entity.type === 'star' || !entity.orbital) return null;
    const homePl = window.KOSMOS?.homePlanet;
    if (window.KOSMOS?.civMode && homePl && entity !== homePl) {
      const dist = DistanceUtils.fromHomePlanetAU(entity);
      return { text: t('ui.distShort', dist.toFixed(2)), warn: dist > 15 };
    }
    return null;
  }

  _actionLabel(entity) {
    const civMode = window.KOSMOS?.civMode;
    const homePl  = window.KOSMOS?.homePlanet;
    const isHome  = homePl && entity.id === homePl.id;
    const colMgr  = window.KOSMOS?.colonyManager;
    if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) return t('context.takeCiv');
    if (civMode && (isHome || colMgr?.hasColony(entity.id))) return t('context.openMap');
    return null;
  }

  _visibleDeposits(entity) {
    const civMode = window.KOSMOS?.civMode;
    const homePl  = window.KOSMOS?.homePlanet;
    const isHome  = homePl && entity.id === homePl.id;
    const deposits = entity.deposits ?? [];
    if (deposits.length === 0) return [];
    if (!(entity.explored || !civMode || isHome)) return [];
    return deposits.slice(0, 12); // cap dla zwartej karty
  }

  // ── Rysowanie ───────────────────────────────────────────
  draw(ctx, W, H, entity) {
    // Fade in/out
    if (entity) this._slideProgress = Math.min(1, this._slideProgress + ANIM_SPEED);
    else        this._slideProgress = Math.max(0, this._slideProgress - ANIM_SPEED);
    if (this._slideProgress <= 0 || !entity) { this._cardRect = null; this._hitZones = []; return; }

    // Reset zakładki przy zmianie encji
    if (entity !== this._prevEntity) {
      if (!entity.composition && this._tab === 'composition') this._tab = 'orbit';
      this._float.reanchor();   // C1 — nowa encja → wróć do kotwicy (nie zostawiaj okna w starym miejscu)
      this._minimized = false;  // C2 — nowa encja pokazuje kartę (belka starej encji zostaje w doku)
      this._prevEntity = entity;
    }

    // C2 (S3.4b) — zminimalizowany = ZADOKOWANY (belka w PanelDock); karty nie rysujemy.
    if (this._minimized) { this._cardRect = null; this._hitZones = []; this._lastRect = null; return; }

    // ── Treść (do wyliczenia wysokości) ──
    const tabs   = this._visibleTabs(entity);
    const lines  = this._getInfoLines(entity);
    const distLn = this._distLine(entity);
    const action = this._actionLabel(entity);
    const deps   = this._visibleDeposits(entity);

    // ── Wysokość karty (pełna — zminimalizowana wraca wcześniej przez early-return) ──
    let PH = 4 + HEADER_H + LINE_H;          // pad + nazwa + typ
    if (distLn) PH += LINE_H;
    if (tabs.length) PH += TAB_H + 2;
    PH += lines.length * LINE_H + 4;
    if (action) PH += ACTION_H + 4;
    if (deps.length) {
      const rows = deps.length > 5 ? Math.ceil(deps.length / 2) : deps.length;
      PH += 14 + rows * DEP_ROW_H + 4;
    }
    PH += 6;

    // ── Pozycja: kotwica do ciała 3D + clamp (albo pozycja narzucona dragiem). ──
    const bounds = this._bounds(W, H);
    const sp = window.KOSMOS?.threeRenderer?.getBodyScreenPosition?.(entity.id) ?? null;
    const pl = computeFloatingPlacement({ bodyScreen: sp, PW, PH, bounds, screenW: W });
    const { px, py } = this._float.place(pl.px, pl.py, PW, PH, bounds);   // C1 — drag override kotwicy
    // Strefa-drag = pas nagłówka POZA przyciskami (✏ najbliżej lewej @ px+PW-58).
    this._lastRect = { px, py, PW, PH, b: bounds, dragZone: { x: px, y: py, w: PW - 60, h: HEADER_H } };

    this._cardRect = { x: px, y: py, w: PW, h: PH };
    this._hitZones = [];

    ctx.save();
    ctx.globalAlpha = this._slideProgress;

    // Tło + ramka
    ctx.fillStyle = bgAlpha(0.92);
    ctx.fillRect(px, py, PW, PH);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, PW - 1, PH - 1);

    let cy = py + 4;

    // ── Header: nazwa + przyciski (✏ rename · ▼/▲ minimize · − close) ──
    ctx.textAlign = 'left';
    ctx.font = `${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.bright;
    ctx.fillText(_truncate(entity.name, 18), px + PAD, cy + 15);

    const rbY = cy + 2, rbS = 16;
    const closeX = px + PW - 22;   // zamknięcie (−) w rogu
    const minX   = px + PW - 40;   // minimalizacja (▼/▲) obok zamknięcia
    const renX   = px + PW - 58;   // rename (✏)
    ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.text;
    ctx.fillText('✏', renX + rbS / 2, rbY + 12);
    ctx.fillText('▼', minX + rbS / 2, rbY + 12);   // C2 — minimalizuj do doku (belka lewy-dół)
    ctx.fillText('−', closeX + rbS / 2, rbY + 12);
    ctx.textAlign = 'left';
    this._hitZones.push({ x: renX,   y: rbY, w: rbS, h: rbS, type: 'rename' });
    this._hitZones.push({ x: minX,   y: rbY, w: rbS, h: rbS, type: 'minimize' });
    this._hitZones.push({ x: closeX, y: rbY, w: rbS, h: rbS, type: 'close' });
    cy += HEADER_H;

    // Treść tylko gdy rozwinięte (zminimalizowane = sam pasek tytułowy z nazwą).
    if (!this._minimized) {

    // ── Typ ──
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = C.label;
    const typeLabel = entity.type === 'star'
      ? `${entity.spectralType ?? '?'}-type star`
      : (entity.planetType ?? entity.type ?? '—');
    ctx.fillText(typeLabel, px + PAD, cy + 10);
    cy += LINE_H;

    // ── Dystans od macierzystej ──
    if (distLn) {
      ctx.fillStyle = distLn.warn ? C.orange : C.text;
      ctx.fillText(distLn.text, px + PAD, cy + 10);
      cy += LINE_H;
    }

    // ── Zakładki ──
    if (tabs.length) {
      const tabLabels = { orbit: t('context.orbit'), physics: t('context.physics'), composition: t('context.composition') };
      const tabW = Math.floor((PW - PAD * 2 - (tabs.length - 1) * 2) / tabs.length);
      tabs.forEach((tab, i) => {
        const tx = px + PAD + i * (tabW + 2);
        const ty = cy;
        const active = tab === this._tab;
        ctx.fillStyle = active ? C.border : C.bg;
        ctx.fillRect(tx, ty, tabW, TAB_H - 2);
        ctx.strokeStyle = active ? THEME.borderActive : C.border;
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, ty, tabW, TAB_H - 2);
        ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
        ctx.fillStyle = active ? C.bright : C.text;
        ctx.textAlign = 'center';
        ctx.fillText(tabLabels[tab], tx + tabW / 2, ty + 11);
        this._hitZones.push({ x: tx, y: ty, w: tabW, h: TAB_H - 2, type: 'tab', tab });
      });
      ctx.textAlign = 'left';
      cy += TAB_H + 2;
    }

    // ── Treść zakładki ──
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    lines.forEach((line) => {
      const ly = cy + 11;
      ctx.fillStyle = line.c || C.text;
      ctx.fillText(line.k + ': ', px + PAD, ly);
      const kw = ctx.measureText(line.k + ': ').width;
      ctx.fillStyle = line.vc || C.bright;
      ctx.fillText(line.v, px + PAD + kw, ly);
      cy += LINE_H;
    });
    cy += 4;

    // ── Przycisk akcji ──
    if (action) {
      const bw = PW - PAD * 2;
      ctx.fillStyle = C.border;
      ctx.fillRect(px + PAD, cy, bw, ACTION_H);
      ctx.strokeStyle = THEME.borderActive;
      ctx.lineWidth = 1;
      ctx.strokeRect(px + PAD, cy, bw, ACTION_H);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.title;
      ctx.textAlign = 'center';
      ctx.fillText(action, px + PW / 2, cy + 15);
      ctx.textAlign = 'left';
      this._hitZones.push({ x: px + PAD, y: cy, w: bw, h: ACTION_H, type: 'action' });
      cy += ACTION_H + 4;
    }

    // ── Złoża ──
    if (deps.length) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = C.label;
      ctx.fillText(t('ui.deposits'), px + PAD, cy + 10);
      cy += 14;
      const twoCol = deps.length > 5;
      const colW = Math.floor((PW - PAD * 2) / 2);
      deps.forEach((d, i) => {
        const pct  = d.totalAmount > 0 ? d.remaining / d.totalAmount : 0;
        const rich = d.richness ?? pct;
        const stars = rich >= 0.7 ? '★★★' : rich >= 0.4 ? '★★' : '★';
        ctx.fillStyle = pct <= 0 ? C.dim : rich >= 0.7 ? C.green : rich >= 0.4 ? C.orange : C.red;
        if (twoCol) {
          const col = i % 2, row = Math.floor(i / 2);
          ctx.fillText(`${d.resourceId} ${stars}`, px + PAD + col * colW, cy + 9 + row * DEP_ROW_H);
        } else {
          ctx.fillText(`${d.resourceId} ${stars}`, px + PAD, cy + 9 + i * DEP_ROW_H);
        }
      });
    }
    } // koniec if (!this._minimized) — treść karty

    // Tło jako hit-zone NA KOŃCU — _hitTest=Array.find, przyciski (dodane wyżej) mają
    // priorytet; tło tylko pochłania klik w kartę (nie przelatuje do 3D pod spodem).
    this._hitZones.push({ x: px, y: py, w: PW, h: PH, type: 'bg' });

    ctx.restore();
  }

  // ── Linie informacyjne (bez zmian względem starego panelu) ──
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
    if (!entity || this._slideProgress <= 0 || !this._hitZones.length) return false;
    const z = this._hitZones.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);
    if (!z) return false;

    if (z.type === 'tab') { this._tab = z.tab; return true; }
    if (z.type === 'rename') {
      showRenameModal(entity.name).then(newName => {
        if (newName) {
          entity.name = newName;
          EventBus.emit('body:renamed', { entity, name: newName });
        }
      });
      return true;
    }
    if (z.type === 'action') { this._doAction(entity); return true; }
    if (z.type === 'minimize') { this._minimize(entity); return true; }
    if (z.type === 'close') { EventBus.emit('body:deselected'); return true; }
    return true; // bg — pochłoń klik w kartę
  }

  _doAction(entity) {
    const civMode = window.KOSMOS?.civMode;
    const homePl  = window.KOSMOS?.homePlanet;
    const isHome  = homePl && entity.id === homePl.id;
    const colMgr  = window.KOSMOS?.colonyManager;
    if (!civMode && entity.type === 'planet' && (entity.lifeScore ?? 0) > 80) {
      EventBus.emit('planet:colonize', { planet: entity });
      return;
    }
    if (civMode && (isHome || colMgr?.hasColony(entity.id))) {
      if (colMgr) colMgr.switchActiveColony(entity.id);
      window.KOSMOS?.overlayManager?.openPanel('colony');
    }
  }

  // Scroll nad kartą pochłaniany (nie zoomuj kamery 3D pod spodem).
  handleWheel(x, y, deltaY, W, H, entity) {
    return this.isOver(x, y, W, H, entity);
  }

  // Czy punkt nad kartą
  isOver(x, y, W, H, entity) {
    if (!entity || this._slideProgress <= 0 || !this._cardRect) return false;
    const r = this._cardRect;
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  // ── Drag za nagłówek (C1, S3.4b) — router w UIManager woła mousedown/move/up ──
  tryBeginDrag(x, y) {
    const r = this._lastRect;
    if (this._minimized || !r) return false;
    const z = r.dragZone;
    if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) return false;
    this._float.beginDrag(x, y, r.px, r.py);
    return true;
  }

  handleDragMove(x, y) {
    const r = this._lastRect;
    if (!r || !this._float.isDragging()) return false;
    return this._float.updateDrag(x, y, r.PW, r.PH, r.b);
  }

  endDrag() { return this._float.endDrag(); }
  isDraggingPanel() { return this._float.isDragging(); }

  // ── Minimalizacja do doku (C2, S3.4b) — belka w PanelDock, restore = klik belki ──
  _minimize(entity) {
    const dock = window.KOSMOS?.panelDock;
    if (!dock || !entity) return;
    const key = 'body:' + entity.id;
    this._minimized = true;
    dock.register(key, {
      icon: this._entityIcon(entity),
      label: entity.name ?? '—',
      onRestore: () => {
        dock.unregister(key);
        this._minimized = false;
        this._float.reanchor();
        EventBus.emit('body:selected', { entity });   // pokaż kartę (ustawia _selectedEntity + fokus + _dirty)
      },
    });
  }

  _entityIcon(entity) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr?.hasColony?.(entity.id) || entity.id === window.KOSMOS?.homePlanet?.id) return '⬢';
    switch (entity.type) {
      case 'star':      return '★';
      case 'moon':      return '☾';
      case 'asteroid':  return '◆';
      case 'planetoid': return '◆';
      case 'comet':     return '☄';
      default:          return '●';
    }
  }
}
