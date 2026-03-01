// ActionPanel — panel akcji gracza (prawy dolny róg)
// Wyświetla pasek energii i 3 przyciski akcji
// Komunikacja: nasłuchuje 'player:energyChanged', 'player:actionResult'
// Emituje: 'action:stabilize', 'action:nudgeToHz', 'action:bombard' (przez klik lub klawiaturę)

import EventBus         from '../core/EventBus.js';
import { ACTION_COSTS } from '../systems/PlayerActionSystem.js';

// Definicje przycisków
const ACTIONS = [
  {
    id:      'stabilize',
    label:   'STABILIZUJ',
    key:     'Q',
    cost:    ACTION_COSTS.stabilize,
    color:   '#44aaff',
    desc:    'Okrągla orbitę (−e)',
  },
  {
    id:      'nudgeToHz',
    label:   'PCHNIJ → HZ',
    key:     'W',
    cost:    ACTION_COSTS.nudgeToHz,
    color:   '#88ffcc',
    desc:    'Przesuń ku strefie życia',
  },
  {
    id:      'bombard',
    label:   'BOMBARDUJ',
    key:     'E',
    cost:    ACTION_COSTS.bombard,
    color:   '#ffaa44',
    desc:    'Rój asteroid (+masa)',
  },
];

const PANEL_W    = 220;
const BTN_H      = 36;
const BTN_GAP    = 6;
const PADDING    = 10;
const PANEL_H    = PADDING + 16 + ACTIONS.length * (BTN_H + BTN_GAP) + PADDING;

export class ActionPanel {
  constructor(scene) {
    this.scene     = scene;
    this.hasTarget = false;          // czy jest zaznaczona planeta
    this.buttons   = [];             // obiekty przycisków do aktualizacji stanu

    const W = scene.cameras.main.width;
    const H = scene.cameras.main.height;

    // Panel zakotwiczony prawym dolnym rogiem, nad paskiem czasu
    this.panelX = W - PANEL_W - 12;
    this.panelY = H - PANEL_H - 56;   // 56px nad paskiem TimeControls

    this._buildPanel();
    this._subscribeEvents();
  }

  // ── Budowa UI ─────────────────────────────────────────────────
  _buildPanel() {
    const { panelX, panelY } = this;
    const scene = this.scene;

    // Tło panelu
    scene.add.rectangle(
      panelX + PANEL_W / 2,
      panelY + PANEL_H / 2,
      PANEL_W, PANEL_H,
      0x060d18, 0.88
    ).setDepth(19).setScrollFactor(0);

    // Nagłówek
    scene.add.text(panelX + PADDING, panelY + 7, 'AKCJE GRACZA', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#2a4060',
    }).setDepth(20).setScrollFactor(0);

    // Klawiszowe skróty (informacja)
    scene.add.text(panelX + PANEL_W - PADDING, panelY + 7, 'Q  W  E', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#1a2a3a',
    }).setOrigin(1, 0).setDepth(20).setScrollFactor(0);

    // ── Przyciski akcji ──────────────────────────────────────────
    const btnsStartY = panelY + PADDING + 16;

    ACTIONS.forEach((action, i) => {
      const btnY = btnsStartY + i * (BTN_H + BTN_GAP);
      this._buildButton(action, panelX + PADDING, btnY, PANEL_W - PADDING * 2);
    });

    // Komunikat feedbacku (pojawia się po akcji)
    this._feedbackText = scene.add.text(
      panelX + PANEL_W / 2,
      panelY + PANEL_H + 6,
      '',
      { fontSize: '10px', fontFamily: 'monospace', color: '#88ffcc' }
    ).setOrigin(0.5, 0).setDepth(20).setScrollFactor(0);

  }

  _buildButton(action, x, y, w) {
    const scene = this.scene;

    // Tło przycisku
    const bg = scene.add.graphics().setDepth(20).setScrollFactor(0);

    // Etykieta
    const lbl = scene.add.text(x + 8, y + 7, action.label, {
      fontSize:   '11px',
      fontFamily: 'monospace',
      color:      action.color,
    }).setDepth(22).setScrollFactor(0);

    // Opis
    const desc = scene.add.text(x + 8, y + 20, action.desc, {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#3a5070',
    }).setDepth(22).setScrollFactor(0);

    // Klawisz skrótu (prawa strona)
    const costLbl = scene.add.text(x + w - 4, y + 8, `[${action.key}]`, {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#3a5070',
    }).setOrigin(1, 0).setDepth(22).setScrollFactor(0);

    // Obszar klikalny (niewidoczny prostokąt)
    const hitArea = scene.add.rectangle(x + w / 2, y + BTN_H / 2, w, BTN_H, 0x000000, 0)
      .setDepth(23).setScrollFactor(0).setInteractive();

    hitArea.on('pointerdown', () => {
      EventBus.emit(`action:${action.id}`);
    });

    hitArea.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x0d2030, 1);
      bg.fillRect(x, y, w, BTN_H);
      bg.lineStyle(1, 0x2a4060, 1);
      bg.strokeRect(x, y, w, BTN_H);
    });

    hitArea.on('pointerout', () => {
      this._drawButtonBg(bg, x, y, w, action, 0, this.hasTarget);
    });

    // Zachowaj referencje do aktualizacji stanu
    this.buttons.push({ action, bg, lbl, costLbl, hitArea, x, y, w });

    // Narysuj styl początkowy
    this._drawButtonBg(bg, x, y, w, action, 0, false);
  }

  _drawButtonBg(bg, x, y, w, action, _energy, hasTarget) {
    bg.clear();
    // Aktywny gdy zaznaczona planeta (energia wyłączona)
    const enabled = hasTarget;
    bg.fillStyle(enabled ? 0x0a1828 : 0x060e14, 1);
    bg.fillRect(x, y, w, BTN_H);
    bg.lineStyle(1, enabled ? 0x1a3a5a : 0x101820, 1);
    bg.strokeRect(x, y, w, BTN_H);
  }

  _refreshButtons() {
    this.buttons.forEach(({ action, bg, lbl, costLbl, x, y, w }) => {
      const enabled = this.hasTarget;  // energia wyłączona — tylko planeta musi być zaznaczona
      this._drawButtonBg(bg, x, y, w, action, 0, this.hasTarget);

      lbl.setStyle({ color: enabled ? action.color : '#2a3a4a' });
      costLbl.setStyle({ color: enabled ? '#4a6a8a' : '#1a2a3a' });
    });
  }

  // ── Subskrypcje ───────────────────────────────────────────────
  _subscribeEvents() {
    EventBus.on('player:energyChanged', ({ hasTarget }) => {
      this.hasTarget = hasTarget;
      this._refreshButtons();
    });

    EventBus.on('player:actionResult', ({ success, action, planet, reason, detail }) => {
      let text, color;
      if (success) {
        const actionLabels = { stabilize: 'Stabilizacja', nudgeToHz: 'Pchnięcie', bombard: 'Bombardowanie' };
        const extra = detail ? ` (${detail})` : '';
        text  = `✓ ${actionLabels[action] ?? action}: ${planet}${extra}`;
        color = '#88ffcc';
      } else {
        text  = `✗ ${reason}`;
        color = '#ff6644';
      }

      this._feedbackText.setText(text).setStyle({ color }).setAlpha(1);

      // Zanikanie komunikatu po 2 sekundach
      this.scene.tweens.add({
        targets:  this._feedbackText,
        alpha:    { from: 1, to: 0 },
        delay:    1400,
        duration: 600,
        ease:     'Power1',
      });
    });
  }
}
