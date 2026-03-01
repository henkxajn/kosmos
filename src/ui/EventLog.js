// EventLog — dziennik zdarzeń układu słonecznego
// Zbiera zdarzenia przez EventBus i wyświetla je jako przewijana lista w UI
// Komunikacja: nasłuchuje 'body:collision', 'planet:ejected', 'accretion:newPlanet',
//              'time:yearChanged'
// Nie emituje żadnych zdarzeń — tylko wyświetla

import EventBus from '../core/EventBus.js';

// Maksymalna liczba wpisów w dzienniku
const MAX_ENTRIES = 12;

// Kolory typów zdarzeń
const COLORS = {
  collision_absorb:   '#ffcc44',   // żółty — wchłonięcie
  collision_destroy:  '#ff6644',   // czerwony — destrukcja
  collision_redirect: '#ff9933',   // pomarańczowy — zmiana orbity
  ejection:           '#cc88ff',   // fioletowy — ejekcja
  new_planet:         '#88ffcc',   // miętowy — nowa planeta
  life_good:          '#44ff88',   // zielony — pojawienie/ewolucja życia
  life_bad:           '#ff4488',   // różowy — wymieranie życia
  info:               '#6888aa',   // szary — neutralne
  auto_slow:          '#ffaa44',   // pomarańczowy — auto-slow triggered
  disk_phase:         '#88aaff',   // niebieski — zmiana fazy dysku
  civ_epoch:          '#ffcc88',   // złoty — zmiana epoki cywilizacji
  civ_unrest:         '#ff4444',   // czerwony — niepokoje społeczne
  civ_famine:         '#ff8800',   // pomarańczowy — głód
  expedition_ok:      '#44ffaa',   // miętowy — udana ekspedycja
  expedition_fail:    '#ff6644',   // czerwony — katastrofa ekspedycji
};

// Typy małych ciał — absorbcja jest zbyt częsta, żeby logować każdą
const SMALL_BODY_TYPES = new Set(['asteroid', 'comet', 'planetesimal']);

export class EventLog {
  constructor(scene, x, y) {
    this.scene    = scene;
    this.x        = x;
    this.y        = y;
    this.entries  = [];           // tablica { year, text, color }
    this.currentYear = 0;

    this._buildUI();
    this._subscribeEvents();
  }

  // ── Budowa UI ─────────────────────────────────────────────────
  _buildUI() {
    const W_PANEL = 220;
    const H_PANEL = MAX_ENTRIES * 14 + 30;

    // Tło panelu
    this.bg = this.scene.add.rectangle(
      this.x + W_PANEL / 2,
      this.y + H_PANEL / 2,
      W_PANEL, H_PANEL,
      0x060d18, 0.80
    ).setDepth(15).setScrollFactor(0);

    // Nagłówek
    this.header = this.scene.add.text(this.x + 8, this.y + 6, 'DZIENNIK ZDARZEŃ', {
      fontSize:   '9px',
      fontFamily: 'monospace',
      color:      '#2a6080',
    }).setDepth(16).setScrollFactor(0);

    // Linia oddzielająca
    this.line = this.scene.add.graphics().setDepth(16).setScrollFactor(0);
    this.line.lineStyle(1, 0x1a3050, 1);
    this.line.lineBetween(this.x + 4, this.y + 18, this.x + W_PANEL - 4, this.y + 18);

    // Tablica textów wierszy (pre-allokowane)
    this.rowTexts = [];
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const t = this.scene.add.text(this.x + 8, this.y + 22 + i * 14, '', {
        fontSize:   '9px',
        fontFamily: 'monospace',
        color:      '#6888aa',
        wordWrap:   { width: 205 },
      }).setDepth(16).setScrollFactor(0);
      this.rowTexts.push(t);
    }
  }

  // ── Subskrypcje zdarzeń ───────────────────────────────────────
  _subscribeEvents() {
    // Śledź aktualny rok gry (time:display emitowany przez TimeSystem)
    EventBus.on('time:display', ({ gameTime }) => {
      this.currentYear = Math.floor(gameTime);
    });

    EventBus.on('body:collision', ({ winner, loser, type }) => {
      if (type === 'absorb') {
        // Pomiń mikrouderzenia asteroid i komet — zbyt częste
        if (SMALL_BODY_TYPES.has(loser?.type)) return;
        const big   = winner?.name ?? '?';
        const small = loser?.name  ?? '?';
        this._add(`${big} pochłonął ${small}`, 'collision_absorb');
      } else if (type === 'redirect') {
        const a = winner?.name ?? '?';
        const b = loser?.name  ?? '?';
        this._add(`Zderzenie: ${a} ↔ ${b} zmieniły orbity`, 'collision_redirect');
      }
      // type='eject' → obsługuje planet:ejected poniżej
    });

    EventBus.on('planet:ejected', ({ planet }) => {
      this._add(`${planet?.name ?? 'Planeta'} wyrzucona z układu`, 'ejection');
    });

    EventBus.on('accretion:newPlanet', ({ a }) => {
      this._add(`Nowa planeta w odl. ${a.toFixed(2)} AU`, 'new_planet');
    });

    // ── Zdarzenia życia ──────────────────────────────────────────
    EventBus.on('life:emerged', ({ planet }) => {
      this._add(`Pierwsze życie na ${planet.name}!`, 'life_good');
    });

    EventBus.on('life:evolved', ({ planet, stage }) => {
      this._add(`${planet.name}: ${stage.label}`, 'life_good');
    });

    EventBus.on('life:extinct', ({ planet, reason }) => {
      // Pomiń non-planet encje (asteroidy, komety) — nie mają prawdziwego życia
      if (!planet || planet.type !== 'planet') return;
      this._add(`Życie wymarło: ${planet.name} (${reason})`, 'life_bad');
    });

    // Auto-slow — informuj gracza o zwolnieniu czasu
    EventBus.on('time:autoSlowed', ({ reason }) => {
      this._add(`⏪ ${reason}`, 'auto_slow');
    });

    // Zmiana fazy dysku protoplanetarnego
    EventBus.on('disk:phaseChanged', ({ newPhasePL }) => {
      this._add(`Faza dysku: ${newPhasePL}`, 'disk_phase');
    });

    // ── Zdarzenia cywilizacyjne ───────────────────────────────────
    EventBus.on('civ:epochChanged', ({ epoch }) => {
      this._add(`⭐ Epoka: ${epoch.namePL}`, 'civ_epoch');
    });

    EventBus.on('civ:unrest', ({ reason }) => {
      this._add(`⚠ NIEPOKOJE: ${reason}`, 'civ_unrest');
    });

    EventBus.on('civ:unrestLifted', () => {
      this._add('✓ Niepokoje ustały', 'civ_unrest');
    });

    EventBus.on('civ:famine', () => {
      this._add('💀 GŁÓD — brak żywności!', 'civ_famine');
    });

    // ── Zdarzenia ekspedycji ──────────────────────────────────────
    EventBus.on('expedition:launched', ({ expedition }) => {
      const icon = expedition.type === 'scientific' ? '🔬' : '⛏';
      this._add(`${icon} Ekspedycja → ${expedition.targetName} (${expedition.travelTime}l)`, 'expedition_ok');
    });

    EventBus.on('expedition:arrived', ({ expedition, gained, multiplier }) => {
      const icon    = expedition.type === 'scientific' ? '🔬' : '⛏';
      const bonusStr = multiplier >= 1.5 ? ' ★ bonus!' : multiplier <= 0.5 ? ' (częściowy)' : '';
      const gainStr  = Object.entries(gained).filter(([,v]) => v > 0)
        .map(([k, v]) => `${v}${k === 'minerals' ? '⛏' : k === 'energy' ? '⚡' : k === 'organics' ? '🌿' : k === 'water' ? '💧' : k === 'research' ? '🔬' : k}`)
        .join(' ');
      this._add(`${icon} Ekspedycja z ${expedition.targetName}: ${gainStr}${bonusStr}`, 'expedition_ok');
    });

    EventBus.on('expedition:disaster', ({ expedition }) => {
      this._add(`💥 KATASTROFA! Ekspedycja do ${expedition.targetName} — utrata załogi`, 'expedition_fail');
    });

    EventBus.on('expedition:returned', ({ expedition }) => {
      this._add(`↩ Ekspedycja powróciła z ${expedition.targetName}`, 'info');
    });
  }

  // ── Dodaj wpis ────────────────────────────────────────────────
  _add(text, type = 'info') {
    const yearLabel = this.currentYear > 0
      ? `[${this._formatYear(this.currentYear)}] `
      : '';

    this.entries.unshift({       // najnowsze na górze
      text:  yearLabel + text,
      color: COLORS[type] ?? COLORS.info,
    });

    // Ogranicz długość dziennika
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }

    this._redraw();
  }

  // ── Formatuj rok (skrócone) ───────────────────────────────────
  _formatYear(y) {
    if (y < 1000)    return `${y}r`;
    if (y < 1e6)     return `${(y / 1000).toFixed(1)}tys r`;
    if (y < 1e9)     return `${(y / 1e6).toFixed(1)}M r`;
    return `${(y / 1e9).toFixed(2)}G r`;
  }

  // ── Przerysuj listę ───────────────────────────────────────────
  _redraw() {
    for (let i = 0; i < MAX_ENTRIES; i++) {
      const entry = this.entries[i];
      const t     = this.rowTexts[i];

      if (entry) {
        // Starsze wpisy bledną (alpha maleje z indeksem)
        const alpha = Math.max(0.35, 1 - i * 0.07);
        t.setText(entry.text);
        t.setStyle({ color: entry.color });
        t.setAlpha(alpha);
      } else {
        t.setText('');
      }
    }
  }

  // ── Publiczna metoda: dodaj ręcznie wpis ─────────────────────
  addInfo(text) {
    this._add(text, 'info');
  }
}
