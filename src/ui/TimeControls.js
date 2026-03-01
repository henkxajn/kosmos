// Panel kontroli czasu gry
// Przyciski: PAUZA | 1d/s | 1m/s | 1r/s | 10r/s | 10kr/s
// Wyświetlacz: aktualny czas gry w czytelnej postaci

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';

export class TimeControls {
  constructor(scene) {
    this.scene                  = scene;
    this.isPaused               = false;
    this.currentMultiplierIndex = 1;  // domyślnie 1d/s

    this.buttons = [];
    this.createUI();
    this.setupEvents();
  }

  createUI() {
    const { scene } = this;
    const W = scene.cameras.main.width;
    const H = scene.cameras.main.height;

    const centerX = W / 2;
    const y       = H - 28;

    const styleNormal = {
      fontSize:        '13px',
      fontFamily:      'monospace',
      color:           '#6888aa',
      backgroundColor: '#0d1520',
      padding:         { x: 6, y: 5 },   // zmniejszone padding — 6 przycisków musi się zmieścić
    };

    // Przycisk PAUZA/GRAJ — przesunięty bardziej w lewo
    this.btnPause = scene.add.text(centerX - 210, y, '⏸ PAUZA', styleNormal)
      .setInteractive()
      .setOrigin(0.5)
      .on('pointerdown', () => {
        this.isPaused ? EventBus.emit('time:play') : EventBus.emit('time:pause');
      })
      .on('pointerover', () => this.btnPause.setStyle({ color: '#88ffcc' }))
      .on('pointerout',  () => this.updateStyles());

    // Przyciski prędkości — 5 przycisków symetrycznie względem centrum
    // Indeksy 1-5 w TIME_MULTIPLIERS: 1d/s | 1m/s | 1r/s | 10r/s | 10kr/s
    const labels = GAME_CONFIG.TIME_MULTIPLIER_LABELS.slice(1);
    labels.forEach((label, i) => {
      // 5 przycisków: środkowy (i=2) na centerX, spacing 62px
      const x   = centerX - 124 + i * 62;
      const btn = scene.add.text(x, y, label, styleNormal)
        .setInteractive()
        .setOrigin(0.5)
        .on('pointerdown', () => {
          EventBus.emit('time:setMultiplier', { index: i + 1 }); // i+1 bo pomijamy indeks 0
          EventBus.emit('time:play');
        })
        .on('pointerover', () => btn.setStyle({ color: '#88ffcc' }))
        .on('pointerout',  () => this.updateStyles());

      this.buttons.push(btn);
    });

    // Wyświetlacz czasu gry (prawo od przycisków)
    this.timeDisplay = scene.add.text(centerX + 210, y, 'Rok 0, dzień 0', {
      fontSize:   '12px',
      fontFamily: 'monospace',
      color:      '#c8e8ff',
    }).setOrigin(0.5);

    // Separatory
    scene.add.text(centerX - 162, y, '|', { fontSize: '13px', fontFamily: 'monospace', color: '#2a4060' }).setOrigin(0.5);
    scene.add.text(centerX + 162, y, '|', { fontSize: '13px', fontFamily: 'monospace', color: '#2a4060' }).setOrigin(0.5);
  }

  setupEvents() {
    // Reaguj na zmiany stanu (TimeSystem przekazuje multiplierIndex, nie float)
    EventBus.on('time:stateChanged', ({ isPaused, multiplierIndex }) => {
      this.isPaused               = isPaused;
      this.currentMultiplierIndex = multiplierIndex;
      this.updateStyles();
    });

    // Aktualizuj wyświetlacz czasu co klatkę
    EventBus.on('time:display', ({ displayText, multiplierIndex }) => {
      this.currentMultiplierIndex = multiplierIndex;
      this.timeDisplay.setText(displayText);
    });
  }

  // Odśwież kolory przycisków na podstawie aktualnego stanu
  updateStyles() {
    this.btnPause.setText(this.isPaused ? '▶ GRAJ' : '⏸ PAUZA');
    this.btnPause.setStyle({ color: this.isPaused ? '#88ffcc' : '#6888aa' });

    this.buttons.forEach((btn, i) => {
      const isActive = !this.isPaused && this.currentMultiplierIndex === i + 1;
      btn.setStyle({ color: isActive ? '#88ffcc' : '#6888aa' });
    });
  }
}
