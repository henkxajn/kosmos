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
import { THEME }         from '../config/ThemeConfig.js';
import { COSMIC }        from '../config/LayoutConfig.js';
import { CIV_SIDEBAR_W } from './CivPanelDrawer.js';
import { t }             from '../i18n/i18n.js';
import { resolveTextureType, hashCode, TEXTURE_VARIANTS }
                         from '../renderer/PlanetTextureUtils.js';

// Typy ciał wyświetlane w katalogu
const ORBIT_TYPES = ['planet', 'moon', 'planetoid'];

// Ścieżka do tekstur planet
const TEXTURE_DIR = 'assets/planet-textures';

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
  show()   { this.visible = true;  this._createDOM(); this._startSync(); }
  hide()   { this.visible = false; this._destroyDOM(); this._stopSync(); }

  draw() {}

  handleClick(x)     { return this.visible && x >= CIV_SIDEBAR_W; }
  handleMouseMove()  {}
  handleScroll(delta, x) {
    if (!this.visible || x < CIV_SIDEBAR_W) return false;
    const scrollEl = this._container?.querySelector('.obs-scroll-main');
    if (scrollEl) scrollEl.scrollTop += delta;
    return true;
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
      top: ${Math.round(COSMIC.TOP_BAR_H * S)}px;
      left: ${Math.round(CIV_SIDEBAR_W * S)}px;
      right: ${Math.round(COSMIC.OUTLINER_W * S)}px;
      bottom: ${Math.round(COSMIC.BOTTOM_BAR_H * S)}px;
      background: ${THEME.bgPrimary}ee; color: ${THEME.textPrimary}; font-family: ${THEME.fontFamily};
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
      <span style="font-size:16px; font-weight:bold; color:${THEME.accent}">🔭 ${t('observatory.title')}</span>
      <span id="obs-status" style="font-size:11px; color:${THEME.textDim}"></span>
    `;
    c.appendChild(header);

    // Podzakładki — 2 zakładki: KATALOG | ZAGROŻENIA
    const tabs = document.createElement('div');
    tabs.id = 'obs-tabs';
    tabs.style.cssText = 'display:flex; gap:2px; margin-bottom:8px; flex-shrink:0;';
    for (const tab of ['catalog', 'threats']) {
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
  }

  _stopSync() {
    if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
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

    requestAnimationFrame(() => this._restoreScroll());
  }

  // ── KATALOG (połączony SCAN + ORBITS) ──────────────────────────────

  _renderCatalog(obsSys) {
    const discoveries = obsSys?.getDiscoveries() ?? [];
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // Zbierz ciała
    const allBodies = [];
    let exploredCount = 0;
    for (const type of ORBIT_TYPES) {
      for (const b of EntityManager.getByTypeInSystem(type, sysId)) {
        allBodies.push(b);
        if (b.explored) exploredCount++;
      }
    }
    allBodies.sort((a, b) => (a.orbital?.a ?? 0) - (b.orbital?.a ?? 0));

    // ── Lewa kolumna: tabela ciał + log odkryć ──
    let html = `<div class="obs-scroll-main" style="flex:2; overflow-y:auto; min-height:0; padding-right:6px;">`;

    // Statystyki
    html += `<div style="color:${THEME.textDim}; margin-bottom:6px; font-size:12px;">`;
    html += `${t('observatory.explored')}: <span style="color:${THEME.accent}">${exploredCount}</span>/${allBodies.length}`;
    html += `</div>`;

    // Tabela ciał
    html += `<table style="width:100%; border-collapse:collapse; font-size:11px; color:${THEME.textPrimary};">`;
    html += `<thead><tr style="color:${THEME.textHeader}; border-bottom:1px solid ${THEME.border}; position:sticky; top:0; background:${THEME.bgSecondary};">`;
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

      html += `<tr data-bodyid="${b.id}" style="background:${bg}; border-bottom:1px solid ${THEME.border};" onmouseover="this.style.background='${THEME.accentDim}'" onmouseout="this.style.background='${selected ? THEME.accentMed : 'transparent'}'">`;
      html += `<td style="padding:3px 6px; color:${explored ? THEME.textPrimary : THEME.textDim};">${icon} ${explored ? (b.name ?? b.id) : '???'}</td>`;
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
        html += `<span style="color:${THEME.accent}">${d.bodyName}</span>`;
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
    const alerts = forecast?.getAlerts() ?? [];
    const warnings = window.KOSMOS?.randomEventSystem?.getWarnings() ?? [];

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
      html += `<div style="padding:8px 12px; margin-bottom:10px; border-radius:4px; background:${hasDanger ? THEME.danger + '12' : THEME.warning + '10'}; border:1px solid ${hasDanger ? THEME.danger + '55' : THEME.warning + '44'};">`;
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

        const cardColor = isPlayerThreat ? THEME.danger : urgencyColor;
        const cardBg = isPlayerThreat ? THEME.danger + '12' : THEME.bgSecondary;

        html += `<div style="padding:8px 10px; margin-bottom:5px; border-radius:4px; font-size:12px; background:${cardBg}; border-left:3px solid ${cardColor};">`;
        html += `<div style="display:flex; align-items:center; gap:6px;">`;
        html += `<span style="color:${cardColor}; font-weight:bold; font-size:13px;">${isPlayerThreat ? '🚨' : '☄'}</span>`;
        html += `<span style="color:${cardColor}; font-weight:bold;">${a.bodyAName} → ${a.bodyBName}</span>`;
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
        const sevBg = sev === 'danger' ? THEME.danger + '12' : THEME.warning + '10';
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

  // ── Szczegóły ciała (prawa kolumna) ─────────────────────────────────

  _renderBodyDetails() {
    if (!this._selectedBodyId) {
      return `<div style="flex:3; display:flex; align-items:center; justify-content:center; color:${THEME.textDim}; font-size:14px; border-left:1px solid ${THEME.border}; padding-left:10px;">${t('observatory.selectBody')}</div>`;
    }

    const body = EntityManager.get(this._selectedBodyId);
    if (!body) return '';

    const orb = body.orbital ?? {};
    const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
    const homePl = window.KOSMOS?.homePlanet;
    const distAU = homePl ? Math.abs((orb.a ?? 0) - (homePl.orbital?.a ?? 0)).toFixed(2) : '?';

    let html = `<div style="flex:3; padding:12px 16px; border-left:1px solid ${THEME.border}; overflow-y:auto; min-height:0;">`;

    // Nagłówek z nazwą
    html += `<div style="font-size:18px; font-weight:bold; color:${THEME.textHeader}; margin-bottom:12px;">${icon} ${body.name ?? body.id}</div>`;

    // Miniatura tekstury + wizualizacja orbity obok siebie
    const thumbUrl = this._getBodyThumbnailUrl(body);
    html += `<div style="display:flex; gap:14px; margin-bottom:14px; align-items:stretch;">`;

    if (thumbUrl) {
      html += `<img src="${thumbUrl}" style="flex:1; min-width:0; height:160px; object-fit:cover; border-radius:6px; border:1px solid ${THEME.border};" alt="${body.name ?? body.id}" onerror="this.style.display='none'">`;
    }

    // Wizualizacja orbity SVG
    html += this._renderOrbitSVG(body);
    html += `</div>`;

    // Dane szczegółowe — większa czcionka
    html += this._detailRow(t('observatory.type'), body.planetType ?? body.type);
    html += this._detailRow(t('observatory.semiMajor'), `${(orb.a ?? 0).toFixed(3)} AU`);
    html += this._detailRow(t('observatory.eccentricity'), `${(orb.e ?? 0).toFixed(4)}`);
    html += this._detailRow(t('observatory.period'), `${(orb.T ?? 0).toFixed(3)} ${t('observatory.years')}`);
    html += this._detailRow(t('observatory.distHome'), `${distAU} AU`);

    if (body.temperatureK) {
      const tempC = Math.round(body.temperatureK - 273.15);
      html += this._detailRow(t('observatory.temp'), `${Math.round(body.temperatureK)} K (${tempC}°C)`);
    }

    if (body.physics?.mass) {
      html += this._detailRow(t('observatory.mass'), `${body.physics.mass.toFixed(3)} M⊕`);
    }

    if (body.physics?.radius) {
      html += this._detailRow(t('observatory.radius'), `${body.physics.radius.toFixed(3)} R⊕`);
    }

    if (body.atmosphere?.pressure > 0) {
      html += this._detailRow(t('observatory.atmo'), `${body.atmosphere.pressure.toFixed(2)} atm`);
      if (body.atmosphere?.composition) {
        const comp = body.atmosphere.composition;
        const sorted = Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 3);
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

    if (body.deposits?.length > 0) {
      html += `<div style="margin-top:12px; font-weight:bold; color:${THEME.textHeader}; font-size:13px; text-transform:uppercase;">${t('observatory.deposits')}</div>`;
      for (const d of body.deposits) {
        html += `<div style="font-size:13px; color:${THEME.textPrimary}; padding:3px 0;">${d.resourceId}: ${d.richness?.toFixed(1) ?? '?'} (${d.remaining ?? '?'})</div>`;
      }
    }

    // Kolonie na tym ciele
    const colMgr = window.KOSMOS?.colonyManager;
    if (colMgr?.colonies) {
      for (const col of colMgr.colonies.values()) {
        if (col.planetId === body.id) {
          html += `<div style="margin-top:12px; padding:6px 10px; background:${THEME.accentDim}; border-radius:4px; font-size:13px;">`;
          html += `<span style="color:${THEME.accent};">🏠</span> <span style="color:${THEME.textPrimary};">${col.name ?? 'Kolonia'}</span>`;
          html += `</div>`;
        }
      }
    }

    html += `</div>`;
    return html;
  }

  // ── Wizualizacja orbity (SVG) ─────────────────────────────────────

  _renderOrbitSVG(body) {
    const orb = body.orbital ?? {};
    const a = orb.a ?? 1;     // semi-major axis (AU)
    const e = orb.e ?? 0;     // eccentricity
    const theta = orb.theta ?? 0; // aktualna anomalia

    const W = 220, H = 160;
    const cx = W / 2, cy = H / 2;

    // Skaluj elipsę do SVG — wypełnij ~80% viewboxa
    const b = a * Math.sqrt(1 - e * e); // semi-minor
    const maxDim = Math.max(a, b) || 1;
    const scale = (Math.min(W, H) * 0.38) / maxDim;

    const rx = a * scale;      // semi-major w px
    const ry = b * scale;      // semi-minor w px
    const focalShift = a * e * scale; // przesunięcie fokusa

    // Pozycja ciała na orbicie (współrzędne Keplera)
    const r = a * (1 - e * e) / (1 + e * Math.cos(theta));
    const bx = cx - focalShift + r * Math.cos(theta) * scale;
    const by = cy - r * Math.sin(theta) * scale;

    // Pozycja HZ (strefa zamieszkiwalna) — jeśli dostępna
    const star = EntityManager.getAll().find(e => e.type === 'star');
    let hzHtml = '';
    if (star?.luminosity) {
      const hzInner = Math.sqrt(star.luminosity / 1.1);
      const hzOuter = Math.sqrt(star.luminosity / 0.53);
      const hzR1 = hzInner * scale;
      const hzR2 = hzOuter * scale;
      // Rysuj pierścień HZ jako dwa okręgi
      if (hzR2 < W && hzR2 < H) {
        hzHtml = `<circle cx="${cx - focalShift}" cy="${cy}" r="${hzR2}" fill="${THEME.success}08" stroke="${THEME.success}22" stroke-width="0.5"/>`;
        hzHtml += `<circle cx="${cx - focalShift}" cy="${cy}" r="${hzR1}" fill="${THEME.bgPrimary}" stroke="${THEME.success}22" stroke-width="0.5"/>`;
      }
    }

    return `
      <svg viewBox="0 0 ${W} ${H}" style="flex:1; min-width:0; height:160px; border:1px solid ${THEME.border}; border-radius:6px; background:${THEME.bgSecondary};">
        ${hzHtml}
        <!-- Orbita -->
        <ellipse cx="${cx - focalShift}" cy="${cy}" rx="${rx}" ry="${ry}"
          fill="none" stroke="${THEME.accent}44" stroke-width="1.2" stroke-dasharray="4,2"/>
        <!-- Gwiazda w fokusie -->
        <circle cx="${cx}" cy="${cy}" r="4" fill="${THEME.warning}"/>
        <!-- Ciało niebieskie -->
        <circle cx="${bx}" cy="${by}" r="5" fill="${THEME.accent}" stroke="${THEME.accent}88" stroke-width="2"/>
        <!-- Etykieta -->
        <text x="${W - 6}" y="${H - 6}" text-anchor="end" font-size="10" fill="${THEME.textDim}" font-family="${THEME.fontFamily}">
          a=${a.toFixed(2)} AU  e=${e.toFixed(3)}
        </text>
      </svg>
    `;
  }

  /** Zwraca URL miniatury tekstury dla ciała niebieskiego */
  _getBodyThumbnailUrl(body) {
    try {
      const texType = resolveTextureType(body);
      const variant = (hashCode(body.id) % TEXTURE_VARIANTS) + 1;
      const vStr = String(variant).padStart(2, '0');
      return `${TEXTURE_DIR}/${texType}_${vStr}_diffuse.png`;
    } catch {
      return null;
    }
  }

  _detailRow(label, value) {
    return `<div style="display:flex; justify-content:space-between; font-size:13px; padding:5px 0; border-bottom:1px solid ${THEME.border};">
      <span style="color:${THEME.textDim}">${label}</span>
      <span style="color:${THEME.textPrimary}; font-weight:500;">${value}</span>
    </div>`;
  }
}
