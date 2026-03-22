// TechOverlay — panel Technologii (klawisz T)
//
// SVG Neural Network: neurony (tech nodes) + synapsy (prereq edges)
// z animowanymi impulsami świetlnymi. DOM overlay z-index 100.
// Etap 38: 7 gałęzi, tier 1-5, OR prerequisites, discovery soft-gate.

import { THEME }        from '../config/ThemeConfig.js';
import { COSMIC }       from '../config/LayoutConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { SHIPS }     from '../data/ShipsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { t, getName, getDesc } from '../i18n/i18n.js';
import { CIV_SIDEBAR_W } from './CivPanelDrawer.js';

const BRANCH_ORDER = ['mining', 'energy', 'biology', 'civil', 'space', 'computing', 'defense'];

// Layout — rozmiary neuronów i odstępy
const NODE_R = 26;          // promień koła neuronu
const TIER_GAP_X = 180;     // odległość między tierami (X)
const BRANCH_GAP_Y = 80;    // odległość między techami w gałęzi (Y)
const MARGIN_LEFT = 120;     // margines lewy
const MARGIN_TOP = 80;       // margines górny

// ══════════════════════════════════════════════════════════════════════════════
// TechOverlay — SVG Neural Network
// ══════════════════════════════════════════════════════════════════════════════

export class TechOverlay {
  constructor() {
    this.visible = false;
    this._selectedTechId = null;
    this._selectedBranch = null;  // null = ALL
    this._container = null;
    this._svg = null;
    this._detailsPanel = null;
    this._nodes = {};             // techId → SVG <g>
    this._edgePaths = [];         // [{from, to, pathEl, isOr}]
    this._layout = {};            // techId → {x, y}
    this._animFrame = null;

    // Pan / zoom
    this._viewX = 0;
    this._viewY = 0;
    this._zoom = 1.0;
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._viewStartX = 0;
    this._viewStartY = 0;

    // Bound handlers do cleanup
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
  }

  // ── OverlayManager API ──────────────────────────────────────────────────
  toggle() { this.visible ? this.hide() : this.show(); }
  show()   { this.visible = true; this._createDOM(); this._startSyncLoop(); }
  hide()   { this.visible = false; this._destroyDOM(); this._stopSyncLoop(); }

  // Wywoływane co ramkę przez OverlayManager — lekka synchronizacja stanów
  draw() {
    if (!this.visible || !this._svg) return;
    this._syncStates();
  }

  // Blokuj canvas clicks gdy overlay jest widoczny (ale przepuść sidebar)
  handleClick(x)     { return this.visible && x >= CIV_SIDEBAR_W; }
  handleMouseMove() {}
  handleScroll(delta, x) { return this.visible && x >= CIV_SIDEBAR_W; }

  // ── Budowa DOM ──────────────────────────────────────────────────────────

  _createDOM() {
    if (this._container) return;

    // Kontener — dopasowany do bounds overlay (sidebar + topbar + outliner + bottombar)
    // Skalujemy pozycje tak samo jak Canvas UI (UI_SCALE)
    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const c = document.createElement('div');
    c.id = 'tech-overlay';
    c.style.cssText = `
      position: fixed;
      top: ${Math.round(COSMIC.TOP_BAR_H * S)}px;
      left: ${Math.round(CIV_SIDEBAR_W * S)}px;
      right: ${Math.round(COSMIC.OUTLINER_W * S)}px;
      bottom: ${Math.round(COSMIC.BOTTOM_BAR_H * S)}px;
      z-index: 50;
      background: rgba(2,4,5,0.38);
      display: flex; flex-direction: column;
      font-family: ${THEME.fontFamily};
      color: ${THEME.textPrimary};
      user-select: none;
    `;
    this._container = c;

    // Górny pasek (branch tabs + zamknij)
    c.appendChild(this._buildHeader());

    // Środek: SVG graph + details panel
    const mid = document.createElement('div');
    mid.style.cssText = 'flex:1; display:flex; overflow:hidden; position:relative;';

    // SVG
    const svgWrap = document.createElement('div');
    svgWrap.style.cssText = 'flex:1; position:relative; overflow:hidden; cursor:grab;';
    this._svgWrap = svgWrap;

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.cssText = 'position:absolute; inset:0;';
    this._svg = svg;

    // Defs — filtry glow + animacje
    svg.appendChild(this._buildDefs());

    // Grupa transformacji (pan/zoom)
    this._graphGroup = document.createElementNS(ns, 'g');
    this._graphGroup.setAttribute('class', 'graph-root');
    svg.appendChild(this._graphGroup);

    svgWrap.appendChild(svg);
    mid.appendChild(svgWrap);

    // Details panel (prawa strona)
    this._detailsPanel = this._buildDetailsPanel();
    mid.appendChild(this._detailsPanel);

    c.appendChild(mid);

    // Dolny pasek — kolejka badań
    this._queueBar = this._buildQueueBar();
    c.appendChild(this._queueBar);

    // Inject CSS
    this._injectStyles();

    document.body.appendChild(c);

    // Zbuduj graf
    this._layoutGraph();
    this._renderGraph();
    // Auto-fit po krótkim delay (czekamy na layout DOM)
    requestAnimationFrame(() => this._autoFit());

    // Event listeners
    document.addEventListener('keydown', this._onKeyDown);
    svgWrap.addEventListener('wheel', this._onWheel, { passive: false });
    svgWrap.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _destroyDOM() {
    if (!this._container) return;
    document.removeEventListener('keydown', this._onKeyDown);
    this._svgWrap?.removeEventListener('wheel', this._onWheel);
    this._svgWrap?.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);
    this._container.remove();
    this._container = null;
    this._svg = null;
    this._graphGroup = null;
    this._detailsPanel = null;
    this._queueBar = null;
    this._svgWrap = null;
    this._nodes = {};
    this._edgePaths = [];
    if (this._styleEl) { this._styleEl.remove(); this._styleEl = null; }
  }

  // ── Nagłówek (branch tabs) ──────────────────────────────────────────────

  _buildHeader() {
    const hdr = document.createElement('div');
    hdr.style.cssText = `
      display:flex; align-items:center; gap:4px;
      padding: 8px 16px; border-bottom: 1px solid ${THEME.border};
      background: ${THEME.bgSecondary};
    `;

    // Tytuł
    const title = document.createElement('span');
    title.textContent = t('techPanel.header');
    title.style.cssText = `
      color: ${THEME.accent}; font-size: 14px; font-weight: bold;
      margin-right: 12px; letter-spacing: 2px;
    `;
    hdr.appendChild(title);

    // Research rate
    this._rateLabel = document.createElement('span');
    this._rateLabel.style.cssText = `
      color: ${THEME.textSecondary}; font-size: 11px; margin-right: 16px;
    `;
    hdr.appendChild(this._rateLabel);

    // Separator
    const sep = document.createElement('div');
    sep.style.cssText = `width:1px; height:20px; background:${THEME.border}; margin:0 8px;`;
    hdr.appendChild(sep);

    // Tab "ALL"
    this._branchTabs = {};
    const allTab = this._makeTab(null, '◉', t('techPanel.allBranches'), '#aac8c0');
    hdr.appendChild(allTab);

    // Per-branch tabs
    for (const brId of BRANCH_ORDER) {
      const br = TECH_BRANCHES[brId];
      const tab = this._makeTab(brId, br.icon, t('techBranch.' + brId), br.color);
      hdr.appendChild(tab);
    }

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    hdr.appendChild(spacer);

    // Zamknij ×
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
      background:none; border:1px solid ${THEME.border}; color:${THEME.textDim};
      cursor:pointer; font-size:14px; padding:4px 10px; font-family:${THEME.fontFamily};
    `;
    closeBtn.addEventListener('click', () => this.hide());
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.color = THEME.danger; closeBtn.style.borderColor = THEME.danger; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.color = THEME.textDim; closeBtn.style.borderColor = THEME.border; });
    hdr.appendChild(closeBtn);

    return hdr;
  }

  _makeTab(branchId, icon, label, color) {
    const btn = document.createElement('button');
    btn.className = 'tech-branch-tab';
    btn.dataset.branch = branchId ?? 'all';
    btn.innerHTML = `<span style="font-size:14px">${icon}</span> <span style="font-size:10px">${label}</span>`;
    btn.style.cssText = `
      background: transparent; border: 1px solid ${THEME.border};
      color: ${color}; cursor: pointer; padding: 4px 10px;
      font-family: ${THEME.fontFamily}; display:flex; align-items:center; gap:4px;
      transition: background 0.2s, border-color 0.2s;
    `;

    const isActive = branchId === this._selectedBranch;
    if (isActive) {
      btn.style.background = `${color}15`;
      btn.style.borderColor = color;
    }

    btn.addEventListener('click', () => {
      this._selectedBranch = branchId;
      this._updateBranchTabs();
      this._renderGraph();
      this._autoFit();
    });

    btn.addEventListener('mouseenter', () => {
      if (this._selectedBranch !== branchId) {
        btn.style.background = `${color}10`;
      }
    });
    btn.addEventListener('mouseleave', () => {
      if (this._selectedBranch !== branchId) {
        btn.style.background = 'transparent';
      }
    });

    this._branchTabs[branchId ?? 'all'] = btn;
    return btn;
  }

  _updateBranchTabs() {
    for (const [key, btn] of Object.entries(this._branchTabs)) {
      const brId = key === 'all' ? null : key;
      const isActive = brId === this._selectedBranch;
      const br = brId ? TECH_BRANCHES[brId] : null;
      const color = br?.color ?? '#aac8c0';
      btn.style.background = isActive ? `${color}15` : 'transparent';
      btn.style.borderColor = isActive ? color : THEME.border;
    }
  }

  // ── SVG defs (filtry, gradienty) ────────────────────────────────────────

  _buildDefs() {
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');

    // Filtr glow dla zbadanych
    const glow = document.createElementNS(ns, 'filter');
    glow.id = 'glow';
    glow.innerHTML = `
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    `;
    defs.appendChild(glow);

    // Filtr glow aktywny (badanie w toku)
    const glowActive = document.createElementNS(ns, 'filter');
    glowActive.id = 'glow-active';
    glowActive.innerHTML = `
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    `;
    defs.appendChild(glowActive);

    return defs;
  }

  // ── Panel szczegółów (prawa strona) ─────────────────────────────────────

  _buildDetailsPanel() {
    const panel = document.createElement('div');
    panel.className = 'tech-details-panel';
    panel.style.cssText = `
      width: 280px; min-width: 280px;
      border-left: 1px solid ${THEME.border};
      background: ${THEME.bgSecondary};
      overflow-y: auto; padding: 0;
      display: flex; flex-direction: column;
    `;

    // Zawartość — aktualizowana dynamicznie
    this._detailsContent = document.createElement('div');
    this._detailsContent.style.cssText = 'flex:1; overflow-y:auto; padding:12px;';
    panel.appendChild(this._detailsContent);

    this._updateDetails();
    return panel;
  }

  // ── Pasek kolejki (dolny) ───────────────────────────────────────────────

  _buildQueueBar() {
    const bar = document.createElement('div');
    bar.className = 'tech-queue-bar';
    bar.style.cssText = `
      border-top: 1px solid ${THEME.border};
      background: ${THEME.bgSecondary};
      padding: 8px 16px;
      min-height: 42px; max-height: 120px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 4px;
    `;

    this._queueContent = document.createElement('div');
    this._queueContent.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center;';
    bar.appendChild(this._queueContent);

    this._updateQueue();
    return bar;
  }

  // ── Layout grafu ────────────────────────────────────────────────────────

  _layoutGraph() {
    this._layout = {};
    const techs = this._getVisibleTechs();

    // Grupuj po gałęzi i tierze
    const branchTechs = {};
    for (const brId of BRANCH_ORDER) {
      branchTechs[brId] = {};
      for (let tier = 1; tier <= 5; tier++) branchTechs[brId][tier] = [];
    }
    for (const tech of techs) {
      if (branchTechs[tech.branch]?.[tech.tier]) {
        branchTechs[tech.branch][tech.tier].push(tech);
      }
    }

    // Pozycje: tier = X, branch wewnątrz tiera = Y
    // Tylko widoczne gałęzie biorą udział w layoucie
    const visibleBranches = this._selectedBranch
      ? [this._selectedBranch]
      : BRANCH_ORDER;

    const branchOffsets = {};
    let cumulY = 0;
    for (const brId of visibleBranches) {
      let maxInTier = 0;
      for (let tier = 1; tier <= 5; tier++) {
        maxInTier = Math.max(maxInTier, (branchTechs[brId]?.[tier] ?? []).length);
      }
      branchOffsets[brId] = cumulY;
      cumulY += Math.max(1, maxInTier) * BRANCH_GAP_Y + 30;
    }

    // Teraz pozycje per tech
    for (const brId of visibleBranches) {
      for (let tier = 1; tier <= 5; tier++) {
        const arr = branchTechs[brId]?.[tier] ?? [];
        for (let i = 0; i < arr.length; i++) {
          const tech = arr[i];
          const x = MARGIN_LEFT + (tier - 1) * TIER_GAP_X;
          const y = MARGIN_TOP + branchOffsets[brId] + i * BRANCH_GAP_Y;
          this._layout[tech.id] = { x, y };
        }
      }
    }
  }

  _getVisibleTechs() {
    if (this._selectedBranch) {
      return Object.values(TECHS).filter(t => t.branch === this._selectedBranch);
    }
    return Object.values(TECHS);
  }

  // ── Render SVG ──────────────────────────────────────────────────────────

  _renderGraph() {
    const ns = 'http://www.w3.org/2000/svg';
    // Wyczyść
    while (this._graphGroup.firstChild) this._graphGroup.removeChild(this._graphGroup.firstChild);
    this._nodes = {};
    this._edgePaths = [];

    // Przelicz layout
    this._layoutGraph();

    const tSys = this._getTechSystem();
    const rSys = this._getResearchSystem();
    const techs = this._getVisibleTechs();

    // Tier labels w tle
    const tierLabels = document.createElementNS(ns, 'g');
    tierLabels.setAttribute('class', 'tier-labels');
    const maxTier = techs.reduce((m, t) => Math.max(m, t.tier), 1);
    for (let tier = 1; tier <= maxTier; tier++) {
      const x = MARGIN_LEFT + (tier - 1) * TIER_GAP_X;
      const label = document.createElementNS(ns, 'text');
      label.setAttribute('x', x);
      label.setAttribute('y', 30);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', THEME.textDim);
      label.setAttribute('font-size', '10');
      label.setAttribute('font-family', THEME.fontFamily);
      label.textContent = `TIER ${tier}`;
      tierLabels.appendChild(label);
    }
    this._graphGroup.appendChild(tierLabels);

    // Gałąź labels (pionowe, z lewej)
    if (!this._selectedBranch) {
      const brLabels = document.createElementNS(ns, 'g');
      brLabels.setAttribute('class', 'branch-labels');
      for (const brId of BRANCH_ORDER) {
        const br = TECH_BRANCHES[brId];
        const brTechs = techs.filter(t => t.branch === brId);
        if (brTechs.length === 0) continue;
        // Średnia Y dla gałęzi
        const avgY = brTechs.reduce((s, t) => s + (this._layout[t.id]?.y ?? 0), 0) / brTechs.length;
        const label = document.createElementNS(ns, 'text');
        label.setAttribute('x', 20);
        label.setAttribute('y', avgY + 4);
        label.setAttribute('text-anchor', 'start');
        label.setAttribute('fill', br.color);
        label.setAttribute('font-size', '11');
        label.setAttribute('font-family', THEME.fontFamily);
        label.setAttribute('opacity', '0.7');
        label.textContent = `${br.icon} ${t('techBranch.' + brId)}`;
        brLabels.appendChild(label);
      }
      this._graphGroup.appendChild(brLabels);
    }

    // Rysuj krawędzie (synapsy) — najpierw żeby były pod nodami
    const edgeGroup = document.createElementNS(ns, 'g');
    edgeGroup.setAttribute('class', 'edges');
    for (const tech of techs) {
      const to = this._layout[tech.id];
      if (!to) continue;
      for (const req of (tech.requires ?? [])) {
        const reqIds = Array.isArray(req) ? req : [req];
        const isOr = Array.isArray(req);
        for (const reqId of reqIds) {
          const from = this._layout[reqId];
          if (!from) continue;
          const bothDone = tSys?.isResearched(tech.id) && tSys?.isResearched(reqId);

          // Ścieżka Béziera
          const path = document.createElementNS(ns, 'path');
          const dx = (to.x - from.x) * 0.4;
          const d = `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
          path.setAttribute('d', d);
          path.setAttribute('class', `synapse ${bothDone ? 'done' : ''} ${isOr ? 'or' : ''}`);
          path.setAttribute('data-from', reqId);
          path.setAttribute('data-to', tech.id);
          edgeGroup.appendChild(path);

          // Animowany impuls (tylko na zbadanych ścieżkach)
          if (bothDone) {
            const impulse = document.createElementNS(ns, 'circle');
            impulse.setAttribute('r', '2.5');
            impulse.setAttribute('class', 'impulse');
            const anim = document.createElementNS(ns, 'animateMotion');
            anim.setAttribute('dur', `${2 + Math.random() * 2}s`);
            anim.setAttribute('repeatCount', 'indefinite');
            anim.setAttribute('begin', `${Math.random() * 3}s`);
            const mpath = document.createElementNS(ns, 'mpath');
            // Potrzebujemy ID dla ścieżki
            const pathId = `edge-${reqId}-${tech.id}`;
            path.id = pathId;
            mpath.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${pathId}`);
            anim.appendChild(mpath);
            impulse.appendChild(anim);
            edgeGroup.appendChild(impulse);
          }

          this._edgePaths.push({ from: reqId, to: tech.id, pathEl: path, isOr });
        }
      }
    }
    this._graphGroup.appendChild(edgeGroup);

    // Rysuj węzły (neurony)
    const nodeGroup = document.createElementNS(ns, 'g');
    nodeGroup.setAttribute('class', 'nodes');
    for (const tech of techs) {
      const pos = this._layout[tech.id];
      if (!pos) continue;
      const state = this._getTechState(tech, tSys, rSys);
      const br = TECH_BRANCHES[tech.branch];

      const g = document.createElementNS(ns, 'g');
      g.setAttribute('class', `tech-node`);
      g.setAttribute('data-id', tech.id);
      g.setAttribute('data-state', state);
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      // Okrąg zewnętrzny (glow ring) — tylko dla done/active
      if (state === 'done' || state === 'active') {
        const outerRing = document.createElementNS(ns, 'circle');
        outerRing.setAttribute('r', NODE_R + 4);
        outerRing.setAttribute('class', 'outer-ring');
        g.appendChild(outerRing);
      }

      // Główny okrąg
      const circle = document.createElementNS(ns, 'circle');
      circle.setAttribute('r', NODE_R);
      circle.setAttribute('class', 'node-circle');
      g.appendChild(circle);

      // Pasek postępu (arc) — dla active
      if (state === 'active') {
        const pct = rSys?.getProgress() ?? 0;
        const progressArc = this._createProgressArc(NODE_R + 1, pct);
        progressArc.setAttribute('class', 'progress-arc');
        g.appendChild(progressArc);
      }

      // Ikona gałęzi
      const icon = document.createElementNS(ns, 'text');
      icon.setAttribute('y', '-4');
      icon.setAttribute('text-anchor', 'middle');
      icon.setAttribute('font-size', '14');
      icon.setAttribute('class', 'node-icon');
      icon.textContent = br?.icon ?? '?';
      g.appendChild(icon);

      // Nazwa (skrócona)
      const name = document.createElementNS(ns, 'text');
      name.setAttribute('y', '12');
      name.setAttribute('text-anchor', 'middle');
      name.setAttribute('font-size', '8');
      name.setAttribute('font-family', THEME.fontFamily);
      name.setAttribute('class', 'node-name');
      const techName = getName(tech, 'tech');
      name.textContent = techName.length > 14 ? techName.slice(0, 13) + '…' : techName;
      g.appendChild(name);

      // Status badge
      if (state === 'done') {
        const badge = document.createElementNS(ns, 'text');
        badge.setAttribute('y', '-16');
        badge.setAttribute('x', '16');
        badge.setAttribute('text-anchor', 'middle');
        badge.setAttribute('font-size', '10');
        badge.textContent = '✓';
        badge.setAttribute('fill', THEME.success);
        g.appendChild(badge);
      } else if (state === 'queued') {
        const idx = rSys?.researchQueue?.indexOf(tech.id) ?? -1;
        if (idx >= 0) {
          const badge = document.createElementNS(ns, 'text');
          badge.setAttribute('y', '-16');
          badge.setAttribute('x', '16');
          badge.setAttribute('text-anchor', 'middle');
          badge.setAttribute('font-size', '9');
          badge.setAttribute('font-family', THEME.fontFamily);
          badge.textContent = `#${idx + 1}`;
          badge.setAttribute('fill', THEME.accent);
          g.appendChild(badge);
        }
      }

      // Discovery badge
      if (tech.requiresDiscovery && state !== 'done') {
        const discovSys = window.KOSMOS?.discoverySystem;
        const discovered = discovSys?.isDiscovered(tech.requiresDiscovery);
        const dbadge = document.createElementNS(ns, 'text');
        dbadge.setAttribute('y', '-16');
        dbadge.setAttribute('x', '-16');
        dbadge.setAttribute('text-anchor', 'middle');
        dbadge.setAttribute('font-size', '10');
        dbadge.textContent = discovered ? '🔓' : '🔒';
        g.appendChild(dbadge);
      }

      // Kliknięcie
      g.style.cursor = state !== 'locked' ? 'pointer' : 'default';
      g.addEventListener('click', (e) => {
        e.stopPropagation();
        this._selectedTechId = tech.id;
        this._updateDetails();
        this._highlightSelected();
      });

      // Hover
      g.addEventListener('mouseenter', () => { g.classList.add('hovered'); });
      g.addEventListener('mouseleave', () => { g.classList.remove('hovered'); });

      nodeGroup.appendChild(g);
      this._nodes[tech.id] = g;
    }
    this._graphGroup.appendChild(nodeGroup);

    // Highlight wybranego
    this._highlightSelected();
  }

  _createProgressArc(r, pct) {
    const ns = 'http://www.w3.org/2000/svg';
    const path = document.createElementNS(ns, 'path');
    if (pct <= 0) {
      path.setAttribute('d', 'M 0 0');
      return path;
    }
    const angle = Math.PI * 2 * Math.min(pct, 0.999);
    const startX = 0;
    const startY = -r;
    const endX = r * Math.sin(angle);
    const endY = -r * Math.cos(angle);
    const largeArc = angle > Math.PI ? 1 : 0;
    path.setAttribute('d', `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`);
    return path;
  }

  _highlightSelected() {
    for (const [id, g] of Object.entries(this._nodes)) {
      g.classList.toggle('selected', id === this._selectedTechId);
    }
  }

  // ── Aktualizacja szczegółów ─────────────────────────────────────────────

  _updateDetails() {
    const el = this._detailsContent;
    if (!el) return;
    el.innerHTML = '';

    const tSys = this._getTechSystem();
    const rSys = this._getResearchSystem();

    if (!this._selectedTechId) {
      el.innerHTML = `
        <div style="color:${THEME.textDim}; padding:20px 0; text-align:center; font-size:11px;">
          <div style="font-size:20px; margin-bottom:8px;">◉</div>
          ${t('techPanel.selectTech')}<br>
          <span style="font-size:9px; opacity:0.5;">${t('techPanel.clickNode')}</span>
        </div>
      `;
      return;
    }

    const tech = TECHS[this._selectedTechId];
    if (!tech) return;

    const state = this._getTechState(tech, tSys, rSys);
    const br = TECH_BRANCHES[tech.branch];

    // Nagłówek
    let html = `
      <div style="border-bottom:1px solid ${THEME.border}; padding-bottom:8px; margin-bottom:8px;">
        <div style="color:${THEME.textPrimary}; font-size:13px; font-weight:bold;">
          ${getName(tech, 'tech')}
        </div>
        <div style="color:${br?.color ?? THEME.textDim}; font-size:10px; margin-top:2px;">
          ${br?.icon ?? ''} ${t('techBranch.' + tech.branch)} — Tier ${tech.tier}
        </div>
      </div>
    `;

    // Discovery
    if (tech.requiresDiscovery) {
      const discovSys = window.KOSMOS?.discoverySystem;
      const discovered = discovSys?.isDiscovered(tech.requiresDiscovery);
      const badge = discovered
        ? `<span style="color:#ffcc44;">🔓 ${t('techPanel.discoveryFound')} (−50%)</span>`
        : `<span style="color:#ff8844;">🔒 ${t('techPanel.discoveryNeeded')} (×2)</span>`;
      html += `<div style="font-size:10px; margin-bottom:6px;">${badge}</div>`;
    }

    // Opis
    const desc = getDesc(tech, 'tech') || tech.description || '';
    html += `<div style="color:${THEME.textSecondary}; font-size:10px; margin-bottom:8px; line-height:1.4;">${desc}</div>`;

    // Efekty
    if (tech.effects.length > 0) {
      html += `<div style="color:${THEME.textDim}; font-size:8px; letter-spacing:1px; margin-bottom:4px;">${t('techPanel.effects')}</div>`;
      for (const fx of tech.effects) {
        const { text, color } = this._formatEffect(fx);
        html += `<div style="color:${color}; font-size:10px; padding:1px 0;">• ${text}</div>`;
      }
      html += '<div style="height:6px;"></div>';
    }

    // Wymagania
    if (tech.requires.length > 0) {
      html += `<div style="color:${THEME.textDim}; font-size:8px; letter-spacing:1px; margin-bottom:4px;">${t('techPanel.requirements')}</div>`;
      for (const req of tech.requires) {
        if (Array.isArray(req)) {
          const anyDone = req.some(r => tSys?.isResearched(r));
          const names = req.map(r => { const rt = TECHS[r]; return rt ? getName(rt, 'tech') : r; }).join(' / ');
          const icon = anyDone ? '✓' : '✗';
          const col = anyDone ? THEME.success : THEME.danger;
          html += `<div style="color:${col}; font-size:10px;">${icon} ${names} <span style="color:${THEME.textDim}; font-size:8px;">${t('techPanel.orAny')}</span></div>`;
        } else {
          const done = tSys?.isResearched(req);
          const icon = done ? '✓' : '✗';
          const col = done ? THEME.success : THEME.danger;
          const reqTech = TECHS[req];
          html += `<div style="color:${col}; font-size:10px;">${icon} ${reqTech ? getName(reqTech, 'tech') : req}</div>`;
        }
      }
      html += '<div style="height:6px;"></div>';
    }

    // Koszt
    const effectiveCost = tSys ? tSys.getEffectiveCost(tech).research : tech.cost.research;
    html += `<div style="color:${THEME.textDim}; font-size:9px; margin-bottom:8px;">${t('techPanel.research')} ${effectiveCost} pkt</div>`;

    // Przyciski akcji
    if (state === 'done') {
      html += `<div style="color:${THEME.success}; font-size:11px; text-align:center; padding:8px;">✓ ${t('techPanel.doneLabel')}</div>`;
    } else if (state === 'active') {
      const pct = rSys?.getProgress?.(tech.id) ?? 0;
      const slot = rSys?.activeResearch?.find(s => s.techId === tech.id);
      const prog = Math.floor(slot?.progress ?? 0);
      const slotInfo = (rSys?.getMaxSlots?.() ?? 1) > 1
        ? ` (${rSys.activeResearch.length}/${rSys.getMaxSlots()} ${t('techPanel.slots')})`
        : '';
      html += `
        <div style="color:${THEME.purple}; font-size:10px; margin-bottom:4px;">
          ${t('techPanel.researching')} ${prog}/${effectiveCost}${slotInfo}
        </div>
        <div style="background:${THEME.border}; height:6px; margin-bottom:8px; position:relative;">
          <div style="background:${THEME.purple}; height:100%; width:${Math.round(pct * 100)}%;"></div>
        </div>
      `;
      html += this._actionButton('✕ ' + t('techPanel.dequeueBtn'), 'danger', `cancel:${tech.id}`);
    } else if (state === 'available') {
      html += `<div style="display:flex; gap:6px;">`;
      html += this._actionButton('▶ ' + t('techPanel.researchBtn'), 'primary', `research:${tech.id}`);
      html += this._actionButton('+ ' + t('techPanel.queueBtn'), 'secondary', `queue:${tech.id}`);
      html += `</div>`;
    } else if (state === 'queued') {
      html += this._actionButton('✕ ' + t('techPanel.dequeueBtn'), 'danger', `dequeue:${tech.id}`);
    } else {
      html += `<div style="color:${THEME.textDim}; font-size:10px; text-align:center; padding:8px;">${t('techPanel.locked')}</div>`;
    }

    el.innerHTML = html;

    // Hookuj przyciski
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const [action, techId] = btn.dataset.action.split(':');
        this._handleAction(action, techId);
      });
    });
  }

  _actionButton(label, style, action) {
    const styles = {
      primary:   { bg: `${THEME.accent}15`, border: THEME.accent, color: THEME.accent },
      secondary: { bg: 'transparent', border: THEME.borderLight, color: THEME.textSecondary },
      danger:    { bg: 'rgba(255,51,68,0.08)', border: 'rgba(255,51,68,0.4)', color: THEME.danger },
    };
    const s = styles[style] ?? styles.secondary;
    return `<button data-action="${action}" style="
      flex:1; background:${s.bg}; border:1px solid ${s.border}; color:${s.color};
      cursor:pointer; padding:6px 8px; font-size:10px; font-family:${THEME.fontFamily};
      transition: background 0.2s;
    " onmouseenter="this.style.background='${s.border}22'" onmouseleave="this.style.background='${s.bg}'"
    >${label}</button>`;
  }

  _handleAction(action, techId) {
    const rSys = this._getResearchSystem();
    if (!rSys) return;

    switch (action) {
      case 'research':
      case 'queue':
        rSys.queueTech(techId);
        break;
      case 'cancel':
      case 'dequeue':
        rSys.dequeueTech(techId);
        break;
    }

    // Odśwież po akcji
    this._renderGraph();
    this._applyTransform();
    this._updateDetails();
    this._updateQueue();
  }

  // ── Kolejka badań (dolny pasek) ─────────────────────────────────────────

  _updateQueue() {
    const el = this._queueContent;
    if (!el) return;
    el.innerHTML = '';

    const rSys = this._getResearchSystem();
    const tSys = this._getTechSystem();
    if (!rSys) return;

    const active = rSys.activeResearch ?? [];
    const queue = rSys.researchQueue ?? [];
    const maxSlots = rSys.getMaxSlots?.() ?? 1;

    // Header z info o slotach
    const hdr = document.createElement('span');
    hdr.style.cssText = `color:${THEME.textDim}; font-size:9px; letter-spacing:1px; margin-right:8px;`;
    const slotsLabel = maxSlots > 1 ? ` (${active.length}/${maxSlots})` : '';
    hdr.textContent = t('techPanel.queueHeader') + slotsLabel + ':';
    el.appendChild(hdr);

    // Aktywnie badane (wszystkie sloty)
    for (const slot of active) {
      const tech = TECHS[slot.techId];
      if (!tech) continue;
      const pct = rSys.getProgress(slot.techId);
      const chip = this._queueChip(tech, `⟳ ${Math.round(pct * 100)}%`, THEME.purple, slot.techId);
      el.appendChild(chip);
    }

    // Kolejka
    for (let i = 0; i < queue.length; i++) {
      const tech = TECHS[queue[i]];
      if (!tech) continue;
      const chip = this._queueChip(tech, `#${i + 1}`, THEME.textSecondary, queue[i]);
      el.appendChild(chip);
    }

    if (active.length === 0 && queue.length === 0) {
      const empty = document.createElement('span');
      empty.style.cssText = `color:${THEME.textDim}; font-size:9px;`;
      empty.textContent = t('techPanel.emptyQueue');
      el.appendChild(empty);
    }
  }

  _queueChip(tech, prefix, prefixColor, techId) {
    const chip = document.createElement('span');
    chip.style.cssText = `
      display:inline-flex; align-items:center; gap:4px;
      background:${THEME.bgPrimary}; border:1px solid ${THEME.border};
      padding:2px 8px; font-size:9px; cursor:pointer;
    `;
    chip.innerHTML = `
      <span style="color:${prefixColor}">${prefix}</span>
      <span style="color:${THEME.textPrimary}">${getName(tech, 'tech')}</span>
      <span class="queue-remove" style="color:${THEME.danger}; cursor:pointer; margin-left:4px;">✕</span>
    `;

    // Kliknięcie na chip — podgląd
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('queue-remove')) {
        e.stopPropagation();
        this._handleAction('dequeue', techId);
        return;
      }
      this._selectedTechId = techId;
      this._updateDetails();
      this._highlightSelected();
    });

    return chip;
  }

  // ── Synchronizacja stanów (co frame) ────────────────────────────────────

  _syncStates() {
    const tSys = this._getTechSystem();
    const rSys = this._getResearchSystem();

    // Aktualizuj stany nodów
    for (const tech of this._getVisibleTechs()) {
      const g = this._nodes[tech.id];
      if (!g) continue;
      const state = this._getTechState(tech, tSys, rSys);
      if (g.getAttribute('data-state') !== state) {
        // Stan się zmienił — pełen re-render
        this._renderGraph();
        this._applyTransform();
        this._updateDetails();
        this._updateQueue();
        return;
      }
    }

    // Lekka aktualizacja — postęp badań (wszystkie aktywne sloty)
    const activeSlots = rSys?.activeResearch ?? [];
    for (const slot of activeSlots) {
      const pct = rSys.getProgress(slot.techId);
      const g = this._nodes[slot.techId];
      if (g) {
        const arc = g.querySelector('.progress-arc');
        if (arc) {
          const r = NODE_R + 1;
          const angle = Math.PI * 2 * Math.min(pct, 0.999);
          if (pct > 0) {
            const startX = 0, startY = -r;
            const endX = r * Math.sin(angle), endY = -r * Math.cos(angle);
            const largeArc = angle > Math.PI ? 1 : 0;
            arc.setAttribute('d', `M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`);
          }
        }
      }
    }

    // Aktualizuj rate label
    if (this._rateLabel) {
      const rate = rSys?.getTotalRate() ?? 0;
      this._rateLabel.textContent = t('techPanel.researchRate', rate.toFixed(1));
    }

    // Aktualizuj kolejkę (progress %)
    this._updateQueue();
  }

  _startSyncLoop() {
    this._stopSyncLoop();
    const loop = () => {
      if (!this.visible) return;
      this._syncStates();
      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  _stopSyncLoop() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  // ── Pan / Zoom ──────────────────────────────────────────────────────────

  _handleMouseDown(e) {
    if (e.button !== 0) return;
    this._dragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._viewStartX = this._viewX;
    this._viewStartY = this._viewY;
    this._svgWrap.style.cursor = 'grabbing';
  }

  _handleMouseMove(e) {
    if (!this._dragging) return;
    const dx = e.clientX - this._dragStartX;
    const dy = e.clientY - this._dragStartY;
    this._viewX = this._viewStartX + dx / this._zoom;
    this._viewY = this._viewStartY + dy / this._zoom;
    this._applyTransform();
  }

  _handleMouseUp() {
    this._dragging = false;
    if (this._svgWrap) this._svgWrap.style.cursor = 'grab';
  }

  _handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this._zoom = Math.max(0.3, Math.min(3.0, this._zoom * delta));
    this._applyTransform();
  }

  _handleKeyDown(e) {
    if (e.key === 'Escape') {
      this.hide();
    }
  }

  _applyTransform() {
    if (!this._graphGroup) return;
    this._graphGroup.setAttribute('transform',
      `translate(${this._viewX * this._zoom}, ${this._viewY * this._zoom}) scale(${this._zoom})`
    );
  }

  /** Dopasuj zoom i pan aby cały graf mieścił się w widoku */
  _autoFit() {
    const positions = Object.values(this._layout);
    if (positions.length === 0) return;

    // Bounding box grafu
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of positions) {
      minX = Math.min(minX, p.x - NODE_R);
      maxX = Math.max(maxX, p.x + NODE_R);
      minY = Math.min(minY, p.y - NODE_R);
      maxY = Math.max(maxY, p.y + NODE_R);
    }

    const graphW = maxX - minX + 60;  // margines
    const graphH = maxY - minY + 60;

    // Wymiary SVG wrap
    const wrapRect = this._svgWrap?.getBoundingClientRect();
    if (!wrapRect || wrapRect.width === 0) {
      this._viewX = 0; this._viewY = 0; this._zoom = 1.0;
      this._applyTransform();
      return;
    }

    const viewW = wrapRect.width;
    const viewH = wrapRect.height;

    // Zoom aby zmieścić
    this._zoom = Math.min(viewW / graphW, viewH / graphH, 1.5);
    this._zoom = Math.max(0.3, Math.min(this._zoom, 1.5));

    // Centruj
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this._viewX = (viewW / (2 * this._zoom)) - centerX;
    this._viewY = (viewH / (2 * this._zoom)) - centerY;

    this._applyTransform();
  }

  // ── CSS Styles ──────────────────────────────────────────────────────────

  _injectStyles() {
    if (this._styleEl) return;
    const style = document.createElement('style');
    style.textContent = `
      /* ── Neural Network Tech Tree ─────────────────────────────── */

      #tech-overlay * { box-sizing: border-box; }

      /* Węzły — stany */
      .tech-node .node-circle {
        fill: ${THEME.bgPrimary};
        stroke: ${THEME.border};
        stroke-width: 1.5;
        transition: fill 0.3s, stroke 0.3s;
      }
      .tech-node .outer-ring {
        fill: none;
        stroke: transparent;
        stroke-width: 1;
      }
      .tech-node .node-icon { fill: ${THEME.textDim}; pointer-events: none; }
      .tech-node .node-name { fill: ${THEME.textDim}; pointer-events: none; }

      /* done */
      .tech-node[data-state="done"] .node-circle {
        fill: rgba(68,255,136,0.08);
        stroke: rgba(68,255,136,0.5);
        filter: url(#glow);
      }
      .tech-node[data-state="done"] .outer-ring {
        stroke: rgba(68,255,136,0.15);
      }
      .tech-node[data-state="done"] .node-icon { fill: ${THEME.success}; }
      .tech-node[data-state="done"] .node-name { fill: ${THEME.success}; }

      /* active */
      .tech-node[data-state="active"] .node-circle {
        fill: rgba(170,136,255,0.1);
        stroke: ${THEME.purple};
        filter: url(#glow-active);
        animation: node-pulse 2s ease-in-out infinite;
      }
      .tech-node[data-state="active"] .outer-ring {
        stroke: rgba(170,136,255,0.2);
        animation: ring-pulse 2s ease-in-out infinite;
      }
      .tech-node[data-state="active"] .node-icon { fill: ${THEME.purple}; }
      .tech-node[data-state="active"] .node-name { fill: ${THEME.purple}; }

      /* available */
      .tech-node[data-state="available"] .node-circle {
        fill: rgba(170,200,192,0.04);
        stroke: ${THEME.borderLight};
      }
      .tech-node[data-state="available"] .node-icon { fill: ${THEME.textPrimary}; }
      .tech-node[data-state="available"] .node-name { fill: ${THEME.textPrimary}; }

      /* queued */
      .tech-node[data-state="queued"] .node-circle {
        fill: rgba(0,255,180,0.04);
        stroke: ${THEME.accent};
        stroke-dasharray: 4 2;
      }
      .tech-node[data-state="queued"] .node-icon { fill: ${THEME.textPrimary}; }
      .tech-node[data-state="queued"] .node-name { fill: ${THEME.textPrimary}; }

      /* locked */
      .tech-node[data-state="locked"] { opacity: 0.35; }
      .tech-node[data-state="locked"] .node-circle {
        fill: ${THEME.bgPrimary};
        stroke: ${THEME.border};
      }

      /* hover */
      .tech-node.hovered .node-circle {
        stroke-width: 2.5;
      }
      .tech-node.hovered:not([data-state="locked"]) .node-circle {
        fill: rgba(0,255,180,0.06);
      }

      /* selected */
      .tech-node.selected .node-circle {
        stroke-width: 3;
        stroke: ${THEME.accent} !important;
      }

      /* Synapsy */
      .synapse {
        fill: none;
        stroke: rgba(170,200,192,0.08);
        stroke-width: 1;
        transition: stroke 0.3s;
      }
      .synapse.or {
        stroke-dasharray: 4 3;
      }
      .synapse.done {
        stroke: rgba(68,255,136,0.2);
        stroke-width: 1.5;
      }

      /* Impulsy */
      .impulse {
        fill: rgba(68,255,136,0.7);
      }

      /* Progress arc */
      .progress-arc {
        fill: none;
        stroke: ${THEME.purple};
        stroke-width: 3;
        stroke-linecap: round;
      }

      /* Animacje */
      @keyframes node-pulse {
        0%, 100% { opacity: 0.85; }
        50% { opacity: 1; }
      }
      @keyframes ring-pulse {
        0%, 100% { stroke-opacity: 0.15; }
        50% { stroke-opacity: 0.4; }
      }

      /* Scrollbar dla panelu szczegółów */
      .tech-details-panel::-webkit-scrollbar { width: 6px; }
      .tech-details-panel::-webkit-scrollbar-track { background: ${THEME.bgPrimary}; }
      .tech-details-panel::-webkit-scrollbar-thumb { background: ${THEME.border}; }
      .tech-details-panel::-webkit-scrollbar-thumb:hover { background: ${THEME.accent}; }

      .tech-queue-bar::-webkit-scrollbar { height: 4px; }
      .tech-queue-bar::-webkit-scrollbar-track { background: ${THEME.bgPrimary}; }
      .tech-queue-bar::-webkit-scrollbar-thumb { background: ${THEME.border}; }
    `;
    document.head.appendChild(style);
    this._styleEl = style;
  }

  // ── Helpery (zachowane z Canvas wersji) ─────────────────────────────────

  _getTechSystem()    { return window.KOSMOS?.techSystem ?? null; }
  _getResearchSystem(){ return window.KOSMOS?.researchSystem ?? null; }
  _getYear()          { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  _getTechState(tech, tSys, rSys) {
    if (tSys?.isResearched(tech.id)) return 'done';
    if (rSys?.isActive?.(tech.id)) return 'active';
    if (rSys?.researchQueue?.includes(tech.id)) return 'queued';
    if (this._canResearch(tech, tSys)) return 'available';
    return 'locked';
  }

  _canResearch(tech, tSys) {
    if (!tSys) return false;
    if (tSys.isResearched(tech.id)) return false;
    return tSys.checkPrerequisites(tech);
  }

  _branchStats(branchId) {
    const tSys = this._getTechSystem();
    const techs = Object.values(TECHS).filter(t => t.branch === branchId);
    const done = techs.filter(t => tSys?.isResearched(t.id)).length;
    return { done, total: techs.length };
  }

  _formatEffect(fx) {
    switch (fx.type) {
      case 'modifier':
        return { text: `+${Math.round((fx.multiplier - 1) * 100)}% ${fx.resource}`, color: THEME.success };
      case 'unlockBuilding': {
        const b = BUILDINGS[fx.buildingId];
        return { text: `[${t('techPanel.fxUnlock')}] ${b ? getName(b, 'building') : fx.buildingId}`, color: THEME.accent };
      }
      case 'unlockShip': {
        const s = SHIPS[fx.shipId];
        return { text: `[${t('techPanel.fxUnlockShip')}] ${s ? getName(s, 'ship') : fx.shipId}`, color: '#88ddff' };
      }
      case 'unlockCommodity': {
        const c = COMMODITIES[fx.commodityId];
        return { text: `[${t('techPanel.fxUnlockRecipe')}] ${c ? (c.namePL ?? fx.commodityId) : fx.commodityId}`, color: '#ffcc66' };
      }
      case 'prosperityBonus':
        return { text: `${t('techPanel.fxProsperity') || 'prosperity'} +${fx.amount}`, color: THEME.purple };
      case 'popGrowthBonus':
        return { text: `${t('techPanel.fxPopGrowth')} ×${fx.multiplier}`, color: '#88dd88' };
      case 'consumptionMultiplier':
        return { text: `${Math.round((1 - fx.multiplier) * 100)}% ${t('techPanel.fxLess')} ${fx.resource}`, color: '#88ddff' };
      case 'buildingLevelCap':
        return { text: `${t('techPanel.fxMaxLevel')}: ${fx.maxLevel}`, color: THEME.accent };
      case 'unlockFeature':
        return { text: `[${t('techPanel.fxUnlock')}] ${fx.feature}`, color: THEME.accent };
      case 'terrainUnlock':
        return { text: `${t('techPanel.fxTerrainUnlock')}: ${fx.terrain} → ${fx.categories.join(', ')}`, color: '#88ddff' };
      case 'factorySpeedMultiplier':
        return { text: `${t('techPanel.fxFactorySpeed')} ×${fx.multiplier}`, color: '#ffcc66' };
      case 'buildTimeMultiplier':
        return { text: `${t('techPanel.fxBuildTime')} ×${fx.multiplier}`, color: '#88ddff' };
      case 'autonomousEfficiency':
        return { text: `${t('techPanel.fxAutoEfficiency')} ×${fx.multiplier}`, color: '#88dd88' };
      case 'fuelEfficiency':
        return { text: `${t('techPanel.fxFuelEff')} ×${fx.multiplier}`, color: '#88ddff' };
      case 'shipSurvival':
        return { text: `${t('techPanel.fxShipSurvival')} +${Math.round(fx.amount * 100)}%`, color: '#ffcc66' };
      case 'shipSpeedMultiplier':
        return { text: `${t('techPanel.fxShipSpeed')} ×${fx.multiplier}`, color: '#88ddff' };
      case 'disasterReduction':
        return { text: `${t('techPanel.fxDisasterReduc')} −${fx.amount}%`, color: THEME.success };
      case 'researchCostMultiplier':
        return { text: `${t('techPanel.fxResearchCost')} ×${fx.multiplier}`, color: THEME.purple };
      case 'allBuildingsAutonomous':
        return { text: t('techPanel.fxSingularity'), color: '#ffdd44' };
      case 'researchSlots':
        return { text: `+${fx.amount} ${t('techPanel.fxResearchSlots')}`, color: THEME.purple };
      default:
        return { text: JSON.stringify(fx), color: THEME.textDim };
    }
  }
}
