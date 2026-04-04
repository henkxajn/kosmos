// ExpeditionPanel — panel UI zarządzania ekspedycjami kosmicznymi
//
// Umieszczony po lewej stronie UIScene, poniżej EventLog.
// Tryb zwinięty: tylko nagłówek z licznikiem aktywnych misji.
// Tryb rozwinięty: lista misji + przycisk "Wyślij nową".
//
// Modal wysyłki (w layerze depth 40+):
//   - Wybór typu misji (mining)
//   - Lista celów sortowana wg odległości
//   - Szacowane zarobki i czas podróży
//   - Potwierdzenie kosztów
//
// Dostęp do systemu: window.KOSMOS.expeditionSystem (ustawiany przez GameScene)

import EventBus     from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import { RESOURCE_ICONS } from '../data/BuildingsData.js';

const PANEL_W   = 220;
const HEADER_H  = 24;
const ENTRY_H   = 20;
const MAX_SHOW  = 4;     // max widocznych wpisów w liście
const BTN_H     = 26;

// Kolory statusów ekspedycji
const STATUS_COLORS = {
  en_route:  '#88ccff',
  returning: '#44ffaa',
  completed: '#6888aa',
};

export class ExpeditionPanel {
  constructor(scene, x, y) {
    this.scene    = scene;
    this.x        = x;
    this.y        = y;
    this._expanded  = false;
    this._headerObjs = [];
    this._listObjs   = [];
    this._modalObjs  = [];

    // Stan modalu
    this._selectedType     = 'mining';
    this._selectedTargetId = null;
    // Wymiary modalu (ustawianie przy otwarciu, dla callbacków w wierszach)
    this._modal = { MX: 0, MY: 0, MW: 420, MH: 340 };

    this._buildHeader();
    this._subscribe();
  }

  // ── Nagłówek (zawsze widoczny) ─────────────────────────────────

  _buildHeader() {
    this._headerBg = this.scene.add.rectangle(
      this.x + PANEL_W / 2,
      this.y + HEADER_H / 2,
      PANEL_W, HEADER_H,
      0x060d18, 0.85
    ).setDepth(15).setScrollFactor(0);

    this._headerLabel = this.scene.add.text(
      this.x + 8, this.y + 5,
      this._makeHeaderLabel(),
      { fontSize: '9px', fontFamily: 'monospace', color: '#2a6080' }
    ).setDepth(16).setScrollFactor(0);

    this._arrowLabel = this.scene.add.text(
      this.x + PANEL_W - 8, this.y + 5,
      '▼',
      { fontSize: '9px', fontFamily: 'monospace', color: '#2a6080' }
    ).setOrigin(1, 0).setDepth(16).setScrollFactor(0);

    this._headerBg.setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._toggle())
      .on('pointerover', () => this._headerBg.setFillStyle(0x0d1a2a, 0.90))
      .on('pointerout',  () => this._headerBg.setFillStyle(0x060d18, 0.85));

    this._headerObjs = [this._headerBg, this._headerLabel, this._arrowLabel];
  }

  _makeHeaderLabel() {
    const exSys = window.KOSMOS?.expeditionSystem;
    const count = exSys ? exSys.getActive().length : 0;
    return count > 0 ? `EKSPEDYCJE [${count}]` : 'EKSPEDYCJE';
  }

  _refreshHeader() {
    this._headerLabel.setText(this._makeHeaderLabel());
  }

  // ── Toggle ────────────────────────────────────────────────────

  _toggle() {
    this._expanded = !this._expanded;
    this._arrowLabel.setText(this._expanded ? '▲' : '▼');
    if (this._expanded) {
      this._rebuildList();
    } else {
      this._clearList();
    }
  }

  // ── Lista ekspedycji ──────────────────────────────────────────

  _rebuildList() {
    this._clearList();

    const exSys  = window.KOSMOS?.expeditionSystem;
    const civOk  = !!window.KOSMOS?.civMode;

    // Separator pod nagłówkiem
    this._addSeparator(this.y + HEADER_H);

    let rowY = this.y + HEADER_H + 4;

    if (!civOk) {
      this._addText(rowY, 'Wejdź w tryb cywilizacyjny', '#4a5a6a');
      rowY += ENTRY_H;
    } else if (!exSys) {
      this._addText(rowY, 'System inicjalizacji...', '#4a5a6a');
      rowY += ENTRY_H;
    } else {
      const active = exSys.getActive();
      if (active.length === 0) {
        this._addText(rowY, 'Brak aktywnych misji', '#4a5a6a');
        rowY += ENTRY_H;
      } else {
        for (const exp of active.slice(0, MAX_SHOW)) {
          rowY = this._addExpRow(rowY, exp);
        }
        if (active.length > MAX_SHOW) {
          this._addText(rowY, `...i ${active.length - MAX_SHOW} więcej`, '#3a4a5a');
          rowY += ENTRY_H;
        }
      }
    }

    // Separator + przycisk lub blokada
    rowY += 2;
    this._addSeparator(rowY);
    rowY += 6;

    const { techOk, padOk } = exSys?.canLaunch() ?? { techOk: false, padOk: false };
    if (!civOk || !techOk) {
      this._addText(rowY, civOk ? '🔒 Wymaga: Rakietnictwo' : '', '#cc8844');
    } else if (!padOk) {
      this._addText(rowY, '🔒 Wymaga: Port Kosmiczny', '#cc8844');
    } else {
      this._addSendBtn(rowY);
    }

    // Tło listy (od dołu nagłówka do dołu przycisku)
    const listH = rowY - (this.y + HEADER_H) + BTN_H + 4;
    const bg = this.scene.add.rectangle(
      this.x + PANEL_W / 2,
      this.y + HEADER_H + listH / 2,
      PANEL_W, listH,
      0x040b15, 0.80
    ).setDepth(14).setScrollFactor(0);
    this._listObjs.unshift(bg);
  }

  _addExpRow(y, exp) {
    const color = STATUS_COLORS[exp.status] ?? '#6888aa';
    const arrow = exp.status === 'returning' ? '↩' : '→';
    const icon  = '⛏';
    const name  = exp.targetName.substring(0, 12);
    const yr    = exp.status === 'returning'
      ? `↩ ${this._fmtYear(exp.returnYear)}`
      : `▶ ${this._fmtYear(exp.arrivalYear)}`;

    const t1 = this.scene.add.text(this.x + 6, y, `${arrow} ${name} ${icon}`, {
      fontSize: '9px', fontFamily: 'monospace', color,
    }).setDepth(16).setScrollFactor(0);

    const t2 = this.scene.add.text(this.x + PANEL_W - 6, y, yr, {
      fontSize: '9px', fontFamily: 'monospace', color: '#3a5a6a',
    }).setOrigin(1, 0).setDepth(16).setScrollFactor(0);

    this._listObjs.push(t1, t2);
    return y + ENTRY_H;
  }

  _addSendBtn(y) {
    const btn = this.scene.add.text(
      this.x + PANEL_W / 2, y,
      '[ + Wyślij nową ekspedycję ]',
      {
        fontSize: '9px', fontFamily: 'monospace', color: '#44ffaa',
        backgroundColor: '#041018', padding: { x: 6, y: 4 },
      }
    ).setOrigin(0.5, 0).setDepth(16).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => btn.setStyle({ color: '#88ffcc' }))
      .on('pointerout',  () => btn.setStyle({ color: '#44ffaa' }))
      .on('pointerdown', () => this._openModal());
    this._listObjs.push(btn);
  }

  _addSeparator(y) {
    const gfx = this.scene.add.graphics().setDepth(15).setScrollFactor(0);
    gfx.lineStyle(1, 0x1a3050, 1);
    gfx.lineBetween(this.x + 4, y, this.x + PANEL_W - 4, y);
    this._listObjs.push(gfx);
  }

  _addText(y, text, color = '#6888aa') {
    const t = this.scene.add.text(this.x + 8, y, text, {
      fontSize: '9px', fontFamily: 'monospace', color,
    }).setDepth(16).setScrollFactor(0);
    this._listObjs.push(t);
    return t;
  }

  _clearList() {
    this._listObjs.forEach(o => o.destroy());
    this._listObjs = [];
  }

  // ── Modal wysyłki ekspedycji ───────────────────────────────────

  _openModal() {
    if (this._modalObjs.length > 0) return;

    const W  = this.scene.cameras.main.width;
    const H  = this.scene.cameras.main.height;
    const MW = 420;
    const MH = 340;
    const MX = Math.floor((W - MW) / 2);
    const MY = Math.floor((H - MH) / 2);

    // Zapamiętaj wymiary — używane w callbackach wierszy
    this._modal = { MX, MY, MW, MH };

    // Przyciemnienie tła (kliknięcie zamyka)
    const dim = this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.60)
      .setDepth(40).setScrollFactor(0).setInteractive()
      .on('pointerdown', () => this._closeModal());
    this._modalObjs.push(dim);

    // Tło panelu
    const bg = this.scene.add.rectangle(MX + MW / 2, MY + MH / 2, MW, MH, 0x060f1a, 0.97)
      .setDepth(41).setScrollFactor(0);
    this._modalObjs.push(bg);

    // Obramowanie
    const border = this.scene.add.graphics().setDepth(41).setScrollFactor(0);
    border.lineStyle(1, 0x2a6080, 1);
    border.strokeRect(MX, MY, MW, MH);
    this._modalObjs.push(border);

    // Nagłówek
    this._modalObjs.push(this.scene.add.text(MX + 12, MY + 10,
      'WYŚLIJ EKSPEDYCJĘ', {
        fontSize: '11px', fontFamily: 'monospace', color: '#88ffcc',
      }
    ).setDepth(42).setScrollFactor(0));

    // Separator pod nagłówkiem
    const sep = this.scene.add.graphics().setDepth(42).setScrollFactor(0);
    sep.lineStyle(1, 0x1a3050, 1);
    sep.lineBetween(MX + 6, MY + 28, MX + MW - 6, MY + 28);
    this._modalObjs.push(sep);

    // Przycisk zamknij [×]
    const closeBtn = this.scene.add.text(MX + MW - 8, MY + 8, '×', {
      fontSize: '14px', fontFamily: 'monospace', color: '#ff8888',
    }).setOrigin(1, 0).setDepth(43).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._closeModal())
      .on('pointerover', () => closeBtn.setStyle({ color: '#ffaaaa' }))
      .on('pointerout',  () => closeBtn.setStyle({ color: '#ff8888' }));
    this._modalObjs.push(closeBtn);

    // 6 stałych obiektów ramki — reszta dynamiczna
    this._buildModalContent();
  }

  // Przebuduj dynamiczną zawartość modalu (zachowuje 6 stałych obiektów ramki)
  _buildModalContent() {
    const FRAME_OBJS = 6;  // dim + bg + border + nagłówek + sep + closeBtn
    // Zniszcz stare obiekty zawartości
    while (this._modalObjs.length > FRAME_OBJS) {
      this._modalObjs.pop().destroy();
    }

    const { MX, MY, MW } = this._modal;
    let y = MY + 34;

    // ── Wybór typu misji ─────────────────────────────────────────
    this._mAdd(y, 'Typ misji:', '#4a6a8a');
    y += 14;

    for (const [key, label] of [['mining', '⛏  Wydobycie']]) {
      const active = this._selectedType === key;
      const btn = this.scene.add.text(MX + 12, y, `[ ${label} ]`, {
        fontSize: '10px', fontFamily: 'monospace',
        color:           active ? '#88ffcc' : '#3a5a7a',
        backgroundColor: active ? '#0a2030' : '#040c14',
        padding: { x: 6, y: 3 },
      }).setDepth(42).setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => { this._selectedType = key; this._buildModalContent(); })
        .on('pointerover', () => { if (!active) btn.setStyle({ color: '#6888aa' }); })
        .on('pointerout',  () => { if (!active) btn.setStyle({ color: '#3a5a7a' }); });
      this._modalObjs.push(btn);
      y += 22;
    }

    y += 4;
    this._mAddSep(y);
    y += 8;

    // ── Lista celów ──────────────────────────────────────────────
    this._mAdd(y, 'Wybierz cel:', '#4a6a8a');
    y += 14;

    const targets = this._getTargets();
    if (targets.length === 0) {
      this._mAdd(y, 'Brak dostępnych celów w układzie', '#4a5a6a');
      y += 16;
    } else {
      for (const t of targets.slice(0, 6)) {
        y = this._addTargetRow(y, t);
      }
      if (targets.length > 6) {
        this._mAdd(y, `...i ${targets.length - 6} dalszych celów`, '#3a4a5a');
        y += 14;
      }
    }

    y += 4;
    this._mAddSep(y);
    y += 8;

    // ── Szczegóły wybranego celu ─────────────────────────────────
    if (this._selectedTargetId) {
      const exSys = window.KOSMOS?.expeditionSystem;
      const est   = exSys?.estimateYield(this._selectedType, this._selectedTargetId) ?? {};
      const sel   = targets.find(t => t.id === this._selectedTargetId);

      this._mAdd(y, 'Koszt startu: 150⛏  200⚡  50🌿  0.5👤', '#88aacc');
      y += 14;
      this._mAdd(y, `Szacowany zarobek: ${this._fmtGains(est)}`, '#88ffcc');
      y += 14;
      if (sel) {
        this._mAdd(y, `Odległość: ${sel.distance.toFixed(1)} AU  |  Czas podróży: ${sel.travelTime} lat`, '#6888aa');
        y += 16;
      }

      // Przycisk wyślij
      const sendBtn = this.scene.add.text(MX + MW / 2, y, '[ WYŚLIJ EKSPEDYCJĘ ]', {
        fontSize: '11px', fontFamily: 'monospace', color: '#44ffaa',
        backgroundColor: '#041810', padding: { x: 12, y: 5 },
      }).setOrigin(0.5, 0).setDepth(43).setScrollFactor(0)
        .setInteractive({ useHandCursor: true })
        .on('pointerover', () => sendBtn.setStyle({ color: '#88ffcc' }))
        .on('pointerout',  () => sendBtn.setStyle({ color: '#44ffaa' }))
        .on('pointerdown', () => {
          EventBus.emit('expedition:sendRequest', {
            type:     this._selectedType,
            targetId: this._selectedTargetId,
          });
          this._closeModal();
        });
      this._modalObjs.push(sendBtn);
    } else {
      this._mAdd(y, 'Wybierz cel z listy powyżej', '#3a4a5a');
    }
  }

  // Wiersz celu w modalu (interaktywny)
  _addTargetRow(y, target) {
    const { MX, MW } = this._modal;
    const selected   = target.id === this._selectedTargetId;
    const rowColor   = selected ? '#88ffcc' : '#4a6a8a';
    const rowBgCol   = selected ? 0x0a2030 : 0x040c14;
    const rowAlpha   = selected ? 0.90 : 0.60;

    const rowBg = this.scene.add.rectangle(
      MX + MW / 2, y + 9,
      MW - 20, 18,
      rowBgCol, rowAlpha
    ).setDepth(42).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this._selectedTargetId = target.id;
        this._buildModalContent();
      })
      .on('pointerover', () => { if (!selected) rowBg.setFillStyle(0x0a1a28, 0.80); })
      .on('pointerout',  () => { if (!selected) rowBg.setFillStyle(rowBgCol, rowAlpha); });
    this._modalObjs.push(rowBg);

    const typeIcon = target.type === 'comet' ? '🧊' : target.type === 'planet' ? '🌍' : '🪨';
    const nameT = this.scene.add.text(MX + 16, y + 1,
      `${typeIcon} ${target.name.substring(0, 16)}`, {
        fontSize: '9px', fontFamily: 'monospace', color: rowColor,
      }
    ).setDepth(43).setScrollFactor(0);
    this._modalObjs.push(nameT);

    const distT = this.scene.add.text(MX + MW - 16, y + 1,
      `${target.distance.toFixed(1)} AU  ${target.travelTime}l`, {
        fontSize: '9px', fontFamily: 'monospace', color: '#3a5a7a',
      }
    ).setOrigin(1, 0).setDepth(43).setScrollFactor(0);
    this._modalObjs.push(distT);

    return y + 20;
  }

  _mAdd(y, text, color) {
    const t = this.scene.add.text(this._modal.MX + 12, y, text, {
      fontSize: '9px', fontFamily: 'monospace', color,
    }).setDepth(42).setScrollFactor(0);
    this._modalObjs.push(t);
    return t;
  }

  _mAddSep(y) {
    const { MX, MW } = this._modal;
    const gfx = this.scene.add.graphics().setDepth(42).setScrollFactor(0);
    gfx.lineStyle(1, 0x1a3050, 1);
    gfx.lineBetween(MX + 6, y, MX + MW - 6, y);
    this._modalObjs.push(gfx);
  }

  _closeModal() {
    this._modalObjs.forEach(o => o.destroy());
    this._modalObjs = [];
    this._selectedTargetId = null;
  }

  // ── Pomocniki ──────────────────────────────────────────────────

  // Dostępne cele sortowane wg odległości
  _getTargets() {
    const exSys  = window.KOSMOS?.expeditionSystem;
    const homePl = window.KOSMOS?.homePlanet;
    const results = [];

    // Odległości od aktywnej kolonii (nie zawsze homePlanet)
    const activePlanetId = window.KOSMOS?.colonyManager?.activePlanetId;
    const activeColonyPlanet = activePlanetId ? EntityManager.get(activePlanetId) : homePl;

    const sysId = window.KOSMOS?.activeSystemId ?? 'sys_home';
    for (const t of ['asteroid', 'comet', 'planetoid', 'planet']) {
      for (const body of EntityManager.getByTypeInSystem(t, sysId)) {
        if (body === activeColonyPlanet) continue;
        if (!body.orbital?.a)  continue;
        if (!body.explored) continue;  // tylko zbadane ciała jako cele
        const dist  = exSys?._calcDistance(body, activeColonyPlanet) ?? Math.abs(body.orbital.a - 1.0);
        const travel = Math.max(2, Math.ceil(dist * 2));
        results.push({
          id: body.id, name: body.name, type: body.type,
          distance: parseFloat(dist.toFixed(2)), travelTime: travel,
        });
      }
    }

    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  _fmtGains(gained) {
    const parts = Object.entries(gained)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `~${v}${RESOURCE_ICONS[k] ?? k}`);
    return parts.length > 0 ? parts.join('  ') : 'brak';
  }

  _fmtYear(y) {
    if (!y && y !== 0) return '?';
    if (y < 1000) return `${Math.floor(y)}`;
    if (y < 1e6)  return `${(y / 1000).toFixed(0)}tys`;
    if (y < 1e9)  return `${(y / 1e6).toFixed(1)}M`;
    return `${(y / 1e9).toFixed(2)}G`;
  }

  // ── Subskrypcje ────────────────────────────────────────────────

  _subscribe() {
    const refresh = () => {
      this._refreshHeader();
      if (this._expanded) {
        this._rebuildList();
      }
    };
    EventBus.on('expedition:launched', refresh);
    EventBus.on('expedition:arrived',  refresh);
    EventBus.on('expedition:disaster', refresh);
    EventBus.on('expedition:returned', refresh);
    EventBus.on('planet:colonize',     refresh);
  }

  destroy() {
    this._headerObjs.forEach(o => o.destroy());
    this._clearList();
    this._closeModal();
  }
}
