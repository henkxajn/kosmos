// ObservatoryOverlay — zakładka Obserwatorium (klawisz O)
//
// DOM overlay z trzema kolumnami:
//   Lewa:   Status obserwatoriów w imperium (poziomy, bonusy)
//   Środek: 3 podzakładki: SKAN | ORBITY | ZAGROŻENIA
//   Prawa:  Szczegóły wybranego ciała (po kliknięciu)
//
// Komunikacja:
//   Czyta: window.KOSMOS.{observatorySystem, collisionForecast, colonyManager}
//   Emituje: 'body:selected' (focus kamery po kliknięciu ciała)

import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';
import { THEME }         from '../config/ThemeConfig.js';
import { CIV_SIDEBAR_W } from './CivPanelDrawer.js';
import { t, getName }   from '../i18n/i18n.js';

// Typy ciał wyświetlane w katalogu orbit
const ORBIT_TYPES = ['planet', 'moon', 'planetoid'];

export class ObservatoryOverlay {
  constructor() {
    this.visible = false;
    this._container = null;
    this._subTab = 'scan';  // 'scan' | 'orbits' | 'threats'
    this._selectedBodyId = null;
    this._syncTimer = null;
  }

  // ── OverlayManager API ──────────────────────────────────────────────
  toggle() { this.visible ? this.hide() : this.show(); }
  show()   { this.visible = true;  this._createDOM(); this._startSync(); }
  hide()   { this.visible = false; this._destroyDOM(); this._stopSync(); }

  draw() { if (this.visible) this._refresh(); }

  handleClick(x)     { return this.visible && x >= CIV_SIDEBAR_W; }
  handleMouseMove()  {}
  handleScroll(delta, x) { return this.visible && x >= CIV_SIDEBAR_W; }

  // ── DOM ─────────────────────────────────────────────────────────────

  _createDOM() {
    if (this._container) return;

    const c = document.createElement('div');
    c.id = 'observatory-overlay';
    c.style.cssText = `
      position: fixed; top: 0; left: ${CIV_SIDEBAR_W}px; right: 0; bottom: 40px;
      background: rgba(10,12,18,0.95); color: ${THEME.text}; font-family: ${THEME.fontFamily};
      z-index: 90; display: flex; flex-direction: column; padding: 12px 16px;
      overflow: hidden;
    `;

    // Nagłówek
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:10px;';
    header.innerHTML = `
      <span style="font-size:20px; font-weight:bold; color:${THEME.accent}">🔭 ${t('observatory.title')}</span>
      <span id="obs-status" style="font-size:12px; color:${THEME.textDim}"></span>
    `;
    c.appendChild(header);

    // Podzakładki
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display:flex; gap:4px; margin-bottom:10px;';
    for (const tab of ['scan', 'orbits', 'threats']) {
      const btn = document.createElement('button');
      btn.dataset.tab = tab;
      btn.textContent = t(`observatory.tab.${tab}`);
      btn.style.cssText = `
        padding: 4px 12px; border: 1px solid ${THEME.border}; border-radius: 4px;
        background: ${tab === this._subTab ? THEME.accent : 'transparent'};
        color: ${tab === this._subTab ? '#000' : THEME.text};
        cursor: pointer; font-size: 12px; font-family: ${THEME.fontFamily};
      `;
      btn.onclick = () => { this._subTab = tab; this._refresh(); };
      tabs.appendChild(btn);
    }
    c.appendChild(tabs);

    // Treść (3 kolumny)
    const body = document.createElement('div');
    body.id = 'obs-body';
    body.style.cssText = 'display:flex; gap:12px; flex:1; overflow:hidden;';
    c.appendChild(body);

    document.body.appendChild(c);
    this._container = c;
    this._refresh();
  }

  _destroyDOM() {
    if (this._container) {
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

  // ── Odświeżanie treści ──────────────────────────────────────────────

  _refresh() {
    if (!this._container) return;

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
    const tabs = this._container.querySelectorAll('[data-tab]');
    tabs.forEach(btn => {
      const active = btn.dataset.tab === this._subTab;
      btn.style.background = active ? THEME.accent : 'transparent';
      btn.style.color = active ? '#000' : THEME.text;
    });

    // Treść
    const body = this._container.querySelector('#obs-body');
    if (!body) return;

    switch (this._subTab) {
      case 'scan':    body.innerHTML = this._renderScan(obsSys); break;
      case 'orbits':  body.innerHTML = this._renderOrbits(); break;
      case 'threats': body.innerHTML = this._renderThreats(forecast); break;
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
  }

  // ── SKAN ────────────────────────────────────────────────────────────

  _renderScan(obsSys) {
    const discoveries = obsSys?.getDiscoveries() ?? [];
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';

    // Statystyki
    let totalBodies = 0, exploredBodies = 0;
    for (const type of ORBIT_TYPES) {
      for (const b of EntityManager.getByTypeInSystem(type, sysId)) {
        totalBodies++;
        if (b.explored) exploredBodies++;
      }
    }

    let html = `<div style="flex:1; overflow-y:auto; padding-right:8px;">`;
    html += `<div style="color:${THEME.textDim}; margin-bottom:8px; font-size:12px;">`;
    html += `${t('observatory.explored')}: ${exploredBodies}/${totalBodies}`;
    html += `</div>`;

    // Historia odkryć (najnowsze na górze)
    html += `<div style="font-weight:bold; margin-bottom:6px; color:${THEME.accent}; font-size:13px;">${t('observatory.discoveryLog')}</div>`;

    if (discoveries.length === 0) {
      html += `<div style="color:${THEME.textDim}; font-size:11px;">${t('observatory.noDiscoveries')}</div>`;
    } else {
      const recent = discoveries.slice(-20).reverse();
      for (const d of recent) {
        html += `<div data-bodyid="${d.bodyId}" style="padding:3px 6px; margin-bottom:2px; border-radius:3px; font-size:11px; border:1px solid ${THEME.border}30;">`;
        html += `🔭 <span style="color:${THEME.accent}">${d.bodyName}</span>`;
        html += ` <span style="color:${THEME.textDim}">— ${d.colonyName}, ${t('observatory.year')} ${Math.round(d.year)}</span>`;
        html += `</div>`;
      }
    }
    html += `</div>`;

    // Prawa kolumna — szczegóły wybranego ciała
    html += this._renderBodyDetails();

    return html;
  }

  // ── ORBITY ──────────────────────────────────────────────────────────

  _renderOrbits() {
    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    const bodies = [];
    for (const type of ORBIT_TYPES) {
      for (const b of EntityManager.getByTypeInSystem(type, sysId)) {
        if (!b.explored) continue;
        bodies.push(b);
      }
    }
    bodies.sort((a, b) => (a.orbital?.a ?? 0) - (b.orbital?.a ?? 0));

    let html = `<div style="flex:2; overflow-y:auto;">`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:11px;">`;
    html += `<tr style="color:${THEME.accent}; border-bottom:1px solid ${THEME.border};">`;
    html += `<th style="text-align:left; padding:4px;">${t('observatory.name')}</th>`;
    html += `<th>${t('observatory.type')}</th>`;
    html += `<th>a (AU)</th><th>e</th><th>T (${t('observatory.years')})</th>`;
    html += `<th>\u03B8\u00B0</th>`;  // θ°
    html += `</tr>`;

    for (const b of bodies) {
      const orb = b.orbital ?? {};
      const selected = this._selectedBodyId === b.id;
      const bg = selected ? `${THEME.accent}30` : 'transparent';
      const icon = b.type === 'planet' ? '🪐' : b.type === 'moon' ? '🌙' : '🪨';
      const thetaDeg = ((orb.theta ?? 0) * 180 / Math.PI) % 360;

      html += `<tr data-bodyid="${b.id}" style="background:${bg}; border-bottom:1px solid ${THEME.border}20;">`;
      html += `<td style="padding:3px 4px;">${icon} ${b.name ?? b.id}</td>`;
      html += `<td style="text-align:center; color:${THEME.textDim}">${b.planetType ?? b.type}</td>`;
      html += `<td style="text-align:center">${(orb.a ?? 0).toFixed(2)}</td>`;
      html += `<td style="text-align:center">${(orb.e ?? 0).toFixed(3)}</td>`;
      html += `<td style="text-align:center">${(orb.T ?? 0).toFixed(2)}</td>`;
      html += `<td style="text-align:center">${thetaDeg.toFixed(0)}</td>`;
      html += `</tr>`;
    }

    html += `</table></div>`;

    // Prawa kolumna
    html += this._renderBodyDetails();

    return html;
  }

  // ── ZAGROŻENIA ──────────────────────────────────────────────────────

  _renderThreats(forecast) {
    const alerts = forecast?.getAlerts() ?? [];
    const warnings = window.KOSMOS?.randomEventSystem?.getWarnings() ?? [];

    let html = `<div style="flex:1; overflow-y:auto;">`;

    // Alerty kolizyjne
    html += `<div style="font-weight:bold; margin-bottom:6px; color:${THEME.accent}; font-size:13px;">${t('observatory.collisionAlerts')}</div>`;
    if (alerts.length === 0) {
      html += `<div style="color:#4a8; font-size:12px; margin-bottom:12px;">✓ ${t('observatory.systemStable')}</div>`;
    } else {
      for (const a of alerts) {
        const isHome = a.bodyAId === window.KOSMOS?.homePlanet?.id || a.bodyBId === window.KOSMOS?.homePlanet?.id;
        const color = isHome ? '#f44' : THEME.accent;
        html += `<div style="padding:6px 8px; margin-bottom:4px; border:1px solid ${color}; border-radius:4px; font-size:12px;">`;
        html += `<span style="color:${color}; font-weight:bold;">${isHome ? '⚠' : '🔭'} ${a.bodyAName} → ${a.bodyBName}</span>`;
        html += `<br><span style="color:${THEME.textDim}">${t('observatory.inYears', Math.round(a.yearsUntil), a.margin)}</span>`;
        html += `</div>`;
      }
    }

    // Ostrzeżenia o zdarzeniach
    html += `<div style="font-weight:bold; margin:12px 0 6px; color:${THEME.accent}; font-size:13px;">${t('observatory.eventWarnings')}</div>`;
    if (warnings.length === 0) {
      html += `<div style="color:#4a8; font-size:12px;">✓ ${t('observatory.noWarnings')}</div>`;
    } else {
      for (const w of warnings) {
        const name = t(`event.${w.event.id}.name`) !== `event.${w.event.id}.name`
          ? t(`event.${w.event.id}.name`) : (w.event.namePL ?? w.event.id);
        html += `<div style="padding:6px 8px; margin-bottom:4px; border:1px solid ${THEME.accent}80; border-radius:4px; font-size:12px;">`;
        html += `${w.event.icon ?? '⚠'} <span style="color:${THEME.accent}">${name}</span>`;
        html += ` → ${w.colonyName}`;
        html += `<br><span style="color:${THEME.textDim}">${t('observatory.inYearsSimple', w.remainingYears)}</span>`;
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  // ── Szczegóły ciała (prawa kolumna) ─────────────────────────────────

  _renderBodyDetails() {
    if (!this._selectedBodyId) {
      return `<div style="flex:1; display:flex; align-items:center; justify-content:center; color:${THEME.textDim}; font-size:12px;">${t('observatory.selectBody')}</div>`;
    }

    const body = EntityManager.get(this._selectedBodyId);
    if (!body) return '';

    const orb = body.orbital ?? {};
    const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
    const homePl = window.KOSMOS?.homePlanet;
    const distAU = homePl ? Math.abs((orb.a ?? 0) - (homePl.orbital?.a ?? 0)).toFixed(2) : '?';

    let html = `<div style="flex:1; padding:8px; border-left:1px solid ${THEME.border}40; overflow-y:auto;">`;
    html += `<div style="font-size:14px; font-weight:bold; color:${THEME.accent}; margin-bottom:8px;">${icon} ${body.name ?? body.id}</div>`;
    html += this._detailRow(t('observatory.type'), body.planetType ?? body.type);
    html += this._detailRow('a', `${(orb.a ?? 0).toFixed(3)} AU`);
    html += this._detailRow('e', `${(orb.e ?? 0).toFixed(4)}`);
    html += this._detailRow('T', `${(orb.T ?? 0).toFixed(3)} ${t('observatory.years')}`);
    html += this._detailRow(t('observatory.distHome'), `${distAU} AU`);

    // Temperatura
    if (body.temperatureK) {
      html += this._detailRow(t('observatory.temp'), `${Math.round(body.temperatureK)} K`);
    }

    // Atmosfera
    if (body.atmosphere?.pressure > 0) {
      html += this._detailRow(t('observatory.atmo'), `${body.atmosphere.pressure.toFixed(2)} atm`);
    }

    // Złoża
    if (body.deposits?.length > 0) {
      html += `<div style="margin-top:8px; font-weight:bold; color:${THEME.accent}; font-size:12px;">${t('observatory.deposits')}</div>`;
      for (const d of body.deposits) {
        html += `<div style="font-size:11px; color:${THEME.text}; padding:1px 0;">${d.resourceId}: ${d.richness?.toFixed(1) ?? '?'} (${d.remaining ?? '?'})</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  _detailRow(label, value) {
    return `<div style="display:flex; justify-content:space-between; font-size:11px; padding:2px 0; border-bottom:1px solid ${THEME.border}15;">
      <span style="color:${THEME.textDim}">${label}</span>
      <span>${value}</span>
    </div>`;
  }
}
