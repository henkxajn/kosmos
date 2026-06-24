// TechOverlay — panel Technologii (klawisz T)
//
// Canvas 2D, ujednolicony ze wzorcem EconomyOverlay (BaseOverlay):
//   nagłówek (_drawOverlayHeader) + poziomy pasek gałęzi + siatka kart wg Tier
//   + prawy panel szczegółów + dolny pasek kolejki badań.
// Zastąpił poprzednią wersję DOM+SVG (graf neuronowy z pan/zoom), która jako
// jedyny overlay prześwitywała na scenę 3D ("okno w oknie").
//
// Dane LIVE z window.KOSMOS.{techSystem, researchSystem, colonyManager}.
// Tech+Observatory są w jednej grupie subnav — pasek subnav rysuje UIManager
// PO tym overlayu (nasze bounds startują pod nim przez getSubNavHeight()).

import { BaseOverlay }   from './BaseOverlay.js';
import { THEME, bgAlpha } from '../config/ThemeConfig.js';
import { TECHS, TECH_BRANCHES } from '../data/TechData.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { SHIPS }     from '../data/ShipsData.js';
import { HULLS }     from '../data/HullsData.js';
import { COMMODITIES } from '../data/CommoditiesData.js';
import { t, getName, getDesc } from '../i18n/i18n.js';

const BRANCH_ORDER = ['mining', 'energy', 'biology', 'civil', 'space', 'computing', 'defense', 'synthetic'];

// ── Layout (jednostki logiczne, skalowane przez UI_SCALE) ──────────────────
const DETAIL_W      = 252;   // szerokość prawego panelu szczegółów
const BRANCH_TAB_H  = 30;    // wysokość paska gałęzi
const TIER_HDR_H    = 18;    // pasek nagłówków kolumn TIER
const QUEUE_H       = 40;    // dolny pasek kolejki
const CARD_W        = 156;   // szerokość karty techu
const CARD_H        = 44;    // wysokość karty techu
const COL_GAP       = 10;    // odstęp między kolumnami tierów
const ROW_GAP       = 7;     // odstęp pionowy między kartami w kolumnie
const SECTION_HDR_H = 22;    // nagłówek sekcji gałęzi (tryb "Wszystkie")
const SECTION_GAP   = 12;    // odstęp między sekcjami gałęzi
const PAD           = 12;

export class TechOverlay extends BaseOverlay {
  constructor() {
    super(null);
    this._selectedBranch = null;   // null = wszystkie gałęzie
    this._selectedTechId = null;   // wybrany tech (panel szczegółów)
    this._scrollGrid = 0;          // scroll siatki kart
    this._scrollDetail = 0;        // scroll panelu szczegółów
    this._gridMaxScroll = 0;       // wyliczane w _drawGrid
    this._detailMaxScroll = 0;     // wyliczane w _drawDetail
  }

  // OverlayManager woła show(opts)/hide() — opts.branch może preselekcjonować gałąź.
  show(opts = {}) {
    this.visible = true;
    if (opts.branch !== undefined) this._selectedBranch = opts.branch;
    if (opts.techId) this._selectedTechId = opts.techId;
  }

  // ── Render główny ──────────────────────────────────────────────────────
  draw(ctx, W, H) {
    if (!this.visible) return;
    this._hitZones = [];

    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);

    // Tło + ramka (wzór Economy)
    ctx.fillStyle = bgAlpha(0.38);
    ctx.fillRect(ox, oy, ow, oh);
    ctx.strokeStyle = THEME.borderActive;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, ow - 1, oh - 1);

    // Nagłówek: pasmo + tytuł + stawka badań + sloty + zamknij
    this._drawOverlayHeader(ctx, ox, oy, ow, t('techPanel.header'));
    this._drawHeaderInfo(ctx, ox, oy, ow);

    // Pasek gałęzi
    const tabsY = oy + 44; // HEADER_H
    this._drawBranchTabs(ctx, ox, tabsY, ow, BRANCH_TAB_H);

    // Obszar treści (siatka + szczegóły + kolejka)
    const contentY = tabsY + BRANCH_TAB_H;
    const contentH = oh - 44 - BRANCH_TAB_H - QUEUE_H;
    const gridW = ow - DETAIL_W;

    this._drawGrid(ctx, ox, contentY, gridW, contentH);
    this._drawDetail(ctx, ox + gridW, contentY, DETAIL_W, contentH);
    this._drawQueue(ctx, ox, oy + oh - QUEUE_H, ow, QUEUE_H);

    // Absorber tła — klik w pustą przestrzeń overlayu nie przechodzi do sceny 3D.
    // MUSI być ostatni (_hitTest = pierwszy trafiony → karty/przyciski mają priorytet).
    this._addHit(ox, oy, ow, oh, 'bg');
  }

  // ── Nagłówek: info o tempie badań ──────────────────────────────────────
  _drawHeaderInfo(ctx, ox, oy, ow) {
    const rSys = this._getResearchSystem();
    const rate = rSys?.getTotalRate?.() ?? 0;
    const active = rSys?.activeResearch ?? [];
    const maxSlots = rSys?.getMaxSlots?.() ?? 1;

    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.textAlign = 'left';
    let ix = ox + 150;
    ctx.fillStyle = THEME.purple;
    ctx.fillText(t('techPanel.researchRate', rate.toFixed(1)), ix, oy + 18);
    ix += ctx.measureText(t('techPanel.researchRate', rate.toFixed(1))).width + 16;
    ctx.fillStyle = THEME.textSecondary;
    ctx.fillText(`${t('techPanel.slots')} ${active.length}/${maxSlots}`, ix, oy + 18);

    // Zamknij ✕
    const closeX = ox + ow - 24;
    const hov = this._hoverZone?.type === 'close';
    ctx.font = `bold 14px ${THEME.fontFamily}`;
    ctx.fillStyle = hov ? THEME.danger : THEME.textDim;
    ctx.fillText('✕', closeX, oy + 18);
    this._addHit(closeX - 4, oy + 4, 22, 22, 'close');
    ctx.textAlign = 'left';
  }

  // ── Pasek gałęzi ────────────────────────────────────────────────────────
  _drawBranchTabs(ctx, x, y, w, h) {
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();

    const tabs = [{ id: null, icon: '◉', label: t('techPanel.allBranches'), color: '#aac8c0' }];
    for (const brId of BRANCH_ORDER) {
      const br = TECH_BRANCHES[brId];
      tabs.push({ id: brId, icon: br.icon, label: t('techBranch.' + brId), color: br.color });
    }

    ctx.textAlign = 'left';
    let tx = x + PAD;
    for (const tab of tabs) {
      const label = `${tab.icon} ${tab.label}`;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      const tw = Math.ceil(ctx.measureText(label).width) + 18;
      const active = tab.id === this._selectedBranch;
      const hov = this._hoverZone?.type === 'branch' && this._hoverZone?.data?.branchId === (tab.id ?? '__all');

      // Tło / ramka zakładki
      ctx.fillStyle = active ? `${tab.color}22` : (hov ? 'rgba(255,255,255,0.04)' : 'transparent');
      ctx.fillRect(tx, y + 3, tw, h - 9);
      ctx.strokeStyle = active ? tab.color : THEME.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(tx + 0.5, y + 3.5, tw - 1, h - 10);

      // Etykieta
      ctx.fillStyle = active ? tab.color : THEME.textSecondary;
      ctx.fillText(label, tx + 9, y + h / 2 + 1);

      // Mini-pasek postępu gałęzi (done/total)
      const stats = this._branchStats(tab.id);
      if (stats.total > 0) {
        const frac = stats.done / stats.total;
        ctx.fillStyle = THEME.border;
        ctx.fillRect(tx + 4, y + h - 6, tw - 8, 2);
        ctx.fillStyle = tab.color;
        ctx.fillRect(tx + 4, y + h - 6, Math.round((tw - 8) * frac), 2);
      }

      this._addHit(tx, y + 3, tw, h - 6, 'branch', { branchId: tab.id });
      tx += tw + 5;
    }
  }

  // ── Siatka kart (kolumny = Tier) ───────────────────────────────────────
  _drawGrid(ctx, gx, gy, gw, gh) {
    const tSys = this._getTechSystem();
    const rSys = this._getResearchSystem();
    const branches = this._visibleBranches();
    const allMode = !this._selectedBranch;

    // Precompute: gałąź → techy (jeden skan TECHS per gałąź, nie per-tier)
    const techsByBranch = new Map();
    let maxTier = 1;
    for (const br of branches) {
      const list = this._techsOf(br);
      techsByBranch.set(br, list);
      for (const tech of list) maxTier = Math.max(maxTier, tech.tier);
    }

    const colX = (tier) => gx + PAD + (tier - 1) * (CARD_W + COL_GAP);

    // Nagłówki kolumn TIER (stałe, nie scrollują)
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    ctx.textAlign = 'left';
    for (let tier = 1; tier <= maxTier; tier++) {
      if (colX(tier) + CARD_W > gx + gw) break; // poza obszarem siatki
      ctx.fillText(t('techPanel.tierColumn', tier), colX(tier) + 2, gy + 13);
    }

    // Separator prawy (oddziela siatkę od panelu szczegółów)
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(gx + gw, gy); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();

    // Clip + scroll
    const clipY = gy + TIER_HDR_H;
    const clipH = gh - TIER_HDR_H;
    ctx.save();
    ctx.beginPath();
    ctx.rect(gx, clipY, gw, clipH);
    ctx.clip();

    let yc = PAD; // kursor pionowy w przestrzeni treści (przed scrollem)
    for (const br of branches) {
      const list = techsByBranch.get(br) ?? [];
      const byTier = {};
      let rows = 0;
      for (let tier = 1; tier <= maxTier; tier++) {
        byTier[tier] = list.filter(tch => tch.tier === tier);
        rows = Math.max(rows, byTier[tier].length);
      }
      if (rows === 0) continue;

      // Nagłówek sekcji gałęzi (tryb "Wszystkie")
      if (allMode) {
        const br0 = TECH_BRANCHES[br];
        const stats = this._branchStats(br);
        const hy = clipY + yc - this._scrollGrid;
        if (hy + SECTION_HDR_H > clipY && hy < clipY + clipH) {
          ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
          ctx.fillStyle = br0.color;
          ctx.textAlign = 'left';
          ctx.fillText(`${br0.icon} ${t('techBranch.' + br)}  ${stats.done}/${stats.total}`, gx + PAD, hy + 15);
          ctx.strokeStyle = THEME.border;
          ctx.beginPath(); ctx.moveTo(gx + PAD, hy + SECTION_HDR_H - 2); ctx.lineTo(gx + gw - PAD, hy + SECTION_HDR_H - 2); ctx.stroke();
        }
        yc += SECTION_HDR_H;
      }

      for (let tier = 1; tier <= maxTier; tier++) {
        const arr = byTier[tier];
        for (let i = 0; i < arr.length; i++) {
          const tech = arr[i];
          const x = colX(tier);
          const y = clipY + (yc + i * (CARD_H + ROW_GAP)) - this._scrollGrid;
          if (x + CARD_W > gx + gw) continue; // kolumna poza siatką
          if (y + CARD_H <= clipY || y >= clipY + clipH) continue; // poza widokiem
          const state = this._getTechState(tech, tSys, rSys);
          this._drawCard(ctx, tech, x, y, CARD_W, CARD_H, state, rSys);
          this._addHit(x, y, CARD_W, CARD_H, 'card', { techId: tech.id });
        }
      }
      yc += rows * (CARD_H + ROW_GAP) + SECTION_GAP;
    }
    ctx.restore();

    // Scroll clamp
    this._gridMaxScroll = Math.max(0, yc - clipH);
    if (this._scrollGrid > this._gridMaxScroll) this._scrollGrid = this._gridMaxScroll;
  }

  _drawCard(ctx, tech, x, y, w, h, state, rSys) {
    const br = TECH_BRANCHES[tech.branch];
    const selected = tech.id === this._selectedTechId;
    const hov = this._hoverZone?.type === 'card' && this._hoverZone?.data?.techId === tech.id;

    // Kolory wg stanu
    let fill, border, textCol, dim = false;
    switch (state) {
      case 'done':      fill = 'rgba(68,255,136,0.07)';  border = 'rgba(68,255,136,0.45)'; textCol = THEME.success; break;
      case 'active':    fill = 'rgba(170,136,255,0.12)';  border = THEME.purple;            textCol = THEME.purple;  break;
      case 'queued':    fill = 'rgba(0,255,180,0.06)';    border = THEME.accent;            textCol = THEME.textPrimary; break;
      case 'available': fill = 'rgba(255,255,255,0.025)'; border = THEME.borderLight;       textCol = THEME.textPrimary; break;
      default:          fill = 'rgba(255,255,255,0.01)';  border = THEME.border;            textCol = THEME.textDim; dim = true; break; // locked
    }

    if (dim) ctx.globalAlpha = 0.55;
    ctx.fillStyle = hov && !dim ? 'rgba(0,255,180,0.05)' : fill;
    ctx.fillRect(x, y, w, h);

    // Lewy akcent gałęzi
    ctx.fillStyle = br?.color ?? THEME.border;
    ctx.fillRect(x, y, 3, h);

    // Ramka
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    if (state === 'queued') ctx.setLineDash([4, 2]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);

    // Linia 1: ikona + nazwa
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = textCol;
    ctx.textAlign = 'left';
    const lock = (tech.requiresDiscovery && state !== 'done') ? this._discoveryGlyph(tech) : '';
    const name = this._truncate(ctx, `${br?.icon ?? ''} ${getName(tech, 'tech')}`, w - 16 - (lock ? 12 : 0));
    ctx.fillText(name, x + 8, y + 16);
    if (lock) { ctx.textAlign = 'right'; ctx.fillText(lock, x + w - 6, y + 16); ctx.textAlign = 'left'; }

    // Linia 2: status + koszt / postęp
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    const tSys = this._getTechSystem();
    const cost = tSys ? tSys.getEffectiveCost(tech).research : (tech.cost?.research ?? 0);
    if (state === 'done') {
      ctx.fillStyle = THEME.success;
      ctx.fillText(`✓ ${t('techPanel.done')}`, x + 8, y + 34);
    } else if (state === 'active') {
      const pct = rSys?.getProgress?.(tech.id) ?? 0;
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`⟳ ${Math.round(pct * 100)}%`, x + 8, y + 32);
      // Pasek postępu na dole karty
      ctx.fillStyle = THEME.border;
      ctx.fillRect(x + 3, y + h - 3, w - 6, 2);
      ctx.fillStyle = THEME.purple;
      ctx.fillRect(x + 3, y + h - 3, Math.round((w - 6) * Math.min(1, pct)), 2);
    } else if (state === 'queued') {
      const idx = rSys?.researchQueue?.indexOf(tech.id) ?? -1;
      ctx.fillStyle = THEME.accent;
      ctx.fillText(`#${idx + 1}  ·  ${cost} ${t('techPanel.points')}`, x + 8, y + 34);
    } else {
      ctx.fillStyle = dim ? THEME.textDim : THEME.textSecondary;
      ctx.fillText(`${cost} ${t('techPanel.points')}`, x + 8, y + 34);
    }

    ctx.globalAlpha = 1;

    // Obwódka zaznaczenia
    if (selected) {
      ctx.strokeStyle = THEME.accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }

  _discoveryGlyph(tech) {
    const discovSys = window.KOSMOS?.discoverySystem;
    return discovSys?.isDiscovered?.(tech.requiresDiscovery) ? '🔓' : '🔒';
  }

  // ── Panel szczegółów ────────────────────────────────────────────────────
  _drawDetail(ctx, dx, dy, dw, dh) {
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(dx, dy, dw, dh);

    const tSys = this._getTechSystem();
    const rSys = this._getResearchSystem();
    const pad = 12;
    const innerW = dw - pad * 2;

    // Brak wyboru — placeholder
    if (!this._selectedTechId || !TECHS[this._selectedTechId]) {
      ctx.fillStyle = THEME.textDim;
      ctx.font = `${THEME.fontSizeNormal}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.fillText(t('techPanel.selectTech'), dx + dw / 2, dy + dh / 2 - 6);
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('techPanel.clickNode'), dx + dw / 2, dy + dh / 2 + 12);
      ctx.textAlign = 'left';
      this._detailMaxScroll = 0;
      return;
    }

    const tech = TECHS[this._selectedTechId];
    const state = this._getTechState(tech, tSys, rSys);
    const br = TECH_BRANCHES[tech.branch];

    // Wysokość przycisków akcji (rezerwa na dole, poza scrollem)
    const actionsH = 40;
    const clipH = dh - actionsH;

    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, clipH);
    ctx.clip();

    let yy = dy + 16 - this._scrollDetail;
    ctx.textAlign = 'left';

    // Nazwa
    ctx.font = `bold ${THEME.fontSizeMedium}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textPrimary;
    for (const ln of this._wrap(ctx, getName(tech, 'tech'), innerW)) {
      ctx.fillText(ln, dx + pad, yy); yy += 17;
    }
    // Gałąź + tier
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = br?.color ?? THEME.textDim;
    ctx.fillText(`${br?.icon ?? ''} ${t('techBranch.' + tech.branch)} — Tier ${tech.tier}`, dx + pad, yy); yy += 16;

    // Discovery
    if (tech.requiresDiscovery) {
      const discovered = window.KOSMOS?.discoverySystem?.isDiscovered?.(tech.requiresDiscovery);
      ctx.fillStyle = discovered ? '#ffcc44' : '#ff8844';
      const txt = discovered ? `🔓 ${t('techPanel.discoveryFound')} (−50%)` : `🔒 ${t('techPanel.discoveryNeeded')} (×2)`;
      ctx.fillText(txt, dx + pad, yy); yy += 16;
    }
    yy += 4;

    // Opis
    const desc = getDesc(tech, 'tech') || tech.description || '';
    if (desc) {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textSecondary;
      for (const ln of this._wrap(ctx, desc, innerW)) { ctx.fillText(ln, dx + pad, yy); yy += 14; }
      yy += 6;
    }

    // Efekty
    if (tech.effects?.length) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('techPanel.effects'), dx + pad, yy); yy += 14;
      for (const fx of tech.effects) {
        const { text, color } = this._formatEffect(fx);
        ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
        ctx.fillStyle = color;
        for (const ln of this._wrap(ctx, `• ${text}`, innerW)) { ctx.fillText(ln, dx + pad, yy); yy += 14; }
      }
      yy += 6;
    }

    // Wymagania
    if (tech.requires?.length) {
      ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('techPanel.requirements'), dx + pad, yy); yy += 14;
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      for (const req of tech.requires) {
        if (Array.isArray(req)) {
          const anyDone = req.some(r => tSys?.isResearched(r));
          const names = req.map(r => (TECHS[r] ? getName(TECHS[r], 'tech') : r)).join(' / ');
          ctx.fillStyle = anyDone ? THEME.success : THEME.danger;
          for (const ln of this._wrap(ctx, `${anyDone ? '✓' : '✗'} ${names} ${t('techPanel.orAny')}`, innerW)) { ctx.fillText(ln, dx + pad, yy); yy += 14; }
        } else {
          const done = tSys?.isResearched(req);
          ctx.fillStyle = done ? THEME.success : THEME.danger;
          const rn = TECHS[req] ? getName(TECHS[req], 'tech') : req;
          for (const ln of this._wrap(ctx, `${done ? '✓' : '✗'} ${rn}`, innerW)) { ctx.fillText(ln, dx + pad, yy); yy += 14; }
        }
      }
      yy += 6;
    }

    // Koszt + szacowany / pozostały czas
    const cost = tSys ? tSys.getEffectiveCost(tech).research : (tech.cost?.research ?? 0);
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.purple;
    ctx.fillText(`${t('techPanel.cost')}: ${cost} ${t('techPanel.points')}`, dx + pad, yy); yy += 15;

    const year = this._getYear();
    if (state === 'active') {
      const pct = rSys?.getProgress?.(tech.id) ?? 0;
      const eta = rSys?.getETA?.(year, tech.id);
      ctx.fillStyle = THEME.purple;
      ctx.fillText(`${t('techPanel.researching')} ${Math.round(pct * 100)}%`, dx + pad, yy); yy += 14;
      // Pasek postępu
      ctx.fillStyle = THEME.border; ctx.fillRect(dx + pad, yy, innerW, 6);
      ctx.fillStyle = THEME.purple; ctx.fillRect(dx + pad, yy, Math.round(innerW * Math.min(1, pct)), 6);
      yy += 12;
      if (eta != null && isFinite(eta)) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(t('techPanel.eta', Math.max(0, Math.ceil(eta - year))), dx + pad, yy); yy += 14;
      }
    } else if (state === 'available') {
      const rate = rSys?.getTotalRate?.() ?? 0;
      if (rate > 0) {
        ctx.fillStyle = THEME.textSecondary;
        ctx.fillText(t('techPanel.estTime', Math.max(1, Math.ceil(cost / rate))), dx + pad, yy); yy += 14;
      }
    }

    ctx.restore();

    // Scroll clamp (treść względem clipH)
    const contentBottom = yy + this._scrollDetail; // yy już po odjęciu scrolla
    const usedH = contentBottom - (dy + 16);
    this._detailMaxScroll = Math.max(0, usedH - clipH + 16);
    if (this._scrollDetail > this._detailMaxScroll) this._scrollDetail = this._detailMaxScroll;

    // Przyciski akcji (stałe na dole panelu)
    this._drawActions(ctx, dx, dy + dh - actionsH, dw, actionsH, tech, state, rSys);
  }

  _drawActions(ctx, x, y, w, h, tech, state, rSys) {
    ctx.fillStyle = bgAlpha(0.50);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();

    const pad = 12, by = y + 8, bh = h - 16;
    if (state === 'done') {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.success; ctx.textAlign = 'center';
      ctx.fillText(t('techPanel.doneLabel'), x + w / 2, y + h / 2 + 4);
      ctx.textAlign = 'left';
    } else if (state === 'active' || state === 'queued') {
      const label = t('techPanel.dequeueBtn');
      this._drawButton(ctx, label, x + pad, by, w - pad * 2, bh, 'danger');
      this._addHit(x + pad, by, w - pad * 2, bh, 'dequeue', { label, techId: tech.id });
    } else if (state === 'available') {
      const bw = (w - pad * 2 - 6) / 2;
      const l1 = t('techPanel.researchBtn');
      const l2 = t('techPanel.queueBtn');
      this._drawButton(ctx, l1, x + pad, by, bw, bh, 'primary');
      this._addHit(x + pad, by, bw, bh, 'research', { label: l1, techId: tech.id });
      this._drawButton(ctx, l2, x + pad + bw + 6, by, bw, bh, 'secondary');
      this._addHit(x + pad + bw + 6, by, bw, bh, 'queue', { label: l2, techId: tech.id });
    } else {
      ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
      ctx.fillStyle = THEME.textDim; ctx.textAlign = 'center';
      ctx.fillText(t('techPanel.locked'), x + w / 2, y + h / 2 + 4);
      ctx.textAlign = 'left';
    }
  }

  // ── Pasek kolejki ─────────────────────────────────────────────────────
  _drawQueue(ctx, x, y, w, h) {
    ctx.fillStyle = bgAlpha(0.55);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.border;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke();

    const rSys = this._getResearchSystem();
    const active = rSys?.activeResearch ?? [];
    const queue = rSys?.researchQueue ?? [];
    const maxSlots = rSys?.getMaxSlots?.() ?? 1;

    ctx.textAlign = 'left';
    ctx.font = `${THEME.fontSizeSmall - 1}px ${THEME.fontFamily}`;
    ctx.fillStyle = THEME.textDim;
    const hdr = `${t('techPanel.queueHeader')} (${active.length}/${maxSlots}):`;
    ctx.fillText(hdr, x + PAD, y + h / 2 + 4);
    let cx = x + PAD + ctx.measureText(hdr).width + 10;

    if (active.length === 0 && queue.length === 0) {
      ctx.fillStyle = THEME.textDim;
      ctx.fillText(t('techPanel.emptyQueue'), cx, y + h / 2 + 4);
      // Podpowiedź o marnowaniu punktów (brak aktywnego badania)
      const rate = rSys?.getTotalRate?.() ?? 0;
      if (rate > 0) {
        ctx.fillStyle = '#ff8844';
        ctx.fillText(`  ⚠ ${t('techPanel.idleWaste')}`, cx + ctx.measureText(t('techPanel.emptyQueue')).width, y + h / 2 + 4);
      }
      return;
    }

    const chipY = y + 8, chipH = h - 16;
    for (const slot of active) {
      const tech = TECHS[slot.techId];
      if (!tech) continue;
      const pct = rSys.getProgress(slot.techId);
      cx = this._drawQueueChip(ctx, tech, `⟳ ${Math.round(pct * 100)}%`, THEME.purple, cx, chipY, chipH);
    }
    for (let i = 0; i < queue.length; i++) {
      const tech = TECHS[queue[i]];
      if (!tech) continue;
      cx = this._drawQueueChip(ctx, tech, `#${i + 1}`, THEME.textSecondary, cx, chipY, chipH);
    }
  }

  _drawQueueChip(ctx, tech, prefix, prefixColor, x, y, h) {
    const name = getName(tech, 'tech');
    ctx.font = `${THEME.fontSizeSmall}px ${THEME.fontFamily}`;
    const pw = ctx.measureText(prefix).width;
    const nw = ctx.measureText(name).width;
    const w = 8 + pw + 6 + nw + 8 + 12; // pad + prefix + gap + name + gap + ✕

    ctx.fillStyle = THEME.bgPrimary;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    ctx.textAlign = 'left';
    ctx.fillStyle = prefixColor;
    ctx.fillText(prefix, x + 8, y + h / 2 + 4);
    ctx.fillStyle = THEME.textPrimary;
    ctx.fillText(name, x + 8 + pw + 6, y + h / 2 + 4);
    ctx.fillStyle = THEME.danger;
    ctx.fillText('✕', x + w - 12, y + h / 2 + 4);

    // ✕ ma priorytet → dodaj PRZED selekcją chipa
    this._addHit(x + w - 16, y, 16, h, 'qremove', { techId: tech.id });
    this._addHit(x, y, w - 16, h, 'qselect', { techId: tech.id });
    return x + w + 6;
  }

  // ── Interakcja ───────────────────────────────────────────────────────
  _onHit(zone) {
    const rSys = this._getResearchSystem();
    switch (zone.type) {
      case 'close':  this.hide(); break;
      case 'branch':
        this._selectedBranch = zone.data.branchId;
        this._scrollGrid = 0;
        break;
      case 'card':
      case 'qselect':
        this._selectedTechId = zone.data.techId;
        this._scrollDetail = 0;
        break;
      case 'research':
      case 'queue':
        rSys?.queueTech(zone.data.techId);
        this._selectedTechId = zone.data.techId;
        break;
      case 'dequeue':
      case 'qremove':
        rSys?.dequeueTech(zone.data.techId);
        break;
      case 'bg': break; // absorber — brak akcji
    }
  }

  handleScroll(delta, x, y) {
    if (!this.visible) return false;
    const S = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    const W = Math.round(window.innerWidth / S);
    const H = Math.round(window.innerHeight / S);
    const { ox, oy, ow, oh } = this._getOverlayBounds(W, H);
    if (x < ox || x > ox + ow || y < oy || y > oy + oh) return false;

    const gridW = ow - DETAIL_W;
    if (x < ox + gridW) {
      this._scrollGrid = Math.max(0, Math.min(this._gridMaxScroll, this._scrollGrid + delta * 0.5));
    } else {
      this._scrollDetail = Math.max(0, Math.min(this._detailMaxScroll, this._scrollDetail + delta * 0.5));
    }
    return true;
  }

  // ── Helpery ───────────────────────────────────────────────────────────
  _getTechSystem()     { return window.KOSMOS?.techSystem ?? null; }
  _getResearchSystem() { return window.KOSMOS?.researchSystem ?? null; }
  _getYear()           { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  _visibleBranches() { return this._selectedBranch ? [this._selectedBranch] : BRANCH_ORDER; }
  _techsOf(branchId) { return Object.values(TECHS).filter(tch => tch.branch === branchId); }

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
    if (!branchId) {
      // "Wszystkie" — suma po wszystkich gałęziach
      const all = Object.values(TECHS);
      return { done: all.filter(tch => tSys?.isResearched(tch.id)).length, total: all.length };
    }
    const techs = this._techsOf(branchId);
    return { done: techs.filter(tch => tSys?.isResearched(tch.id)).length, total: techs.length };
  }

  _truncate(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  _wrap(ctx, text, maxW) {
    const words = String(text).split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines;
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
        const s = SHIPS[fx.shipId] ?? HULLS[fx.shipId];
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
