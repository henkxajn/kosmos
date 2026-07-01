// ObservatoryOverlay — zakładka Obserwatorium (klawisz O)
//
// DOM overlay z podzakładkami: KATALOG | ZAGROŻENIA
// KATALOG = połączony SCAN+ORBITS: tabela ciał + log odkryć + szczegóły z orbitą SVG
// Prawa kolumna: szczegóły wybranego ciała z miniaturą i wizualizacją orbity
//
// Komunikacja:
//   Czyta: window.KOSMOS.{observatorySystem, collisionForecast, colonyManager}
//   Emituje: 'body:selected' (focus kamery po kliknięciu ciała)

import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { COSMIC }        from '../config/LayoutConfig.js';
import { GAME_CONFIG }   from '../config/GameConfig.js';
import { CIV_SIDEBAR_W } from './CivPanelDrawer.js';
import { t }             from '../i18n/i18n.js';

// Typy ciał wyświetlane w katalogu
const ORBIT_TYPES = ['planet', 'moon', 'planetoid'];

export class ObservatoryOverlay {
  constructor() {
    this.visible = false;
    this._container = null;
    this._subTab = 'catalog';  // 'catalog' | 'threats'
    this._selectedBodyId = null;
    this._syncTimer = null;
    this._scrollPositions = {};
    this._onWheel = this._onWheel.bind(this);
  }

  // ── OverlayManager API ──────────────────────────────────────────────
  toggle() { this.visible ? this.hide() : this.show(); }
  show()   {
    this.visible = true;  this._createDOM(); this._startSync();
    // Przesuń widok 3D tak, by wyfokusowane ciało trafiło w prawą-dolną część (pod danymi).
    const f = this._computePreviewFrac();
    window.KOSMOS?.threeRenderer?.enterObservatoryPreview?.(f.fracX, f.fracY);
  }
  hide()   {
    this.visible = false; this._destroyDOM(); this._stopSync();
    window.KOSMOS?.threeRenderer?.exitObservatoryPreview?.();
  }

  // Docelowy punkt ekranu dla podglądu ciała (środek prawej kolumny, poniżej danych),
  // jako ułamek przesunięcia względem środka ekranu (dla camera.setViewOffset).
  _computePreviewFrac() {
    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const W = window.innerWidth, H = window.innerHeight;
    const left   = CIV_SIDEBAR_W * S;
    const right  = W - COSMIC.OUTLINER_W * S;
    const top    = (COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H + COSMIC.SUBNAV_H) * S;
    const bottom = H - (COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H) * S;
    const ow = right - left;
    const rightColCenterX = left + ow * 0.70;              // środek prawej kolumny (flex 2:3)
    const bodyTargetY     = top + (bottom - top) * 0.67;   // poniżej bloku danych
    return { fracX: rightColCenterX / W - 0.5, fracY: bodyTargetY / H - 0.5 };
  }

  draw() {}

  handleClick(x, y)  { return this.visible && this._isInOverlayArea(x, y); }
  handleMouseMove()  {}
  handleScroll(delta, x, y) {
    if (!this.visible || !this._isInOverlayArea(x, y)) return false;
    const scrollEl = this._container?.querySelector('.obs-scroll-main');
    if (scrollEl) scrollEl.scrollTop += delta;
    return true;
  }

  /** Czy punkt (x,y) jest w obszarze overlaya (nie TopBar/BottomBar/Outliner) */
  _isInOverlayArea(x, y) {
    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const W = Math.round(window.innerWidth / S);
    const H = Math.round(window.innerHeight / S);
    return x >= CIV_SIDEBAR_W &&
           x <= W - COSMIC.OUTLINER_W &&
           y >= COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H + COSMIC.SUBNAV_H &&
           y <= H - COSMIC.BOTTOM_NAV_H - COSMIC.BOTTOM_LOG_TRIG_H;
  }

  // ── Wheel handler (bezpośrednio na DOM) ─────────────────────────────

  _onWheel(e) {
    const scrollEl = this._container?.querySelector('.obs-scroll-main');
    if (!scrollEl) return;
    e.preventDefault();
    e.stopPropagation();
    scrollEl.scrollTop += e.deltaY;
  }

  // ── DOM ─────────────────────────────────────────────────────────────

  _createDOM() {
    if (this._container) return;

    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);

    const c = document.createElement('div');
    c.id = 'observatory-overlay';
    c.style.cssText = `
      position: fixed;
      top: ${Math.round((COSMIC.TOP_BAND_H + COSMIC.MAP_MODE_H + COSMIC.SUBNAV_H) * S)}px;
      left: ${Math.round(CIV_SIDEBAR_W * S)}px;
      right: ${Math.round(COSMIC.OUTLINER_W * S)}px;
      bottom: ${Math.round((COSMIC.BOTTOM_NAV_H + COSMIC.BOTTOM_LOG_TRIG_H) * S)}px;
      background: ${bgAlpha(0.38)}; color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily};
      z-index: 50; display: flex; flex-direction: column; padding: 10px 14px;
      overflow: hidden;
    `;

    // Custom scrollbar CSS
    const style = document.createElement('style');
    style.textContent = `
      #observatory-overlay ::-webkit-scrollbar { width: 6px; }
      #observatory-overlay ::-webkit-scrollbar-track { background: ${THEME.bgSecondary}; border-radius: 3px; }
      #observatory-overlay ::-webkit-scrollbar-thumb { background: ${THEME.borderLight}; border-radius: 3px; }
      #observatory-overlay ::-webkit-scrollbar-thumb:hover { background: ${THEME.borderActive}; }
    `;
    c.appendChild(style);

    // Nagłówek
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:8px; flex-shrink:0;';
    header.innerHTML = `
      <span style="font-size:${THEME.fontSizeMedium}px; color:${THEME.accent}">🔭 ${t('observatory.title')}</span>
      <span id="obs-status" style="font-size:11px; color:${THEME.textDim}"></span>
    `;
    c.appendChild(header);

    // Podzakładki — KATALOG | ZAGROŻENIA | (KONTAKTY gdy reforma detekcji ON)
    const tabs = document.createElement('div');
    tabs.id = 'obs-tabs';
    tabs.style.cssText = 'display:flex; gap:2px; margin-bottom:8px; flex-shrink:0;';
    const tabList = ['catalog', 'threats'];
    if (GAME_CONFIG.FEATURES?.observatoryVesselScan) tabList.push('contacts');
    for (const tab of tabList) {
      const btn = document.createElement('button');
      btn.dataset.tab = tab;
      btn.textContent = t(`observatory.tab.${tab}`);
      btn.style.cssText = this._tabStyle(tab === this._subTab);
      btn.onclick = () => { this._saveScroll(); this._subTab = tab; this._refresh(); };
      tabs.appendChild(btn);
    }
    c.appendChild(tabs);

    // Treść
    const body = document.createElement('div');
    body.id = 'obs-body';
    body.style.cssText = 'display:flex; gap:10px; flex:1; min-height:0;';
    c.appendChild(body);

    c.addEventListener('wheel', this._onWheel, { passive: false });

    document.body.appendChild(c);
    this._container = c;
    this._refresh();
  }

  _tabStyle(active) {
    return `
      padding: 5px 14px; border: 1px solid ${active ? THEME.accent : THEME.border};
      border-radius: 3px; font-size: 11px; font-family: ${THEME.fontFamily};
      background: ${active ? THEME.accent : 'transparent'};
      color: ${active ? THEME.bgPrimary : THEME.textPrimary};
      cursor: pointer; font-weight: ${active ? 'bold' : 'normal'};
      transition: background 0.15s;
    `;
  }

  _destroyDOM() {
    if (this._container) {
      this._container.removeEventListener('wheel', this._onWheel);
      this._container.remove();
      this._container = null;
    }
  }

  _startSync() {
    this._syncTimer = setInterval(() => { if (this.visible) this._refresh(); }, 2000);
    // Szybki tick tylko dla płynnego paska skanu ciała (in-place, bez rebuildu innerHTML).
    this._scanTimer = setInterval(() => this._scanTick(), 250);
  }

  _stopSync() {
    if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
    if (this._scanTimer) { clearInterval(this._scanTimer); this._scanTimer = null; }
  }

  // Płynny update paska skanu wybranego ciała. Zmiana strukturalna (start/koniec skanu,
  // zmiana poziomu) → pełny _refresh; inaczej mutacja w miejscu (bez resetu scrolla).
  _scanTick() {
    if (!this.visible || !this._container) return;
    if (this._subTab !== 'catalog' || !this._selectedBodyId) return;
    const key = this._currentPanelStateKey();
    if (key !== this._panelStateKey) { this._refresh(); return; }
    const prog = window.KOSMOS?.observatorySystem?.getBodyScanProgress?.(this._selectedBodyId);
    if (prog) this._updateScanProgressDOM(prog.pct);
  }

  // Klucz stanu panelu (id + poziom + czy skanowany) — do wykrywania zmian strukturalnych.
  _currentPanelStateKey() {
    const id = this._selectedBodyId;
    if (!id) return 'none';
    const b = EntityManager.get(id);
    const scanning = !!window.KOSMOS?.observatorySystem?.getBodyScanProgress?.(id);
    return `${id}|${b ? this._bodyTier(b) : 'gone'}|${scanning}`;
  }

  // Mutacja w miejscu paska/etykiet/progresywnych wierszy podczas skanu.
  _updateScanProgressDOM(pct) {
    const c = this._container;
    if (!c) return;
    const bar = c.querySelector('#obs-scan-bar');
    if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
    const lbl = c.querySelector('#obs-scan-pct');
    if (lbl) lbl.textContent = t('observatory.scanning', Math.round(pct * 100));
    const phase = c.querySelector('#obs-scan-phase');
    if (phase) phase.textContent = this._scanPhaseLabel(pct);
    c.querySelectorAll('[data-reveal]').forEach(el => {
      el.style.opacity = pct >= parseFloat(el.dataset.reveal) ? '1' : '0';
    });
  }

  // ── Scroll persistence ────────────────────────────────────────────

  _saveScroll() {
    if (!this._container) return;
    const scrollEl = this._container.querySelector('.obs-scroll-main');
    if (scrollEl) this._scrollPositions[this._subTab] = scrollEl.scrollTop;
  }

  _restoreScroll() {
    if (!this._container) return;
    const scrollEl = this._container.querySelector('.obs-scroll-main');
    if (scrollEl && this._scrollPositions[this._subTab] != null) {
      scrollEl.scrollTop = this._scrollPositions[this._subTab];
    }
  }

  // ── Odświeżanie treści ──────────────────────────────────────────────

  _refresh() {
    if (!this._container) return;
    this._saveScroll();

    const obsSys = window.KOSMOS?.observatorySystem;
    const forecast = window.KOSMOS?.collisionForecast;
    const colMgr = window.KOSMOS?.colonyManager;

    // Status
    const maxLevel = obsSys?.getMaxObservatoryLevel() ?? 0;
    const statusEl = this._container.querySelector('#obs-status');
    if (statusEl) {
      if (maxLevel <= 0) {
        statusEl.textContent = t('observatory.noObservatory');
      } else {
        const dr = obsSys.getDisasterReduction(colMgr?.activePlanetId);
        const yb = obsSys.getMissionYieldBonus(colMgr?.activePlanetId);
        const wy = obsSys.getWarningYears();
        statusEl.textContent = `Lv${maxLevel} | -${dr.toFixed(1)}% ${t('observatory.disaster')} | +${(yb * 100).toFixed(0)}% yield | ${wy.toFixed(1)}${t('observatory.warningYearsShort')}`;
      }
    }

    // Aktualizuj podzakładki
    const tabs = this._container.querySelector('#obs-tabs');
    if (tabs) {
      tabs.querySelectorAll('[data-tab]').forEach(btn => {
        btn.style.cssText = this._tabStyle(btn.dataset.tab === this._subTab);
      });
    }

    // Treść
    const body = this._container.querySelector('#obs-body');
    if (!body) return;

    switch (this._subTab) {
      case 'catalog':  body.innerHTML = this._renderCatalog(obsSys); break;
      case 'threats':  body.innerHTML = this._renderThreats(forecast); break;
      case 'contacts': body.innerHTML = this._renderContacts(obsSys); break;
    }

    // Bind kliki na ciałach
    body.querySelectorAll('[data-bodyid]').forEach(el => {
      el.onclick = () => {
        const bodyId = el.dataset.bodyid;
        this._selectedBodyId = bodyId;
        const entity = EntityManager.get(bodyId);
        if (entity) EventBus.emit('body:selected', { entity });
        this._refresh();
      };
      el.style.cursor = 'pointer';
    });

    // Reforma detekcji — przyciski skanu wrogich kontaktów
    body.querySelectorAll('[data-scanaction]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.vesselid;
        const obs = window.KOSMOS?.observatorySystem;
        if (btn.dataset.scanaction === 'start') obs?.startVesselScan?.(id);
        else obs?.cancelVesselScan?.(id, 'manual');
        this._refresh();
      };
    });

    // Reforma obserwatorium — przyciski ręcznego skanu ciała (Skanuj/Anuluj)
    body.querySelectorAll('[data-bodyscanaction]').forEach(btn => {
      btn.onclick = (ev) => {
        ev.stopPropagation();
        const id = btn.dataset.bodyid;
        const obs = window.KOSMOS?.observatorySystem;
        if (btn.dataset.bodyscanaction === 'start') obs?.startBodyScan?.(id);
        else obs?.cancelBodyScan?.(id, 'manual');
        this._refresh();
      };
    });

    // Zapisz klucz stanu panelu (do wykrywania zmian strukturalnych w _scanTick).
    this._panelStateKey = this._currentPanelStateKey();

    requestAnimationFrame(() => this._restoreScroll());
  }

  // ── KATALOG (połączony SCAN + ORBITS) ──────────────────────────────

  _renderCatalog(obsSys) {
    const discoveries = obsSys?.getDiscoveries() ?? [];
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // Zbierz ciała
    const allBodies = [];
    let exploredCount = 0;
    let analyzedCount = 0;
    for (const type of ORBIT_TYPES) {
      for (const b of EntityManager.getByTypeInSystem(type, sysId)) {
        allBodies.push(b);
        if (b.explored) exploredCount++;
        if (b.analyzed) analyzedCount++;
      }
    }
    allBodies.sort((a, b) => (a.orbital?.a ?? 0) - (b.orbital?.a ?? 0));

    // ── Lewa kolumna: tabela ciał + log odkryć ──
    let html = `<div class="obs-scroll-main" style="flex:2; overflow-y:auto; min-height:0; padding-right:6px;">`;

    // Statystyki
    html += `<div style="color:${THEME.textDim}; margin-bottom:6px; font-size:12px;">`;
    html += `${t('observatory.surveyedCount')}: <span style="color:#44ccff">${exploredCount}</span> · `;
    html += `${t('observatory.analyzedCount')}: <span style="color:${THEME.success}">${analyzedCount}</span> / ${allBodies.length}`;
    html += `</div>`;

    // Tabela ciał
    html += `<table style="width:100%; border-collapse:collapse; font-size:11px; color:${THEME.textPrimary};">`;
    html += `<thead><tr style="color:${THEME.textHeader}; border-bottom:1px solid ${THEME.border}; position:sticky; top:0; background:${bgAlpha(0.70)};">`;
    html += `<th style="text-align:left; padding:4px 6px;">${t('observatory.name')}</th>`;
    html += `<th style="padding:4px;">${t('observatory.type')}</th>`;
    html += `<th style="padding:4px;">a (AU)</th>`;
    html += `<th style="padding:4px;">e</th>`;
    html += `<th style="padding:4px;">T (${t('observatory.years')})</th>`;
    html += `</tr></thead><tbody>`;

    for (const b of allBodies) {
      const orb = b.orbital ?? {};
      const selected = this._selectedBodyId === b.id;
      const bg = selected ? THEME.accentMed : 'transparent';
      const icon = b.type === 'planet' ? '🪐' : b.type === 'moon' ? '🌙' : '🪨';
      const explored = b.explored;

      const glyph = this._tierGlyph(this._bodyTier(b));
      html += `<tr data-bodyid="${b.id}" style="background:${bg}; border-bottom:1px solid ${THEME.border};" onmouseover="this.style.background='${THEME.accentDim}'" onmouseout="this.style.background='${selected ? THEME.accentMed : 'transparent'}'">`;
      html += `<td style="padding:3px 6px; color:${explored ? THEME.textPrimary : THEME.textDim};">${glyph} ${icon} ${explored ? (b.name ?? b.id) : '???'}</td>`;
      html += `<td style="text-align:center; color:${THEME.textDim}; padding:3px;">${explored ? (b.planetType ?? b.type) : '—'}</td>`;
      html += `<td style="text-align:center; padding:3px;">${(orb.a ?? 0).toFixed(2)}</td>`;
      html += `<td style="text-align:center; padding:3px;">${explored ? (orb.e ?? 0).toFixed(3) : '—'}</td>`;
      html += `<td style="text-align:center; padding:3px;">${explored ? (orb.T ?? 0).toFixed(2) : '—'}</td>`;
      html += `</tr>`;
    }
    html += `</tbody></table>`;

    // Log odkryć (ostatnie)
    if (discoveries.length > 0) {
      html += `<div style="margin-top:12px; font-weight:bold; color:${THEME.textHeader}; font-size:11px; text-transform:uppercase; margin-bottom:4px;">${t('observatory.discoveryLog')}</div>`;
      const recent = discoveries.slice(-10).reverse();
      for (const d of recent) {
        html += `<div data-bodyid="${d.bodyId}" style="padding:4px 8px; margin-bottom:2px; border-radius:3px; font-size:10px; background:${THEME.accentDim}; border-left:2px solid ${THEME.accent};">`;
        html += `<span style="color:${THEME.accent}">${EntityManager.get(d.bodyId)?.name ?? d.bodyName}</span>`;
        html += ` <span style="color:${THEME.textDim}">— ${d.colonyName}, ${t('observatory.year')} ${Math.round(d.year)}</span>`;
        html += `</div>`;
      }
    }

    html += `</div>`;

    // ── Prawa kolumna: szczegóły ──
    html += this._renderBodyDetails();
    return html;
  }

  // ── ZAGROŻENIA ──────────────────────────────────────────────────────

  _renderThreats(forecast) {
    // Sortowanie od najwcześniejszych
    const alerts = (forecast?.getAlerts() ?? []).slice().sort((a, b) => a.yearsUntil - b.yearsUntil);
    const warnings = (window.KOSMOS?.randomEventSystem?.getWarnings() ?? []).slice().sort((a, b) => a.remainingYears - b.remainingYears);

    // Kolonie gracza
    const colMgr = window.KOSMOS?.colonyManager;
    const playerPlanetIds = new Set();
    if (colMgr?.colonies) {
      for (const col of colMgr.colonies.values()) playerPlanetIds.add(col.planetId);
    }
    if (window.KOSMOS?.homePlanet?.id) playerPlanetIds.add(window.KOSMOS.homePlanet.id);

    let html = `<div class="obs-scroll-main" style="flex:1; overflow-y:auto; min-height:0; padding-right:4px;">`;

    // ── Podsumowanie ──
    const totalThreats = alerts.length + warnings.length;
    if (totalThreats === 0) {
      html += `<div style="padding:12px; margin-bottom:12px; border-radius:4px; background:${THEME.accentDim}; border:1px solid ${THEME.border}; text-align:center;">`;
      html += `<div style="font-size:16px; margin-bottom:4px;">✓</div>`;
      html += `<div style="color:${THEME.success}; font-size:12px; font-weight:bold;">${t('observatory.systemStable')}</div>`;
      html += `</div>`;
    } else {
      const dangerCount = alerts.filter(a =>
        playerPlanetIds.has(a.bodyAId) || playerPlanetIds.has(a.bodyBId)
      ).length + warnings.filter(w => w.event?.severity === 'danger').length;

      const hasDanger = dangerCount > 0;
      html += `<div style="padding:8px 12px; margin-bottom:10px; border-radius:4px; background:${hasDanger ? 'rgba(255,51,68,0.07)' : 'rgba(255,204,68,0.06)'}; border:1px solid ${hasDanger ? 'rgba(255,51,68,0.33)' : 'rgba(255,204,68,0.27)'};">`;
      html += `<span style="color:${hasDanger ? THEME.danger : THEME.warning}; font-weight:bold; font-size:13px;">`;
      html += `⚠ ${totalThreats} `;
      html += totalThreats === 1 ? t('observatory.threatSingular') : t('observatory.threatPlural');
      html += `</span>`;
      if (dangerCount > 0) {
        html += ` <span style="color:${THEME.danger}; font-size:11px;">(${dangerCount} ${t('observatory.critical')})</span>`;
      }
      html += `</div>`;
    }

    // ── Alerty kolizyjne ──
    html += `<div style="font-weight:bold; margin-bottom:6px; color:${THEME.warning}; font-size:12px; text-transform:uppercase;">`;
    html += `☄ ${t('observatory.collisionAlerts')}`;
    html += `</div>`;

    if (alerts.length === 0) {
      html += `<div style="color:${THEME.textDim}; font-size:11px; margin-bottom:14px; font-style:italic;">— ${t('observatory.noCollisions')}</div>`;
    } else {
      for (const a of alerts) {
        const isPlayerThreat = playerPlanetIds.has(a.bodyAId) || playerPlanetIds.has(a.bodyBId);
        const years = Math.max(0, a.yearsUntil);
        const timeStr = this._formatThreatTime(years);
        const urgencyColor = years < 5 ? THEME.danger : years < 50 ? THEME.warning : THEME.textSecondary;
        // Aktualne nazwy z EntityManager (mogły zostać zmienione)
        const nameA = EntityManager.get(a.bodyAId)?.name ?? a.bodyAName;
        const nameB = EntityManager.get(a.bodyBId)?.name ?? a.bodyBName;

        const cardColor = isPlayerThreat ? THEME.danger : urgencyColor;
        const cardBg = isPlayerThreat ? 'rgba(255,51,68,0.07)' : 'transparent';

        html += `<div style="padding:8px 10px; margin-bottom:5px; border-radius:4px; font-size:12px; background:${cardBg}; border-left:3px solid ${cardColor};">`;
        html += `<div style="display:flex; align-items:center; gap:6px;">`;
        html += `<span style="color:${cardColor}; font-weight:bold; font-size:13px;">${isPlayerThreat ? '🚨' : '☄'}</span>`;
        html += `<span style="color:${cardColor}; font-weight:bold;">${nameA} → ${nameB}</span>`;
        if (isPlayerThreat) {
          html += `<span style="color:${THEME.danger}; font-size:9px; background:${THEME.danger}18; padding:1px 5px; border-radius:2px; font-weight:bold; text-transform:uppercase;">${t('observatory.yourColony')}</span>`;
        }
        html += `</div>`;
        html += `<div style="color:${urgencyColor}; margin-top:4px; font-size:12px; font-weight:bold;">⏱ ${timeStr}</div>`;
        html += `</div>`;
      }
    }

    // ── Ostrzeżenia o zdarzeniach ──
    html += `<div style="font-weight:bold; margin:14px 0 6px; color:${THEME.warning}; font-size:12px; text-transform:uppercase;">`;
    html += `⚡ ${t('observatory.eventWarnings')}`;
    html += `</div>`;

    if (warnings.length === 0) {
      html += `<div style="color:${THEME.textDim}; font-size:11px; font-style:italic;">— ${t('observatory.noWarnings')}</div>`;
    } else {
      for (const w of warnings) {
        const name = t(`event.${w.event.id}.name`) !== `event.${w.event.id}.name`
          ? t(`event.${w.event.id}.name`) : (w.event.namePL ?? w.event.id);
        const sev = w.event.severity ?? 'warning';
        const sevColor = sev === 'danger' ? THEME.danger : sev === 'warning' ? THEME.warning : THEME.textSecondary;
        const sevBg = sev === 'danger' ? 'rgba(255,51,68,0.07)' : 'rgba(255,204,68,0.06)';
        const remainYears = Math.max(0, w.remainingYears);
        const timeStr = this._formatThreatTime(remainYears);

        html += `<div style="padding:8px 10px; margin-bottom:5px; border-radius:4px; font-size:12px; background:${sevBg}; border-left:3px solid ${sevColor};">`;
        html += `<div style="display:flex; align-items:center; gap:6px;">`;
        html += `<span style="font-size:13px;">${w.event.icon ?? '⚠'}</span>`;
        html += `<span style="color:${sevColor}; font-weight:bold;">${name}</span>`;
        if (sev === 'danger') {
          html += `<span style="color:${THEME.danger}; font-size:9px; background:${THEME.danger}18; padding:1px 5px; border-radius:2px; font-weight:bold;">${t('observatory.dangerLabel')}</span>`;
        }
        html += `</div>`;
        html += `<div style="margin-top:4px;">`;
        html += `<span style="color:${THEME.textPrimary}">→ ${w.colonyName}</span>`;
        html += ` · <span style="color:${sevColor}; font-weight:bold;">⏱ ${timeStr}</span>`;
        html += `</div>`;
        if (w.event.defenseTag) {
          const defenseLabel = t(`observatory.defense.${w.event.defenseTag}`);
          html += `<div style="margin-top:3px; font-size:10px; color:${THEME.textDim};">🛡 ${t('observatory.defendWith')}: ${defenseLabel}</div>`;
        }
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  /** Formatuje czas do kolizji/zdarzenia czytelnie */
  _formatThreatTime(years) {
    if (years < 1)    return t('observatory.timeImminent');
    if (years < 5)    return t('observatory.timeLessThan', 5);
    if (years < 20)   return t('observatory.timeAbout', Math.round(years));
    if (years < 100)  return t('observatory.timeAbout', Math.round(years / 5) * 5);
    return t('observatory.timeAbout', Math.round(years / 10) * 10);
  }

  // ── KONTAKTY (reforma detekcji — skan wrogich statków) ─────────────

  _renderContacts(obsSys) {
    const vMgr     = window.KOSMOS?.vesselManager;
    const intelSys = window.KOSMOS?.intelSystem;
    const reg      = window.KOSMOS?.empireRegistry;
    const detected = obsSys?.getDetectedVesselIds?.() ?? new Set();

    let html = `<div class="obs-scroll-main" style="flex:1; overflow-y:auto; min-height:0; padding-right:4px;">`;
    html += `<div style="font-weight:bold; margin-bottom:4px; color:${THEME.warning}; font-size:12px; text-transform:uppercase;">⚠ ${t('observatory.contactsTitle')}</div>`;
    html += `<div style="color:${THEME.textDim}; font-size:10px; margin-bottom:10px; font-style:italic;">${t('observatory.scanHint')}</div>`;

    const ids = [...detected];
    if (ids.length === 0) {
      html += `<div style="color:${THEME.textDim}; font-size:11px; font-style:italic;">— ${t('observatory.noContacts')}</div>`;
      html += `</div>`;
      return html;
    }

    let unidIdx = 0;
    for (const id of ids) {
      const v = vMgr?.getVessel?.(id);
      if (!v) continue;
      const q = intelSys?.getVesselContact?.(id)?.quality ?? 'rumor';
      const identified = (q === 'contact' || q === 'detailed');
      const scan = obsSys?.getVesselScanProgress?.(id);

      let label, empLabel;
      if (identified) {
        label = v.name ?? id;
        const empId = v.ownerEmpireId ?? v.owner;
        empLabel = (empId && reg?.get?.(empId)?.name) ? reg.get(empId).name : t('intel.unknownEmpire');
      } else {
        unidIdx++;
        label = `${t('observatory.contactRumor')} #${unidIdx}`;
        empLabel = '—';
      }

      const borderColor = identified ? THEME.danger : THEME.warning;
      const cardBg = identified ? 'rgba(255,51,68,0.06)' : 'rgba(255,204,68,0.05)';
      html += `<div style="padding:8px 10px; margin-bottom:6px; border-radius:4px; font-size:12px; background:${cardBg}; border-left:3px solid ${borderColor};">`;
      html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">`;
      html += `<div><span style="color:${borderColor}; font-weight:bold;">${identified ? '🛰' : '❓'} ${label}</span>`;
      html += ` <span style="color:${THEME.textDim}; font-size:10px;">${empLabel}</span></div>`;

      if (identified) {
        html += `<span style="color:${THEME.success}; font-size:10px; font-weight:bold;">✓ ${t('observatory.identified')}</span>`;
      } else if (scan) {
        html += `<button data-scanaction="cancel" data-vesselid="${id}" style="${this._scanBtnStyle(false)}">${t('observatory.cancelScanBtn')}</button>`;
      } else {
        html += `<button data-scanaction="start" data-vesselid="${id}" style="${this._scanBtnStyle(true)}">🔭 ${t('observatory.scanBtn')}</button>`;
      }
      html += `</div>`;

      // Pasek postępu skanu
      if (!identified && scan) {
        const pct = Math.round(scan.pct * 100);
        html += `<div style="margin-top:6px;">`;
        html += `<div style="font-size:10px; color:${THEME.textDim}; margin-bottom:2px;">${t('observatory.scanning', pct)}</div>`;
        html += `<div style="height:5px; background:${THEME.bgSecondary}; border-radius:3px; overflow:hidden;">`;
        html += `<div style="height:100%; width:${pct}%; background:${THEME.accent};"></div>`;
        html += `</div></div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  _scanBtnStyle(primary) {
    return `padding:3px 10px; border:1px solid ${primary ? THEME.accent : THEME.border};`
         + ` border-radius:3px; font-size:10px; font-family:${THEME.fontFamily};`
         + ` background:${primary ? THEME.accent : 'transparent'};`
         + ` color:${primary ? THEME.bgPrimary : THEME.textPrimary}; cursor:pointer; white-space:nowrap;`;
  }

  // ── Szczegóły ciała (prawa kolumna) ─────────────────────────────────

  _renderBodyDetails() {
    if (!this._selectedBodyId) {
      return `<div style="flex:3; display:flex; align-items:center; justify-content:center; color:${THEME.textDim}; font-size:14px; border-left:1px solid ${THEME.border}; padding-left:10px;">${t('observatory.selectBody')}</div>`;
    }

    const body = EntityManager.get(this._selectedBodyId);
    if (!body) return `<div style="${this._rightColStyle()}"></div>`;

    const obsSys = window.KOSMOS?.observatorySystem;
    const scan   = obsSys?.getBodyScanProgress?.(this._selectedBodyId);
    const icon   = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';

    // Kamera już fokusuje ciało (body:selected) → widać je w tle za panelem (brak miniatury).
    if (scan)                            return this._renderScanningDetails(body, icon, scan);
    if (this._bodyTier(body) === 'unknown') return this._renderUnknownDetails(body, icon, obsSys);
    return this._renderKnownDetails(body, icon);
  }

  _rightColStyle() {
    return `flex:3; padding:12px 16px; border-left:1px solid ${THEME.border}; overflow-y:auto; min-height:0;`;
  }

  // Poziom wiedzy o ciele: unknown (nie zbadane) / rough (skan obserwatorium) / detailed (statek naukowy)
  _bodyTier(b) {
    if (b?.analyzed) return 'detailed';
    if (b?.explored) return 'rough';
    return 'unknown';
  }

  // Glif statusu w katalogu (kompaktowy — kółka).
  _tierGlyph(tier) {
    if (tier === 'detailed') return `<span style="color:${THEME.success}">●</span>`;
    if (tier === 'rough')    return `<span style="color:#44ccff">◐</span>`;
    return `<span style="color:${THEME.textDim}">○</span>`;
  }

  // Zgrubne pasmo jakości złoża (te same progi co BodyDetailModal/BottomContext).
  _richnessStars(r) {
    return r >= 0.7 ? '★★★' : r >= 0.4 ? '★★' : '★';
  }
  _richnessColor(r) {
    return r >= 0.7 ? THEME.yellow : r >= 0.4 ? THEME.accent : THEME.textDim;
  }

  // Etykieta fazy skanu wg postępu (klimatyczny „proces analizy").
  _scanPhaseLabel(pct) {
    if (pct < 0.45) return t('observatory.calibrating');
    if (pct < 0.90) return t('observatory.spectralAnalysis');
    return t('observatory.mineralAnalysis');
  }

  // ── UNKNOWN: zero danych, tylko przycisk skanu ─────────────────────
  _renderUnknownDetails(body, icon, obsSys) {
    const hasObs = (obsSys?.getMaxObservatoryLevel?.() ?? 0) > 0;
    let html = `<div style="${this._rightColStyle()}">`;
    html += `<div style="font-size:18px; font-weight:bold; color:${THEME.textHeader}; margin-bottom:8px;">${icon} ???</div>`;
    html += `<div style="color:${THEME.textDim}; font-size:13px; margin-bottom:16px;">${t('observatory.tierUnknown')}</div>`;
    if (hasObs) {
      html += `<button data-bodyscanaction="start" data-bodyid="${body.id}" style="${this._scanBtnStyle(true)} padding:8px 18px; font-size:12px;">🔭 ${t('observatory.scanBodyBtn')}</button>`;
    } else {
      html += `<div style="${this._scanBtnStyle(false)} padding:8px 18px; font-size:12px; opacity:0.5; display:inline-block;">🔭 ${t('observatory.scanBodyBtn')}</div>`;
      html += `<div style="color:${THEME.warning}; font-size:11px; margin-top:8px;">⚠ ${t('observatory.needObservatory')}</div>`;
    }
    html += `</div>`;
    return html;
  }

  // ── SCANNING: pasek + faza + progresywne ujawnianie danych ─────────
  _renderScanningDetails(body, icon, scan) {
    const pct = scan.pct;
    let html = `<div style="${this._rightColStyle()}">`;
    html += `<div style="font-size:18px; font-weight:bold; color:${THEME.textHeader}; margin-bottom:10px;">${icon} ${t('observatory.scanningBody')}</div>`;

    // Pasek postępu + faza + %
    html += `<div style="margin-bottom:14px;">`;
    html += `<div id="obs-scan-phase" style="font-size:11px; color:#7fd4ff; margin-bottom:4px; letter-spacing:0.5px;">${this._scanPhaseLabel(pct)}</div>`;
    html += `<div style="height:6px; background:${THEME.bgSecondary}; border-radius:3px; overflow:hidden;">`;
    html += `<div id="obs-scan-bar" style="height:100%; width:${Math.round(pct * 100)}%; background:linear-gradient(90deg,#2a8fbf,#44ccff); transition:width .25s;"></div>`;
    html += `</div>`;
    html += `<div id="obs-scan-pct" style="font-size:10px; color:${THEME.textDim}; margin-top:3px;">${t('observatory.scanning', Math.round(pct * 100))}</div>`;
    html += `</div>`;

    // Progresywne wiersze (opacity wg pct; timer aktualizuje w miejscu)
    for (const r of this._progressiveRows(body)) {
      const vis = pct >= r.threshold ? '1' : '0';
      html += `<div data-reveal="${r.threshold}" style="opacity:${vis}; transition:opacity .4s;">${r.html}</div>`;
    }

    html += `<button data-bodyscanaction="cancel" data-bodyid="${body.id}" style="${this._scanBtnStyle(false)} margin-top:14px;">${t('observatory.cancelScanBtn')}</button>`;
    html += `</div>`;
    return html;
  }

  // Wiersze ujawniane etapami podczas skanu (threshold = ukończony % fazy).
  _progressiveRows(body) {
    const orb = body.orbital ?? {};
    const homePl = window.KOSMOS?.homePlanet;
    const distAU = homePl ? Math.abs((orb.a ?? 0) - (homePl.orbital?.a ?? 0)).toFixed(2) : '?';
    const rows = [];
    // 0–20% klasyfikacja
    rows.push({ threshold: 0.20, html:
      this._detailRow(t('observatory.name'), body.name ?? body.id) +
      this._detailRow(t('observatory.type'), body.planetType ?? body.type) });
    // 20–45% orbita
    rows.push({ threshold: 0.45, html:
      this._detailRow(t('observatory.semiMajor'), `${(orb.a ?? 0).toFixed(3)} AU`) +
      this._detailRow(t('observatory.eccentricity'), `${(orb.e ?? 0).toFixed(4)}`) +
      this._detailRow(t('observatory.period'), `${(orb.T ?? 0).toFixed(3)} ${t('observatory.years')}`) +
      this._detailRow(t('observatory.distHome'), `${distAU} AU`) });
    // 45–70% fizyka
    let phys = '';
    if (body.temperatureK) { const c = Math.round(body.temperatureK - 273.15); phys += this._detailRow(t('observatory.temp'), `${Math.round(body.temperatureK)} K (${c}°C)`); }
    if (body.physics?.mass)   phys += this._detailRow(t('observatory.mass'), `${body.physics.mass.toFixed(3)} M⊕`);
    if (body.physics?.radius) phys += this._detailRow(t('observatory.radius'), `${body.physics.radius.toFixed(3)} R⊕`);
    if (phys) rows.push({ threshold: 0.70, html: phys });
    // 70–90% atmosfera + życie
    const atmo = this._atmoLifeHtml(body);
    if (atmo) rows.push({ threshold: 0.90, html: atmo });
    // 90–100% surowce (obecność + jakość, bez ilości)
    rows.push({ threshold: 0.98, html: this._resourcePresenceHtml(body, false) });
    return rows;
  }

  // ── ROUGH / DETAILED: pełny widok ──────────────────────────────────
  _renderKnownDetails(body, icon) {
    const tier = this._bodyTier(body);
    const orb = body.orbital ?? {};
    const homePl = window.KOSMOS?.homePlanet;
    const distAU = homePl ? Math.abs((orb.a ?? 0) - (homePl.orbital?.a ?? 0)).toFixed(2) : '?';
    const detailed = tier === 'detailed';
    const tag = detailed ? t('observatory.tierDetailedTag') : t('observatory.tierRoughTag');
    const tagColor = detailed ? THEME.success : '#44ccff';

    let html = `<div style="${this._rightColStyle()}">`;
    // Nagłówek z nazwą + tag poziomu
    html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:12px; flex-wrap:wrap;">`;
    html += `<span style="font-size:18px; font-weight:bold; color:${THEME.textHeader};">${icon} ${body.name ?? body.id}</span>`;
    html += `<span style="font-size:9px; color:${tagColor}; border:1px solid ${tagColor}; border-radius:3px; padding:1px 6px; text-transform:uppercase; letter-spacing:0.5px;">${tag}</span>`;
    html += `</div>`;

    // Dane szczegółowe
    html += this._detailRow(t('observatory.type'), body.planetType ?? body.type);
    html += this._detailRow(t('observatory.semiMajor'), `${(orb.a ?? 0).toFixed(3)} AU`);
    html += this._detailRow(t('observatory.eccentricity'), `${(orb.e ?? 0).toFixed(4)}`);
    html += this._detailRow(t('observatory.period'), `${(orb.T ?? 0).toFixed(3)} ${t('observatory.years')}`);
    html += this._detailRow(t('observatory.distHome'), `${distAU} AU`);
    if (body.temperatureK) {
      const tempC = Math.round(body.temperatureK - 273.15);
      html += this._detailRow(t('observatory.temp'), `${Math.round(body.temperatureK)} K (${tempC}°C)`);
    }
    if (body.physics?.mass)   html += this._detailRow(t('observatory.mass'), `${body.physics.mass.toFixed(3)} M⊕`);
    if (body.physics?.radius) html += this._detailRow(t('observatory.radius'), `${body.physics.radius.toFixed(3)} R⊕`);
    html += this._atmoLifeHtml(body);

    // Surowce (zgrubny = obecność + jakość; szczegółowy = + ilości)
    html += `<div style="margin-top:10px; padding-top:8px; border-top:1px solid ${THEME.border};">`;
    html += this._resourcePresenceHtml(body, detailed);
    html += `</div>`;

    // Kolonie na tym ciele
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr?.colonies) {
      for (const col of colMgr.colonies.values()) {
        if (col.planetId === body.id) {
          html += `<div style="margin-top:8px; padding:4px 8px; background:${THEME.accentDim}; border-radius:3px; font-size:12px;">`;
          html += `<span style="color:${THEME.accent};">🏠</span> <span style="color:${THEME.textPrimary};">${col.name ?? 'Kolonia'}</span>`;
          html += `</div>`;
        }
      }
    }

    html += `</div>`;
    return html;
  }

  // Atmosfera + wskaźnik życia (wspólne dla scan/known).
  _atmoLifeHtml(body) {
    let html = '';
    if (body.atmosphere?.pressure > 0) {
      html += this._detailRow(t('observatory.atmo'), `${body.atmosphere.pressure.toFixed(2)} atm`);
      if (body.atmosphere?.composition) {
        const sorted = Object.entries(body.atmosphere.composition).sort((a, b) => b[1] - a[1]).slice(0, 3);
        if (sorted.length > 0) {
          const compStr = sorted.map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ');
          html += this._detailRow(t('observatory.atmoComp'), compStr);
        }
      }
    }
    if (body.lifeScore != null && body.lifeScore > 0) {
      const lifeColor = body.lifeScore > 50 ? THEME.success : THEME.warning;
      html += `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px solid ${THEME.border};">
        <span style="color:${THEME.textDim}">${t('observatory.life')}</span>
        <span style="color:${lifeColor}; font-weight:bold;">${body.lifeScore.toFixed(0)}%</span>
      </div>`;
    }
    return html;
  }

  // Sekcja surowców. withNumbers=false → obecność + jakość (gwiazdki), BEZ ilości + hint statku.
  // withNumbers=true → jakość + dokładna pozostała ilość (poziom szczegółowy).
  _resourcePresenceHtml(body, withNumbers) {
    const deps = (body.deposits ?? []).filter(d => (d.richness ?? 0) > 0 || (d.remaining ?? d.totalAmount ?? 0) > 0);
    let html = `<div style="font-weight:bold; color:${THEME.textHeader}; font-size:12px; text-transform:uppercase; margin-bottom:4px;">${t('observatory.resourcesPresent')}</div>`;
    if (deps.length === 0) {
      html += `<div style="color:${THEME.textDim}; font-size:12px; font-style:italic;">—</div>`;
      return html;
    }
    html += `<div style="display:flex; flex-wrap:wrap; gap:4px 14px;">`;
    for (const d of deps) {
      const r = d.richness ?? 0;
      const stars = this._richnessStars(r);
      const sc = this._richnessColor(r);
      if (withNumbers) {
        const remaining = typeof d.remaining === 'number' ? Math.round(d.remaining) : '?';
        html += `<span style="font-size:12px; color:${THEME.textPrimary};">${d.resourceId} <span style="color:${sc}">${stars}</span> <span style="color:${THEME.textDim}">(${remaining})</span></span>`;
      } else {
        html += `<span style="font-size:12px; color:${THEME.textPrimary};">${d.resourceId} <span style="color:${sc}">${stars}</span></span>`;
      }
    }
    html += `</div>`;
    if (!withNumbers) {
      html += `<div style="color:${THEME.textDim}; font-size:10px; font-style:italic; margin-top:6px;">🛰 ${t('observatory.resourceQtyHint')}</div>`;
    }
    return html;
  }

  _detailRow(label, value) {
    return `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px solid ${THEME.border};">
      <span style="color:${THEME.textDim}">${label}</span>
      <span style="color:${THEME.textPrimary}; font-weight:500;">${value}</span>
    </div>`;
  }
}
