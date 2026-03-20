// ObservatoryOverlay — zakładka Obserwatorium (klawisz O)
//
// DOM overlay z podzakładkami: SKAN | ORBITY | ZAGROŻENIA
// Prawa kolumna: szczegóły wybranego ciała
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

// Typy ciał wyświetlane w katalogu orbit
const ORBIT_TYPES = ['planet', 'moon', 'planetoid'];

// Kolory spójne z THEME
const C = {
  bg:     '#080c0a',
  text:   '#aac8c0',
  dim:    'rgba(160,200,190,0.45)',
  accent: '#00ffb4',
  border: 'rgba(0,255,180,0.12)',
  danger: '#ff6644',
  ok:     '#00cc88',
  rowHover: 'rgba(0,255,180,0.06)',
  rowSelected: 'rgba(0,255,180,0.15)',
};

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

  // DOM overlay — nie odświeżaj co klatkę (niszczy onclick bindings)
  draw() {}

  handleClick(x)     { return this.visible && x >= CIV_SIDEBAR_W; }
  handleMouseMove()  {}
  handleScroll(delta, x) { return this.visible && x >= CIV_SIDEBAR_W; }

  // ── DOM ─────────────────────────────────────────────────────────────

  _createDOM() {
    if (this._container) return;

    // Skalowanie identyczne jak TechOverlay (UI_SCALE)
    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);

    const c = document.createElement('div');
    c.id = 'observatory-overlay';
    c.style.cssText = `
      position: fixed;
      top: ${Math.round(COSMIC.TOP_BAR_H * S)}px;
      left: ${Math.round(CIV_SIDEBAR_W * S)}px;
      right: ${Math.round(COSMIC.OUTLINER_W * S)}px;
      bottom: ${Math.round(COSMIC.BOTTOM_BAR_H * S)}px;
      background: rgba(2,4,5,0.96); color: ${C.text}; font-family: ${THEME.fontFamily};
      z-index: 50; display: flex; flex-direction: column; padding: 10px 14px;
      overflow: hidden;
    `;

    // Custom scrollbar CSS
    const style = document.createElement('style');
    style.textContent = `
      #observatory-overlay ::-webkit-scrollbar { width: 4px; }
      #observatory-overlay ::-webkit-scrollbar-track { background: transparent; }
      #observatory-overlay ::-webkit-scrollbar-thumb { background: rgba(0,255,180,0.15); border-radius: 2px; }
      #observatory-overlay ::-webkit-scrollbar-thumb:hover { background: rgba(0,255,180,0.3); }
    `;
    c.appendChild(style);

    // Nagłówek
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:8px; flex-shrink:0;';
    header.innerHTML = `
      <span style="font-size:16px; font-weight:bold; color:${C.accent}">🔭 ${t('observatory.title')}</span>
      <span id="obs-status" style="font-size:11px; color:${C.dim}"></span>
    `;
    c.appendChild(header);

    // Podzakładki
    const tabs = document.createElement('div');
    tabs.id = 'obs-tabs';
    tabs.style.cssText = 'display:flex; gap:2px; margin-bottom:8px; flex-shrink:0;';
    for (const tab of ['scan', 'orbits', 'threats']) {
      const btn = document.createElement('button');
      btn.dataset.tab = tab;
      btn.textContent = t(`observatory.tab.${tab}`);
      btn.style.cssText = this._tabStyle(tab === this._subTab);
      btn.onclick = () => { this._subTab = tab; this._refresh(); };
      tabs.appendChild(btn);
    }
    c.appendChild(tabs);

    // Treść
    const body = document.createElement('div');
    body.id = 'obs-body';
    body.style.cssText = 'display:flex; gap:10px; flex:1; min-height:0;';
    c.appendChild(body);

    document.body.appendChild(c);
    this._container = c;
    this._refresh();
  }

  _tabStyle(active) {
    return `
      padding: 5px 14px; border: 1px solid ${active ? C.accent : C.border};
      border-radius: 3px; font-size: 11px; font-family: ${THEME.fontFamily};
      background: ${active ? C.accent : 'transparent'};
      color: ${active ? '#000' : C.text};
      cursor: pointer; font-weight: ${active ? 'bold' : 'normal'};
      transition: background 0.15s;
    `;
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

    let html = `<div style="flex:1; overflow-y:auto; padding-right:6px; min-height:0;">`;
    html += `<div style="color:${C.dim}; margin-bottom:8px; font-size:12px;">`;
    html += `${t('observatory.explored')}: <span style="color:${C.accent}">${exploredBodies}</span>/${totalBodies}`;
    html += `</div>`;

    html += `<div style="font-weight:bold; margin-bottom:6px; color:${C.accent}; font-size:12px; text-transform:uppercase;">${t('observatory.discoveryLog')}</div>`;

    if (discoveries.length === 0) {
      html += `<div style="color:${C.dim}; font-size:11px; font-style:italic;">${t('observatory.noDiscoveries')}</div>`;
    } else {
      const recent = discoveries.slice(-30).reverse();
      for (const d of recent) {
        html += `<div data-bodyid="${d.bodyId}" style="padding:4px 8px; margin-bottom:3px; border-radius:3px; font-size:11px; background:${C.rowHover}; border-left:2px solid ${C.accent};">`;
        html += `<span style="color:${C.accent}">${d.bodyName}</span>`;
        html += ` <span style="color:${C.dim}">— ${d.colonyName}, ${t('observatory.year')} ${Math.round(d.year)}</span>`;
        html += `</div>`;
      }
    }
    html += `</div>`;

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

    let html = `<div style="flex:2; overflow-y:auto; min-height:0;">`;
    html += `<table style="width:100%; border-collapse:collapse; font-size:11px; color:${C.text};">`;
    html += `<thead><tr style="color:${C.accent}; border-bottom:1px solid ${C.border}; position:sticky; top:0; background:${C.bg};">`;
    html += `<th style="text-align:left; padding:5px 6px;">${t('observatory.name')}</th>`;
    html += `<th style="padding:5px 4px;">${t('observatory.type')}</th>`;
    html += `<th style="padding:5px 4px;">a (AU)</th>`;
    html += `<th style="padding:5px 4px;">e</th>`;
    html += `<th style="padding:5px 4px;">T (${t('observatory.years')})</th>`;
    html += `<th style="padding:5px 4px;">\u03B8\u00B0</th>`;
    html += `</tr></thead><tbody>`;

    for (const b of bodies) {
      const orb = b.orbital ?? {};
      const selected = this._selectedBodyId === b.id;
      const bg = selected ? C.rowSelected : 'transparent';
      const icon = b.type === 'planet' ? '🪐' : b.type === 'moon' ? '🌙' : '🪨';
      const thetaDeg = ((orb.theta ?? 0) * 180 / Math.PI) % 360;

      html += `<tr data-bodyid="${b.id}" style="background:${bg}; border-bottom:1px solid ${C.border};" onmouseover="this.style.background='${C.rowHover}'" onmouseout="this.style.background='${selected ? C.rowSelected : 'transparent'}'">`;
      html += `<td style="padding:4px 6px; color:${C.text};">${icon} ${b.name ?? b.id}</td>`;
      html += `<td style="text-align:center; color:${C.dim}; padding:4px;">${b.planetType ?? b.type}</td>`;
      html += `<td style="text-align:center; padding:4px;">${(orb.a ?? 0).toFixed(2)}</td>`;
      html += `<td style="text-align:center; padding:4px;">${(orb.e ?? 0).toFixed(3)}</td>`;
      html += `<td style="text-align:center; padding:4px;">${(orb.T ?? 0).toFixed(2)}</td>`;
      html += `<td style="text-align:center; padding:4px;">${thetaDeg.toFixed(0)}</td>`;
      html += `</tr>`;
    }

    html += `</tbody></table></div>`;
    html += this._renderBodyDetails();
    return html;
  }

  // ── ZAGROŻENIA ──────────────────────────────────────────────────────

  _renderThreats(forecast) {
    const alerts = forecast?.getAlerts() ?? [];
    const warnings = window.KOSMOS?.randomEventSystem?.getWarnings() ?? [];

    let html = `<div style="flex:1; overflow-y:auto; min-height:0;">`;

    // Alerty kolizyjne
    html += `<div style="font-weight:bold; margin-bottom:6px; color:${C.accent}; font-size:12px; text-transform:uppercase;">${t('observatory.collisionAlerts')}</div>`;
    if (alerts.length === 0) {
      html += `<div style="color:${C.ok}; font-size:12px; margin-bottom:14px;">✓ ${t('observatory.systemStable')}</div>`;
    } else {
      for (const a of alerts) {
        const isHome = a.bodyAId === window.KOSMOS?.homePlanet?.id || a.bodyBId === window.KOSMOS?.homePlanet?.id;
        const color = isHome ? C.danger : C.accent;
        const years = Math.max(0, Math.round(a.yearsUntil));
        const margin = Math.max(1, a.margin);
        html += `<div style="padding:6px 10px; margin-bottom:4px; border-radius:3px; font-size:11px; background:rgba(0,0,0,0.3); border-left:3px solid ${color};">`;
        html += `<span style="color:${color}; font-weight:bold;">${isHome ? '⚠' : '🔭'} ${a.bodyAName} → ${a.bodyBName}</span>`;
        html += `<br><span style="color:${C.dim}">${t('observatory.inYears', years, margin)}</span>`;
        html += `</div>`;
      }
    }

    // Ostrzeżenia o zdarzeniach
    html += `<div style="font-weight:bold; margin:14px 0 6px; color:${C.accent}; font-size:12px; text-transform:uppercase;">${t('observatory.eventWarnings')}</div>`;
    if (warnings.length === 0) {
      html += `<div style="color:${C.ok}; font-size:12px;">✓ ${t('observatory.noWarnings')}</div>`;
    } else {
      for (const w of warnings) {
        const name = t(`event.${w.event.id}.name`) !== `event.${w.event.id}.name`
          ? t(`event.${w.event.id}.name`) : (w.event.namePL ?? w.event.id);
        html += `<div style="padding:6px 10px; margin-bottom:4px; border-radius:3px; font-size:11px; background:rgba(0,0,0,0.3); border-left:3px solid ${C.accent};">`;
        html += `${w.event.icon ?? '⚠'} <span style="color:${C.accent}">${name}</span>`;
        html += ` → <span style="color:${C.text}">${w.colonyName}</span>`;
        html += `<br><span style="color:${C.dim}">${t('observatory.inYearsSimple', Math.max(0, w.remainingYears))}</span>`;
        html += `</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  // ── Szczegóły ciała (prawa kolumna) ─────────────────────────────────

  _renderBodyDetails() {
    if (!this._selectedBodyId) {
      return `<div style="width:200px; flex-shrink:0; display:flex; align-items:center; justify-content:center; color:${C.dim}; font-size:11px; border-left:1px solid ${C.border}; padding-left:10px;">${t('observatory.selectBody')}</div>`;
    }

    const body = EntityManager.get(this._selectedBodyId);
    if (!body) return '';

    const orb = body.orbital ?? {};
    const icon = body.type === 'planet' ? '🪐' : body.type === 'moon' ? '🌙' : '🪨';
    const homePl = window.KOSMOS?.homePlanet;
    const distAU = homePl ? Math.abs((orb.a ?? 0) - (homePl.orbital?.a ?? 0)).toFixed(2) : '?';

    let html = `<div style="width:200px; flex-shrink:0; padding:8px 10px; border-left:1px solid ${C.border}; overflow-y:auto; min-height:0;">`;
    html += `<div style="font-size:13px; font-weight:bold; color:${C.accent}; margin-bottom:8px;">${icon} ${body.name ?? body.id}</div>`;
    html += this._detailRow(t('observatory.type'), body.planetType ?? body.type);
    html += this._detailRow('a', `${(orb.a ?? 0).toFixed(3)} AU`);
    html += this._detailRow('e', `${(orb.e ?? 0).toFixed(4)}`);
    html += this._detailRow('T', `${(orb.T ?? 0).toFixed(3)} ${t('observatory.years')}`);
    html += this._detailRow(t('observatory.distHome'), `${distAU} AU`);

    if (body.temperatureK) {
      html += this._detailRow(t('observatory.temp'), `${Math.round(body.temperatureK)} K`);
    }

    if (body.atmosphere?.pressure > 0) {
      html += this._detailRow(t('observatory.atmo'), `${body.atmosphere.pressure.toFixed(2)} atm`);
    }

    if (body.deposits?.length > 0) {
      html += `<div style="margin-top:8px; font-weight:bold; color:${C.accent}; font-size:11px; text-transform:uppercase;">${t('observatory.deposits')}</div>`;
      for (const d of body.deposits) {
        html += `<div style="font-size:11px; color:${C.text}; padding:2px 0;">${d.resourceId}: ${d.richness?.toFixed(1) ?? '?'} (${d.remaining ?? '?'})</div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  _detailRow(label, value) {
    return `<div style="display:flex; justify-content:space-between; font-size:11px; padding:3px 0; border-bottom:1px solid ${C.border};">
      <span style="color:${C.dim}">${label}</span>
      <span style="color:${C.text}">${value}</span>
    </div>`;
  }
}
