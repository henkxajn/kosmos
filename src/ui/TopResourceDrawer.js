// TopResourceDrawer — górny wysuwany pasek surowców (redesign UI v1).
//
// Zastępuje BottomResourceBar (dolny pasek aktywnej kolonii) hover-drawerem przy GÓRNEJ
// krawędzi: cienki trigger 6px od SAMEJ GÓRY ekranu (y=0); hover → zjeżdża panel z JEDNYM WIERSZEM NA
// KOLONIĘ (aktywna pierwsza, reszta niżej, scroll gdy więcej). Wiersz = nazwa · 👤 Pop ·
// 10 surowców · paliwo · food · water · research 🔬 · bilans energii ⚡ · dobrobyt ⭐ ·
// kredyty ₡ (wszystko per-kolonia z col.resourceSystem/civSystem/prosperitySystem).
// Tooltipy per token zachowane (port z BottomResourceBar — wartości z danych kolonii,
// bez globalnego getResourceBreakdown). Substrat Canvas 2D; zdarzenia z window → UIManager.
//
// Wzorzec slide/scroll: NavDrawer (stepSlide + clampScroll), ale PIONOWO (panel zjeżdża w dół,
// clip-reveal). Non-exclusive: rysowany PO overlayManager.
//
// ARKUSZ UI, U0-2 (D-UI-11, UI_PLAN §7.13): lista kolonii rozwija się KLIKNIĘCIEM, nie najechaniem.
// Klik w pasmo poza nazwą = rozwiń / zwiń; klik w nazwę = panel kolonii (i lista się zwija — wybór
// zakończony); klik poza listą = zwiń BEZ pochłaniania kliku. Hover zostaje wyłącznie dla tooltipów
// tokenów. Kliki przechwycone wcześniej przez inne panele (UIManager woła ten drawer w środku łańcucha)
// łapie nasłuch `click` w fazie przechwytywania na window, podpinany tylko na czas otwarcia listy.

import { THEME, bgAlpha, GLASS_BORDER } from '../config/ThemeConfig.js';
import { COSMIC, BOTTOM_RESERVED } from '../config/LayoutConfig.js';
import { MINED_RESOURCES, HARVESTED_RESOURCES } from '../data/ResourcesData.js';
import { COMMODITIES }       from '../data/CommoditiesData.js';
import { BUILDINGS }         from '../data/BuildingsData.js';
import EntityManager         from '../core/EntityManager.js';
import { t, getName, getLocale } from '../i18n/i18n.js';
import { drawResourceIcon, hasIconFile } from './ResourceIcons.js';
import { stepSlide, navIsAnimating, clampScroll, pointInRect }
  from './NavDrawerLogic.js';
import { fmtBeltValue, fmtBeltSigned, fmtBeltFull, fmtBeltPrecise, fmtBeltDelta, trendGlyph, TREND_UP,
  beltFontKey, measureBeltTemplates, planBeltRow, ellipsize,
  ICON_SIZE, ICON_GAP, VALUE_GAP, TOKEN_GAP } from './TopBarFormatLogic.js';

// UI v3 — pasek surowców: STAŁE pasmo z wierszem aktywnej kolonii (zawsze na wierzchu) +
// klik (U0-2) rozwija PONIŻEJ dodatkowe kolonie. Po zwinięciu pozostałe kolonie znikają,
// aktywna zostaje.
const ROW_H      = 24;                   // wysokość wiersza kolonii
const PAD        = 8;
const ROW_PAD_Y  = 3;                    // górny/dolny margines listy

// ARKUSZ UI, U0-3 (D-UI-12, Findingi 474 / 475 / 479): STAŁA komórka na token zamiast „przytulania" z high-water
// mark kluczowanym per kolonia (474: kolumny różnych wierszy się rozjeżdżały). Szerokości z szablonów mierzonych dla
// AKTYWNEGO fontu (`TopBarFormatLogic` — najszersza cyfra, „88,8k", strzałka trendu, kredyty 7-cyfrowe), JEDEN plan
// dla wszystkich wierszy listy ⇒ x tokenu k jest identyczny w każdym wierszu. Kredyty przypięte do prawego końca
// pasma, nigdy nieucinane (475: były ostatnim tokenem przed `break` na przepełnieniu). Strefa nazwy 200 → podłoga
// 160 przy ujemnym budżecie, nazwa z wielokropkiem. Kolejność tokenów kanoniczna — ta sama w każdym wierszu; token,
// którego kolonia nie ma (np. dobrobyt placówki), zostawia puste miejsce zamiast przesuwać kolejne.
const PNG_TOKENS  = [...Object.keys(MINED_RESOURCES), ...Object.keys(HARVESTED_RESOURCES), 'fuel'];
const TOKEN_ORDER = [...PNG_TOKENS, 'research', 'energy', 'prosperity', 'hubpool'];
const TREND_THRESHOLD = { prosperity: 0.5 };   // próg strzałki trendu (reszta: 0.05 — jak dawny próg liczby delty)

function _fmtPop(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

export class TopResourceDrawer {
  constructor() {
    this._slideProgress = 0;   // 0=schowany, 1=wysunięty
    this._open          = false; // U0-2: stan „lista rozwinięta" — zmienia go WYŁĄCZNIE klik (D-UI-11)
    this._hovered       = false; // kursor nad pasmem / panelem — tylko wyróżnienie chevronu i tooltipy
    this._outsideClick  = null;  // nasłuch `click` (capture) na window — podpięty tylko gdy lista otwarta
    this._extraCount    = 0;     // liczba kolonii poza aktywną (z ostatniej klatki) — 0 = nie ma czego rozwijać
    this._scrollY       = 0;
    this._maxScroll     = 0;
    this._triggerRect   = null;  // pasek 6px (zawsze hoverowalny)
    this._panelRect     = null;  // {x,y,w,h} widocznego panelu (revealH)
    this._colonyRects   = [];    // [{x,y,w,h, planetId}] — klik nazwy → panel kolonii
    this._hitItems      = [];    // [{x,y,w,h, tip}] — tooltipy per token
    this._hoverTip      = null;
    this._metrics       = null;  // U0-3: szablony szerokości aktywnego fontu (TopBarFormatLogic.measureBeltTemplates)
    this._metricsKey    = null;  // klucz pomiaru: rodzina + rozmiary fontu + gotowość fontu z sieci
    this._metricsFontKey = null; // sama rodzina + rozmiary (zmiana presetu / motywu = nowy pomiar)
    this._metricsReady  = false; // font z sieci załadowany przy ostatnim pomiarze
    this._layout        = null;  // plan wierszy z ostatniej klatki (keys, cell, plan) — wspólny dla całej listy
  }

  _markDirty() { const um = window.KOSMOS?.uiManager; if (um) um._dirty = true; }
  isAnimating() { return navIsAnimating(this._slideProgress, 0); }
  isOpen() { return this._slideProgress > 0.001; }

  // U0-2 — jedyne miejsce zmiany stanu „otwarte". Na czas otwarcia podpina nasłuch `click` w fazie
  // przechwytywania na window: klik POZA pasmem i listą zwija listę, ale niczego nie pochłania (zdarzenie
  // idzie dalej — do UIManagera, paneli i mapy). Klik w pasmo / listę obsługuje handleClick.
  _setOpen(open) {
    open = !!open;
    if (open === this._open) return;
    this._open = open;
    this._markDirty();
    const w = typeof window !== 'undefined' ? window : null;
    if (open && !this._outsideClick && typeof w?.addEventListener === 'function') {
      this._outsideClick = (e) => {
        const s = w.KOSMOS?.uiScale || 1;
        const x = e.clientX / s, y = e.clientY / s;
        if (!this._isInside(x, y)) this._setOpen(false);
      };
      w.addEventListener('click', this._outsideClick, true);
    } else if (!open && this._outsideClick) {
      if (typeof w?.removeEventListener === 'function') w.removeEventListener('click', this._outsideClick, true);
      this._outsideClick = null;
    }
  }

  // Punkt w paśmie albo w rozwiniętej liście (współrzędne LOGICZNE UI).
  _isInside(x, y) {
    if (pointInRect(this._triggerRect, x, y)) return true;
    return this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
  }

  // ── Kolonie gracza (aktywna pierwsza) ──────────────────────────────────────
  _playerColonies() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return [];
    const all = (colMgr.getAllColonies?.() ?? [])
      .filter(c => !c?.ownerEmpireId || c.ownerEmpireId === 'player');
    const activeId = colMgr.activePlanetId;
    return [
      ...all.filter(c => c.planetId === activeId),
      ...all.filter(c => c.planetId !== activeId),
    ];
  }

  // ── Globalna pula badań (suma po koloniach gracza) ─────────────────────────
  // Research nie jest silosowany per-kolonia — ResearchSystem sumuje/drenuje
  // amount i perYear ze wszystkich kolonii. Belka pokazuje łączny stan.
  _globalResearch() {
    let amount = 0, perYear = 0;
    for (const c of this._playerColonies()) {
      const rs = c.resourceSystem;
      if (!rs?.research) continue;
      amount  += rs.research.amount  ?? 0;
      perYear += rs.research.perYear ?? 0;
    }
    return { amount, perYear };
  }

  // ── Tokeny jednej kolonii (port BottomResourceBar._collect, źródło = kolonia) ──
  _colonyTokens(col) {
    const rs = col.resourceSystem;
    if (!rs?.inventorySnapshot) return null;
    const snap = rs.inventorySnapshot();
    const perYear = (id) => snap._observedPerYear?.[id] ?? snap._perYear?.[id] ?? 0;
    const items = [];

    // 10 wydobywalnych + Food + Water (ikony PNG)
    for (const [id, def] of Object.entries(MINED_RESOURCES)) {
      items.push({ id, icon: def.icon, val: snap[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: perYear(id), showDelta: true });
    }
    for (const [id, def] of Object.entries(HARVESTED_RESOURCES)) {
      items.push({ id, icon: def.icon, val: snap[id] ?? 0, color: def.color || THEME.textSecondary,
        kind: 'resource', delta: perYear(id), showDelta: true });
    }
    // Paliwo — commodity witalny (S3.0a)
    const fuelDef = COMMODITIES.fuel;
    if (fuelDef) items.push({ id: 'fuel', icon: fuelDef.icon, val: snap['fuel'] ?? 0,
      color: THEME.textSecondary, kind: 'commodity', delta: perYear('fuel'), showDelta: true });

    // Research — GLOBALNA pula: badania są sumowane i drenowane ze WSZYSTKICH
    // kolonii gracza przez ResearchSystem (nie silos per-kolonia jak surowce).
    // Pokazujemy łączny stan + łączną stawkę, identycznie na każdym wierszu.
    const gRes = this._globalResearch();
    items.push({ id: 'research', icon: '🔬', val: gRes.amount, color: '#aa44ff',
      kind: 'research', delta: gRes.perYear, showDelta: true, global: true });

    // Bilans energii (per-kolonia)
    const e = snap._energy ?? {};
    const brownout = !!e.brownout;
    const eBal = Math.round(e.balance ?? 0);
    items.push({ icon: '⚡', val: brownout ? 0 : eBal, raw: true, signed: !brownout,
      color: brownout ? THEME.danger : eBal < 0 ? THEME.warning : THEME.success,
      kind: 'energy', energy: { production: e.production ?? 0, consumption: e.consumption ?? 0,
        balance: e.balance ?? 0, brownout } });

    // Dobrobyt (per-kolonia)
    const ps = col.prosperitySystem;
    const prosp = ps?.prosperity;
    if (prosp !== undefined && prosp !== null) {
      const p = Math.round(prosp);
      const trend = (ps?.targetProsperity ?? prosp) - prosp;
      items.push({ icon: '⭐', val: p, raw: true,
        color: p < 30 ? THEME.danger : p < 60 ? THEME.warning : THEME.success,
        kind: 'prosperity', delta: trend, showDelta: true });
    }

    // Kredyty (per-kolonia) — rysowane osobno, w slocie przypiętym do prawego końca pasma (U0-3, D-UI-12: zawsze
    // w całości, pełna liczba z separatorem tysięcy — `fmtBeltFull`).
    const credits = col.credits;
    if (credits !== undefined && credits !== null) {
      items.push({ id: 'credits', icon: '🪙', val: credits, raw: true, color: THEME.warning, kind: 'credits' });
    }

    // Orbital Logistics Hub — plakietka „pula": ▸PULA (członek aktywnej puli) / ⚠PULA (odcięty blokadą).
    // LICZBY zasobów zostają LOKALNE (badge to tylko sygnał; tooltip pokazuje agregat puli, read-only).
    const hub = window.KOSMOS?.systemPoolService?.getHubLinkInfo?.(col.planetId);
    if (hub) {
      items.push({
        id: 'hubpool', icon: hub.status === 'linked' ? '▸' : '⚠', valText: t('topBar.hubPoolBadge'),
        raw: true, color: hub.status === 'linked' ? THEME.warning : THEME.danger,
        kind: 'hubpool', _hubStatus: hub.status, _anchorPlanetId: hub.anchorPlanetId, _anchorName: hub.anchorName,
      });
    }

    return { items, brownout };
  }

  // ── Rysowanie ───────────────────────────────────────────────────────────
  // STAŁE pasmo (aktywna kolonia, zawsze) + rozwinięcie dodatkowych kolonii poniżej (klik, U0-2).
  draw(ctx, W, H) {
    this._slideProgress = stepSlide(this._slideProgress, this._open ? 1 : 0);

    this._hitItems = [];
    this._colonyRects = [];

    // UI v3 — bell/MENU/zegar przeniesione z górnego paska na dolny BottomControlBar → cały
    // górny pasek jest wolny. Aktywny wiersz i wiersze rozwinięte idą na PEŁNĄ szerokość
    // (do prawej krawędzi — ARKUSZ HUD paczka B, Finding 564: bez dawnego wcięcia 6 px na wyzwalacz outlinera).
    const px = 0;
    const bandPw  = Math.max(120, W - px);
    const panelPw = bandPw;
    const panelTop = 0;
    const baseH = COSMIC.TOP_BAND_H;   // wysokość zunifikowanej belki (wspólna z TopBar)

    const cols = this._playerColonies();
    const extraCount = Math.max(0, cols.length - 1);
    this._extraCount = extraCount;
    if (extraCount === 0 && this._open) this._setOpen(false);   // nie ma czego rozwijać (np. utrata kolonii)
    // U0-3: szablony aktywnego fontu + JEDEN plan dla wszystkich wierszy. Szerokość wiersza bez rezerwy chevronu
    // jest WSPÓLNA (także dla wierszy rozwiniętych), więc kredyty stoją w jednej kolumnie w całej liście.
    const metrics = this._beltMetrics(ctx);
    const rowW = bandPw - (extraCount > 0 ? metrics.hintW : 0);   // rezerwa na chevron przy >1 kolonii
    const layout = this._planLayout(ctx, metrics, cols, px, rowW);
    this._layout = layout;
    let anyBrownout = false;

    // ── Stałe pasmo: wiersz AKTYWNEJ kolonii (zawsze widoczny). Tło + dolną krawędź belki
    //    daje TopBar (pełna szerokość, rysowane wcześniej) — TU tylko highlight + tokeny. ──
    this._triggerRect = { x: px, y: panelTop, w: bandPw, h: baseH };

    if (cols.length > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(px, panelTop, rowW, baseH); ctx.clip();
      ctx.textAlign = 'left';
      const col = cols[0];
      const data = this._colonyTokens(col);
      if (data?.brownout) anyBrownout = true;
      this._drawRow(ctx, col, data, px, panelTop + ROW_PAD_Y, rowW, true, layout);
      ctx.restore();
    }

    // ── Rozwinięcie: dodatkowe kolonie PONIŻEJ pasma — PEŁNA szerokość (clip-reveal w dół) ──
    let revealH = 0;
    if (extraCount > 0) {
      const extraContentH = extraCount * ROW_H + ROW_PAD_Y;
      const maxPanelH = Math.max(ROW_H, H - BOTTOM_RESERVED - 8);   // nad dolnym nav/dziennikiem
      const maxExtraH = Math.max(0, maxPanelH - baseH);
      const extraH = Math.min(extraContentH, maxExtraH);
      revealH = Math.round(extraH * this._slideProgress);
      this._maxScroll = Math.max(0, extraContentH - extraH);
      this._scrollY = clampScroll(this._scrollY, this._maxScroll);

      const extraTop = panelTop + baseH;
      this._panelRect = revealH > 0 ? { x: px, y: extraTop, w: panelPw, h: revealH } : null;

      if (revealH > 0) {
        ctx.fillStyle = bgAlpha(0.94);
        ctx.fillRect(px, extraTop, panelPw, revealH);
        ctx.save();
        ctx.beginPath(); ctx.rect(px, extraTop, panelPw, revealH); ctx.clip();
        ctx.textAlign = 'left';
        for (let i = 1; i < cols.length; i++) {
          const col = cols[i];
          const rowTop = extraTop + ROW_PAD_Y - this._scrollY + (i - 1) * ROW_H;
          if (rowTop + ROW_H <= extraTop || rowTop >= extraTop + revealH) continue;
          const data = this._colonyTokens(col);
          if (data?.brownout) anyBrownout = true;
          this._drawRow(ctx, col, data, px, rowTop, rowW, false, layout);
        }
        ctx.restore();

        // Krawędzie rozwiniętego panelu (dół + boki) — odznaczają go od sceny 3D
        ctx.strokeStyle = anyBrownout ? THEME.danger : GLASS_BORDER;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 0.5, extraTop); ctx.lineTo(px + 0.5, extraTop + revealH);
        ctx.moveTo(px + panelPw - 0.5, extraTop); ctx.lineTo(px + panelPw - 0.5, extraTop + revealH);
        ctx.moveTo(px, extraTop + revealH - 0.5); ctx.lineTo(px + panelPw, extraTop + revealH - 0.5);
        ctx.stroke();
      }
    } else {
      this._panelRect = null;
      this._scrollY = 0; this._maxScroll = 0;
    }

    // ── Chevron „▾/▴ +N" na prawym końcu PASMA aktywnego (sygnał rozwijalności) ──
    if (extraCount > 0) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = (this._hovered || this._open) ? THEME.accent : THEME.textSecondary;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const glyph = this._slideProgress > 0.5 ? '▴' : `▾${extraCount}`;
      ctx.fillText(glyph, px + bandPw - 4, panelTop + baseH / 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    }
  }

  // ── U0-3: szablony szerokości aktywnego fontu (cache per klucz fontu) ──────────────────────
  // Klucz = rodzina + rozmiary fontu motywu (preset F7 / motyw tytułu = nowy klucz). Font z sieci (Google Fonts)
  // może dojść PO pierwszym pomiarze — dopóki `document.fonts.check` mówi „nie", sprawdzamy co klatkę i po zmianie
  // mierzymy od nowa (inaczej zostałyby szerokości fontu zastępczego).
  _beltMetrics(ctx) {
    const fontKey = beltFontKey(THEME);
    const fonts = {
      value: `${THEME.fontSizeNormal}px ${THEME.fontFamily}`,
      small: `${THEME.fontSizeSmall}px ${THEME.fontFamily}`,
      icon:  `${THEME.fontSizeNormal + 3}px ${THEME.fontFamily}`,
    };
    let ready = this._metricsReady && this._metricsFontKey === fontKey;
    if (!ready) {
      const fs = typeof document !== 'undefined' ? document.fonts : null;
      ready = typeof fs?.check === 'function' ? !!fs.check(fonts.value) : true;
    }
    const key = `${fontKey}|${ready ? 1 : 0}`;
    if (this._metrics && this._metricsKey === key) return this._metrics;
    const prevFont = ctx.font;
    const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
    const m = { ...measureBeltTemplates(measure, fonts), fonts, icon: {} };
    for (const g of ['🔬', '⚡', '⭐', '▸', '⚠']) m.icon[g] = measure(g, fonts.icon);
    ctx.font = prevFont;
    this._metrics = m; this._metricsKey = key; this._metricsFontKey = fontKey; this._metricsReady = ready;
    return m;
  }

  // ── U0-3: JEDEN plan dla wszystkich wierszy listy ──────────────────────────────────────────
  // Kształt WSZYSTKICH kolonii gracza (bez snapshotów zasobów — tanio): czy którakolwiek ma dobrobyt / plakietkę
  // puli hubu / kredyty; najszerszy tekst kredytów (co najmniej szablon 7-cyfrowy). Plan liczony także przy
  // zwiniętej liście, więc rozwinięcie niczego w aktywnym wierszu nie przesuwa.
  _planLayout(ctx, m, cols, px, rowW) {
    const locale = getLocale();
    const pool = window.KOSMOS?.systemPoolService;
    let anyProsp = false, anyHub = false, anyCredits = false, creditsTextW = m.creditsW;
    ctx.font = m.fonts.value;
    for (const c of cols) {
      if (c?.prosperitySystem?.prosperity != null) anyProsp = true;
      if (pool?.getHubLinkInfo?.(c.planetId)) anyHub = true;
      if (c?.credits != null) {
        anyCredits = true;
        creditsTextW = Math.max(creditsTextW, ctx.measureText(fmtBeltFull(c.credits, locale)).width);
      }
    }
    const keys = TOKEN_ORDER.filter(k => (k !== 'prosperity' || anyProsp) && (k !== 'hubpool' || anyHub));
    const badgeW = anyHub ? ctx.measureText(t('topBar.hubPoolBadge')).width : 0;
    const cell = {};
    for (const k of keys) cell[k] = this._cellSpec(k, m, badgeW);
    const creditsW = anyCredits ? ICON_SIZE + ICON_GAP + creditsTextW : 0;
    const plan = planBeltRow({ px, rowW, cells: keys.map(k => cell[k].w), creditsW });
    return { keys, cell, plan, locale };
  }

  // Komórka tokenu: ikona (PNG 16 albo zmierzone emoji) · wartość w stałym slocie szablonu · strzałka trendu.
  _cellSpec(key, m, badgeW) {
    let iconW, valueW, arrow = true;
    if (key === 'research')        { iconW = m.icon['🔬']; valueW = m.valueW; }
    else if (key === 'energy')     { iconW = m.icon['⚡']; valueW = m.signedW; arrow = false; }   // bilans ze znakiem, bez trendu
    else if (key === 'prosperity') { iconW = m.icon['⭐']; valueW = m.prospW; }
    else if (key === 'hubpool')    { iconW = Math.max(m.icon['▸'], m.icon['⚠']); valueW = badgeW; arrow = false; }
    else                           { iconW = ICON_SIZE; valueW = m.valueW; }   // PNG: wydobywalne, zbieralne, paliwo
    return { iconW, valueW, arrow, w: iconW + ICON_GAP + valueW + (arrow ? VALUE_GAP + m.arrowW : 0) + TOKEN_GAP };
  }

  // Wiersz w układzie 3-strefowym: LEWA (nazwa + POP, szerokość z planu: 200 → 160 przy ujemnym budżecie, nazwa
  // z wielokropkiem) | ŚRODEK (tokeny w stałych komórkach od planu.tokenX0) | PRAWA (kredyty przypięte do końca
  // wiersza). `pw` jest wspólne dla wszystkich wierszy (bez rezerwy chevronu).
  _drawRow(ctx, col, data, px, rowTop, pw, isActive, L) {
    const cy = rowTop + ROW_H / 2;
    const m = this._metrics;
    const leftW = Math.min(L.plan.nameW, Math.max(0, pw - 40));   // na wąskim wierszu nie zjadaj całości

    // Dolna linia + highlight aktywnego (pełna szerokość wiersza)
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, rowTop + ROW_H - 0.5); ctx.lineTo(px + pw, rowTop + ROW_H - 0.5); ctx.stroke();
    if (isActive) { ctx.fillStyle = THEME.accentDim; ctx.fillRect(px, rowTop, pw, ROW_H); }

    ctx.textBaseline = 'middle';

    // ── LEWA STREFA: nazwa kolonii (z wielokropkiem, gdy nie mieści się obok POP) + POP ──
    ctx.save();
    ctx.beginPath(); ctx.rect(px, rowTop, leftW, ROW_H); ctx.clip();
    let cx = px + PAD;
    const name = col.name ?? EntityManager.get(col.planetId)?.name ?? col.planetId ?? '—';
    const civSys = col.civSystem;
    let pop = null;
    if (civSys) {
      const popFree = civSys.freePops ?? 0;
      pop = { total: civSys.population ?? 0, free: popFree, employed: civSys.employed ?? 0, locked: civSys._lockedPops ?? 0,
        base: `👤 ${_fmtPop(civSys.population ?? 0)} `, freeS: t('resBar.freeSuffix', _fmtPop(popFree)) };
      ctx.font = m.fonts.small;
      pop.w = ctx.measureText(pop.base).width + ctx.measureText(pop.freeS).width;
    }
    ctx.font = m.fonts.value;
    const nameMax = Math.max(0, leftW - PAD - (pop ? 6 + pop.w : 0) - 2);
    const shown = ellipsize(name, nameMax, (s) => ctx.measureText(s).width);
    ctx.fillStyle = isActive ? THEME.accent : THEME.textPrimary;
    ctx.fillText(shown, cx, cy);
    cx += ctx.measureText(shown).width + 6;

    if (pop) {
      const popStartX = cx;
      ctx.font = m.fonts.small;
      ctx.fillStyle = THEME.textSecondary;
      ctx.fillText(pop.base, cx, cy); cx += ctx.measureText(pop.base).width;
      ctx.fillStyle = pop.free > 0 ? THEME.success : THEME.textSecondary;   // Slice 5D (item 3): integer, nie ułamek
      ctx.fillText(pop.freeS, cx, cy); cx += ctx.measureText(pop.freeS).width;
      this._hitItems.push({ x: popStartX, y: rowTop, w: Math.max(0, Math.min(cx, px + leftW) - popStartX), h: ROW_H,
        tip: { kind: 'pop', total: pop.total, free: pop.free, employed: pop.employed, locked: pop.locked } });
    }
    ctx.restore();   // koniec lewej strefy

    // Klik lewej strefy → panel kolonii
    this._colonyRects.push({ x: px, y: rowTop, w: leftW, h: ROW_H, planetId: col.planetId });

    // Separator stref (pionowy) na granicy strefy nazwy
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(px + leftW + 0.5, rowTop + 4); ctx.lineTo(px + leftW + 0.5, rowTop + ROW_H - 4); ctx.stroke();

    // ── ŚRODEK + PRAWA: tokeny w komórkach planu; kredyty w slocie przypiętym do prawego końca ──
    if (data?.items) {
      const byKey = new Map(data.items.map(it => [it.id ?? it.kind, it]));
      for (const it of data.items) {
        // Stempel kontekstu kolonii na tokenie — tooltip rozbicia produkcji/zużycia
        // (getResourceBreakdown) jest poprawny TYLKO dla aktywnej kolonii (czyta globalny
        // window.KOSMOS dla kopalni/fabryk), więc rozbicie pokazujemy wyłącznie dla niej.
        it._col = col; it._active = isActive;
      }
      for (let i = 0; i < L.plan.visible; i++) {
        const k = L.keys[i];
        const it = byKey.get(k);
        if (it) this._drawCell(ctx, it, L.plan.xs[i], L.cell[k], cy, rowTop, L.locale);   // brak tokenu = puste miejsce
      }
      const cr = byKey.get('credits');
      if (cr && L.plan.creditsX != null) this._drawCredits(ctx, cr, L, cy, rowTop);
    }
    ctx.textBaseline = 'alphabetic';
  }

  // Tekst wartości w komórce (format wg języka i progu 10 000 — Finding 479; bilans energii ze znakiem).
  _valueText(it, locale) {
    if (it.valText != null) return it.valText;
    return it.signed ? fmtBeltSigned(it.val, locale) : fmtBeltValue(it.val, locale);
  }

  // Komórka tokenu: ikona w stałym slocie · wartość wyrównana do PRAWEJ krawędzi swojego slotu (cyfry w kolumnach
  // listy stoją równo) · strzałka trendu ▲ / ▼ (decyzja 1 (a); liczba delty — w tooltipie). Hit-rect = komórka.
  _drawCell(ctx, it, x, spec, cy, rowTop, locale) {
    const m = this._metrics;
    ctx.font = m.fonts.icon;
    ctx.fillStyle = it.color || THEME.textSecondary;
    ctx.textAlign = 'left';
    if (it.id && hasIconFile(it.id)) {
      drawResourceIcon(ctx, it.id, x, cy, ICON_SIZE, it.icon);
    } else {
      ctx.textBaseline = 'middle';
      ctx.fillText(it.icon, x, cy);
    }

    const vRight = x + spec.iconW + ICON_GAP + spec.valueW;
    ctx.font = m.fonts.value;
    ctx.fillStyle = it.raw ? (it.color || THEME.textPrimary) : THEME.textPrimary;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(this._valueText(it, locale), vRight, cy);
    ctx.textAlign = 'left';

    if (spec.arrow && it.showDelta) {
      const g = trendGlyph(it.delta ?? 0, TREND_THRESHOLD[it.kind] ?? 0.05);
      if (g) {
        ctx.font = m.fonts.small;
        ctx.fillStyle = g === TREND_UP ? THEME.success : THEME.danger;
        ctx.fillText(g, vRight + VALUE_GAP, cy);
      }
    }
    if (it.kind) this._hitItems.push({ x, y: rowTop, w: spec.w - TOKEN_GAP, h: ROW_H, tip: it });
  }

  // Kredyty: ikona na lewym brzegu slotu (wspólny x w całej liście), pełna liczba wyrównana do prawego końca
  // wiersza — nigdy nieucinana (slot ma szerokość najszerszego tekstu kredytów wszystkich kolonii, ≥ szablon 7 cyfr).
  _drawCredits(ctx, it, L, cy, rowTop) {
    const m = this._metrics;
    const x = L.plan.creditsX, right = L.plan.creditsRight;
    ctx.font = m.fonts.icon;
    ctx.fillStyle = it.color || THEME.warning;
    ctx.textAlign = 'left';
    drawResourceIcon(ctx, 'credits', x, cy, ICON_SIZE, it.icon);
    ctx.font = m.fonts.value;
    ctx.fillStyle = it.color || THEME.warning;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtBeltFull(it.val, L.locale), right, cy);
    ctx.textAlign = 'left';
    this._hitItems.push({ x, y: rowTop, w: right - x, h: ROW_H, tip: it });
  }

  // ── Tooltip (port z BottomResourceBar — dane per token, bez globalnego breakdown) ──
  _buildTooltipLines(item) {
    const lines = [];
    const loc = getLocale();   // U0-3 (Finding 479): liczby tooltipu wg języka, jak w belce
    if (item.kind === 'resource' || item.kind === 'commodity') {
      const prefix = item.kind === 'commodity' ? 'commodity' : 'resource';
      const def = item.kind === 'commodity'
        ? (COMMODITIES[item.id] ?? { id: item.id })
        : (MINED_RESOURCES[item.id] ?? HARVESTED_RESOURCES[item.id] ?? { id: item.id });
      const name = getName({ id: item.id, namePL: def.namePL, nameEN: def.nameEN }, prefix);
      lines.push({ text: name, color: THEME.accent, bold: true, iconId: item.id, emoji: item.icon });
      lines.push({ text: t('ui.amount', fmtBeltPrecise(item.val, loc)), color: THEME.textPrimary });
      if (Math.abs(item.delta) > 0.01) {
        lines.push({ text: t('ui.change', fmtBeltDelta(item.delta, loc)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      this._appendBreakdownLines(lines, item);   // źródła produkcji/zużycia (aktywna kolonia)
      return lines;
    }
    if (item.kind === 'research') {
      lines.push({ text: `🔬 ${t('resource.research')}`, color: THEME.accent, bold: true });
      if (item.global) lines.push({ text: t('resBar.researchGlobal'), color: THEME.textDim });
      lines.push({ text: t('ui.amount', fmtBeltPrecise(item.val, loc)), color: THEME.textPrimary });
      if (Math.abs(item.delta) > 0.01) {
        lines.push({ text: t('ui.change', fmtBeltDelta(item.delta, loc)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      return lines;
    }
    if (item.kind === 'credits') {
      lines.push({ text: t('resBar.credits'), color: THEME.accent, bold: true, iconId: 'credits', emoji: item.icon });
      lines.push({ text: t('ui.amount', fmtBeltFull(item.val, loc)), color: THEME.warning });
      return lines;
    }
    if (item.kind === 'pop') {
      lines.push({ text: `👤 ${t('topBar.populationLabel')}`, color: THEME.accent, bold: true });
      // Slice 5D (item 3): LICZBY CAŁKOWITE (koniec ułamków jak „locked 10.2"). `total`/`employed`
      // już całkowite (population = Σstrata + unemployed); `free`/`locked` zaokrąglone — locks mogą
      // zostać ułamkowe wewnętrznie (_distributeLock), `total` jest autorytatywną sumą POP.
      lines.push({ text: `${t('topBar.employed')} ${_fmtPop(item.employed)}`, color: THEME.textPrimary });
      lines.push({ text: `${t('topBar.freePops')} ${_fmtPop(item.free)}`,
        color: item.free > 0 ? THEME.success : THEME.textSecondary });
      if (Math.round(item.locked) > 0) lines.push({ text: `${t('topBar.locked')} ${_fmtPop(item.locked)}`, color: THEME.warning });
      lines.push({ text: `${t('ui.amount', _fmtPop(item.total))}`, color: THEME.textSecondary });
      return lines;
    }
    if (item.kind === 'prosperity') {
      const descKey = item.val < 30 ? 'resBar.prospLow' : item.val < 60 ? 'resBar.prospMedium' : 'resBar.prospHigh';
      lines.push({ text: `⭐ ${t('workforce.prosperity')}`, color: THEME.accent, bold: true });
      lines.push({ text: t('resBar.prospValue', item.val, t(descKey)), color: item.color || THEME.textPrimary });
      if (Math.abs(item.delta) > 0.5) {
        lines.push({ text: t('ui.change', fmtBeltDelta(item.delta, loc)),
          color: item.delta >= 0 ? THEME.success : THEME.danger });
      }
      return lines;
    }
    if (item.kind === 'energy') {
      const e = item.energy || {};
      lines.push({ text: `⚡ ${t('resource.energy')}`, color: THEME.accent, bold: true });
      lines.push({ text: t('ui.production', fmtBeltPrecise(e.production ?? 0, loc)), color: THEME.success });
      lines.push({ text: t('ui.consumption', fmtBeltPrecise(e.consumption ?? 0, loc)), color: THEME.danger });
      const bal = e.balance ?? 0;
      lines.push({ text: t('ui.balance', (bal >= 0 ? '+' : '') + fmtBeltPrecise(bal, loc)),
        color: bal >= 0 ? THEME.success : THEME.danger });
      if (e.brownout) lines.push({ text: t('topBar.brownoutWarning'), color: THEME.danger });
      // Rozbicie per budynek (id syntetyczne 'energy' — item energii nie ma .id)
      this._appendBreakdownLines(lines, { id: 'energy', _active: item._active, _col: item._col });
      return lines;
    }
    if (item.kind === 'hubpool') {
      lines.push({ text: t('station.systemPool'), color: THEME.accent, bold: true });
      if (item._hubStatus === 'severed') {
        lines.push({ text: t('colony.hubLinkSevered'), color: THEME.danger });
        return lines;
      }
      lines.push({ text: `${t('colony.hubLinked')} ▸ ${item._anchorName}`, color: THEME.textSecondary });
      // Agregat + rozbicie per-ciało z ISTNIEJĄCEGO snapshotu (bez nowej agregacji — read-only).
      const snap = window.KOSMOS?.systemPoolService?.getPoolSnapshot?.(item._anchorPlanetId);
      if (snap) {
        for (const { colony, inv } of snap.byBody) {
          const nm = colony.name ?? EntityManager.get(colony.planetId)?.name ?? colony.planetId;
          const parts = [...inv].filter(([, v]) => v > 0).slice(0, 6).map(([k, v]) => `${k} ${fmtBeltValue(v, loc)}`).join('  ');
          lines.push({ text: `▸ ${nm}: ${parts || '—'}`, color: THEME.textDim });
        }
      }
      return lines;
    }
    return null;
  }

  // Dopisuje do tooltipu rozbicie surowca na ŹRÓDŁA produkcji i zużycia
  // (kopalnie, baza, populacja, fabryki, budynki spalające surowiec — np. coal_plant).
  // Tylko dla AKTYWNEJ kolonii: getResourceBreakdown sekcje kopalni/fabryk czytają
  // globalny window.KOSMOS, więc dla rozwiniętych (nieaktywnych) kolonii byłyby błędne.
  _appendBreakdownLines(lines, item) {
    if (!item?._active || !item.id) return;
    const loc = getLocale();
    const rs = item._col?.resourceSystem;
    if (!rs || typeof rs.getResourceBreakdown !== 'function') return;
    const bd = rs.getResourceBreakdown(item.id);
    if (!bd) return;

    const prodKeys = Object.keys(bd.producers ?? {});
    const consKeys = Object.keys(bd.consumers ?? {});
    if (prodKeys.length === 0 && consKeys.length === 0) return;

    if (prodKeys.length > 0) {
      lines.push({ text: t('econPanel.producers'), color: THEME.textDim });
      for (const type of prodKeys) {
        const g = bd.producers[type];
        const meta = this._breakdownTypeMeta(type);
        const cnt = g.count > 1 ? ` ×${g.count}` : '';
        lines.push({ text: `${meta.icon} ${meta.name}${cnt}  +${fmtBeltValue(g.total, loc)}/r`, color: THEME.success });
      }
    }
    if (consKeys.length > 0) {
      lines.push({ text: t('econPanel.consumers'), color: THEME.textDim });
      for (const type of consKeys) {
        const g = bd.consumers[type];   // total ujemny
        const meta = this._breakdownTypeMeta(type);
        const cnt = g.count > 1 ? ` ×${g.count}` : '';
        lines.push({ text: `${meta.icon} ${meta.name}${cnt}  ${fmtBeltValue(g.total, loc)}/r`, color: THEME.danger });
      }
    }
  }

  // Mapuje klucz typu z getResourceBreakdown na nazwę (i18n) + ikonę.
  // Pseudo-typy 'mine'/'factory' są budynkami w BUILDINGS (rozwiązują się same).
  _breakdownTypeMeta(type) {
    if (type === 'pop_consumption') return { name: t('topBar.popConsumption'), icon: '👥' };
    if (type === 'colony_base')     return { name: t('topBar.colonyBase'),     icon: '🏛' };
    const def = BUILDINGS[type];
    if (def) return { name: getName(def, 'building'), icon: def.icon ?? '🏭' };
    return { name: type, icon: '•' };
  }

  drawTooltip(ctx, W, H) {
    const tip = this._hoverTip;
    if (!tip || !tip.lines?.length) return;
    const PADX = 8, PADY = 6, LINE_H = 15, HDR_H = 17, TIP_ICON = 14, ICON_GAP = 4;

    let maxW = 0, totalH = PADY * 2;
    for (const ln of tip.lines) {
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const iconW = ln.iconId ? TIP_ICON + ICON_GAP : 0;
      maxW = Math.max(maxW, iconW + ctx.measureText(ln.text).width);
      totalH += ln.bold ? HDR_H : LINE_H;
    }
    const tw = maxW + PADX * 2;
    const th = totalH;

    // Pozycja: POD kursorem (pasek jest u góry), z clampem
    let tx = tip.mx + 12;
    let ty = tip.my + 16;
    if (tx + tw > W - 4) tx = W - tw - 4;
    if (tx < 4) tx = 4;
    if (ty + th > H - 4) ty = tip.my - th - 8;

    ctx.fillStyle = bgAlpha(0.96);
    ctx.fillRect(tx, ty, tw, th);
    ctx.strokeStyle = GLASS_BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(tx + 0.5, ty + 0.5, tw - 1, th - 1);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    let cyy = ty + PADY;
    for (const ln of tip.lines) {
      ctx.font = `${ln.bold ? THEME.fontSizeNormal : THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = ln.color || THEME.textPrimary;
      const lh = ln.bold ? HDR_H : LINE_H;
      let textX = tx + PADX;
      if (ln.iconId) {
        drawResourceIcon(ctx, ln.iconId, tx + PADX, cyy + lh / 2, TIP_ICON, ln.emoji);
        textX += TIP_ICON + ICON_GAP;
      }
      ctx.fillText(ln.text, textX, cyy + lh - 5);
      cyy += lh;
    }
  }

  // ── Hit / zdarzenia ─────────────────────────────────────────────────────
  handleMouseMove(x, y) {
    const overTrigger = pointInRect(this._triggerRect, x, y);
    const overPanel   = this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
    // U0-2 (D-UI-11): hover NIE rozwija listy — tylko wyróżnienie chevronu i tooltipy tokenów.
    const hovered = overTrigger || overPanel;
    if (hovered !== this._hovered) { this._hovered = hovered; this._markDirty(); }

    // Tooltip per token — działa nad pasmem stałym (zawsze) ORAZ rozwiniętym panelem.
    this._hoverTip = null;
    if (overTrigger || overPanel) {
      for (const hit of this._hitItems) {
        if (x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h) {
          const lines = this._buildTooltipLines(hit.tip);
          if (lines && lines.length) this._hoverTip = { lines, mx: x, my: y };
          break;
        }
      }
    }
  }

  handleClick(x, y) {
    const overBand  = pointInRect(this._triggerRect, x, y);
    const overPanel = this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
    // U0-2 (§7.13): klik poza pasmem i listą = zwiń, ale klik NIE jest pochłaniany (idzie dalej).
    if (!overBand && !overPanel) { this._setOpen(false); return false; }

    // Klik nazwy kolonii (pasmo stałe lub rozwinięte) → przełącz aktywną (swap systemów)
    // + otwórz panel kolonii. Wzór z Outliner._handleClick (colony). Wybór kończy rozwinięcie listy.
    for (const c of this._colonyRects) {
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        const colMgr = window.KOSMOS?.colonyManager;
        if (colMgr && c.planetId) {
          const colony = colMgr.getColony?.(c.planetId);
          const colSysId = colony?.systemId ?? 'sys_home';
          const ssMgr = window.KOSMOS?.starSystemManager;
          if (ssMgr?.activeSystemId && colSysId !== ssMgr.activeSystemId) ssMgr.switchActiveSystem(colSysId);
          colMgr.switchActiveColony(c.planetId);
        }
        window.KOSMOS?.overlayManager?.openPanel?.('colony');
        this._setOpen(false);
        return true;
      }
    }
    // Klik w pasmo poza nazwą → rozwiń / zwiń (D-UI-11). Klik w rozwiniętą listę poza nazwą — nic.
    // Oba pochłaniane (wewnątrz prostokąta belki — nie spadają na overlay/3D).
    if (overBand) this._setOpen((this._extraCount ?? 0) > 0 ? !this._open : false);
    return true;
  }

  handleWheel(x, y, deltaY) {
    if (this._slideProgress <= 0.001 || !pointInRect(this._panelRect, x, y)) return false;
    const prev = this._scrollY;
    this._scrollY = clampScroll(this._scrollY + deltaY, this._maxScroll);
    if (this._scrollY !== prev) this._markDirty();
    return true;
  }

  // Blokada kamery: trigger lub rozwinięty panel
  isOver(x, y) {
    if (pointInRect(this._triggerRect, x, y)) return true;
    return this._slideProgress > 0.01 && pointInRect(this._panelRect, x, y);
  }
}
