// EndgameScene — finałowa scena wyboru zakończenia (Faza D4)
//
// Pojawia się gdy gracz ukończy segment 20 Sfery Dysona ORAZ zbada
// jump_gate_construction. HTML overlay z gwiazdami, narracją typewriter
// i 3 kartami zakończeń (Powrót / Zostajemy / Wiadomość).
//
// Domyślne zakończenie wg suwaka frakcji:
//   slider > 70 → 'stay'    (Konfederaci dominują)
//   slider < 30 → 'return'  (Poszukiwacze dominują)
//   30-70       → null      (równowaga — bez sugestii)

import EventBus from '../core/EventBus.js';
import { getLocale } from '../i18n/i18n.js';

const PL = () => getLocale() !== 'en';

export class EndgameScene {
  constructor() {
    this._container = null;
    this._data      = null;
    this._typewriterTimer = null;
  }

  show(data) {
    // data: { slider, leaderName, gameYear, coloniesCount }
    this._data = data;
    this._build();
    document.body.appendChild(this._container);
    requestAnimationFrame(() => {
      if (this._container) this._container.style.opacity = '1';
    });
    this._startTypewriter();
  }

  destroy() {
    if (this._typewriterTimer) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
    this._container?.remove();
    this._container = null;
  }

  // ── Budowa DOM ─────────────────────────────────────────────────────────

  _build() {
    const d    = this._data;
    const isPL = PL();

    // Domyślne zakończenie na podstawie suwaka frakcji
    const defaultEnding =
      d.slider > 70 ? 'stay' :
      d.slider < 30 ? 'return' : null;

    this._container = document.createElement('div');
    Object.assign(this._container.style, {
      position:       'fixed',
      inset:          '0',
      zIndex:         '9999',
      background:     '#020104',
      opacity:        '0',
      transition:     'opacity 2s ease',
      fontFamily:     "'Space Mono', 'Share Tech Mono', monospace",
      color:          '#00ffb4',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      overflow:       'hidden',
    });

    const colonyLabel = isPL
      ? `Rok ${d.gameYear} od Lądowania · ${d.coloniesCount} koloni${d.coloniesCount === 1 ? 'a' : 'i'}`
      : `Year ${d.gameYear} Since Landing · ${d.coloniesCount} colon${d.coloniesCount === 1 ? 'y' : 'ies'}`;

    this._container.innerHTML = `
      <div class="eg-stars"></div>
      <div class="eg-nebula"></div>

      <div class="eg-center">
        <div class="eg-chronicle">
          ${isPL ? 'KRONIKA MISJI' : 'MISSION CHRONICLE'}
        </div>
        <div class="eg-year">${colonyLabel}</div>

        <div class="eg-separator"></div>

        <div class="eg-narrative" id="eg-narrative"></div>

        <div class="eg-choices" id="eg-choices" style="opacity:0">
          ${this._buildChoices(defaultEnding, isPL)}
        </div>
      </div>

      <style>
        .eg-stars {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at 50% 50%, #0a0510 0%, #020104 70%);
          pointer-events: none;
        }
        .eg-nebula {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse at 30% 40%, rgba(100,0,150,0.08) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 60%, rgba(0,100,150,0.06) 0%, transparent 50%);
          pointer-events: none;
        }
        .eg-center {
          position: relative; z-index: 1;
          text-align: center;
          max-width: 900px;
          padding: 40px;
        }
        .eg-chronicle {
          font-size: 11px; letter-spacing: 4px;
          color: rgba(0,255,180,0.5);
          margin-bottom: 8px;
        }
        .eg-year {
          font-size: 12px; letter-spacing: 2px;
          color: rgba(0,255,180,0.3);
          margin-bottom: 32px;
        }
        .eg-separator {
          width: 200px; height: 1px;
          background: rgba(0,255,180,0.2);
          margin: 0 auto 32px;
        }
        .eg-narrative {
          font-size: 14px; line-height: 1.9;
          color: rgba(255,255,255,0.75);
          min-height: 140px;
          margin: 0 auto 48px;
          font-style: italic;
          max-width: 700px;
        }
        .eg-choices {
          display: flex; gap: 24px;
          justify-content: center;
          flex-wrap: wrap;
          transition: opacity 1s ease;
        }
        .eg-card {
          width: 240px;
          border: 1px solid rgba(0,255,180,0.15);
          padding: 28px 20px;
          cursor: pointer;
          transition: all 0.3s ease;
          text-align: center;
          background: rgba(0,255,180,0.02);
          position: relative;
        }
        .eg-card:hover {
          border-color: rgba(0,255,180,0.5);
          background: rgba(0,255,180,0.06);
          transform: translateY(-4px);
        }
        .eg-card.eg-default {
          border-color: rgba(0,255,180,0.4);
          background: rgba(0,255,180,0.05);
          transform: scale(1.04);
        }
        .eg-card-icon {
          font-size: 32px; margin-bottom: 16px;
        }
        .eg-card-title {
          font-size: 11px; letter-spacing: 3px;
          text-transform: uppercase;
          color: #00ffb4;
          margin-bottom: 12px;
        }
        .eg-card-desc {
          font-size: 10px; line-height: 1.6;
          color: rgba(255,255,255,0.45);
          margin-bottom: 20px;
        }
        .eg-card-hint {
          font-size: 9px; letter-spacing: 1px;
          color: rgba(0,255,180,0.4);
          font-style: italic;
          margin-bottom: 16px;
        }
        .eg-card-btn {
          border: 1px solid rgba(0,255,180,0.4);
          padding: 8px 20px;
          font-family: inherit;
          font-size: 10px;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: #00ffb4;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        .eg-card-btn:hover {
          background: rgba(0,255,180,0.1);
        }
      </style>
    `;

    this._addStars();
  }

  _buildChoices(defaultEnding, isPL) {
    const cards = [
      {
        id: 'return',
        icon: '◎',
        titlePL: 'Powrót do Domu',
        titleEN: 'Return Home',
        descPL:  'Aktywuj Bramę Skoku. Flota wraca do Układu Słonecznego po 3000 latach milczenia.',
        descEN:  'Activate the Jump Gate. The fleet returns to the Solar System after 3,000 years of silence.',
        hintPL:  'Poszukiwacze Drogi czekali na ten moment',
        hintEN:  'The Seekers of the Way waited for this moment',
      },
      {
        id: 'stay',
        icon: '⬡',
        titlePL: 'Jesteśmy w Domu',
        titleEN: 'We Are Home',
        descPL:  'Energia Sfery zasila ekspansję. Budujesz Projekt Labirynt — sieć bram przez cały układ.',
        descEN:  'The Sphere\'s energy powers expansion. You build Project Labyrinth — a gate network across the system.',
        hintPL:  'Konfederaci Misji wiedzieli od początku',
        hintEN:  'The Confederation of the Mission knew from the start',
      },
      {
        id: 'message',
        icon: '⌁',
        titlePL: 'Wysyłamy Wiadomość',
        titleEN: 'We Send a Message',
        descPL:  'Budujesz nadajnik galaktyczny. Sygnał dotrze za 47 280 lat. Nie doczekasz odpowiedzi.',
        descEN:  'You build a galactic transmitter. The signal arrives in 47,280 years. You will not live to see the reply.',
        hintPL:  null,
        hintEN:  null,
      },
    ];

    return cards.map(card => {
      const isDefault = card.id === defaultEnding;
      const title  = isPL ? card.titlePL : card.titleEN;
      const desc   = isPL ? card.descPL  : card.descEN;
      const hint   = isPL ? card.hintPL  : card.hintEN;
      const btn    = isPL ? 'Wybierz'    : 'Choose';
      // Pokazuj hint TYLKO dla domyślnej karty (zgodne z intencją "subtelna sugestia frakcji")
      const showHint = isDefault && hint;

      return `
        <div class="eg-card ${isDefault ? 'eg-default' : ''}" data-ending="${card.id}">
          <div class="eg-card-icon">${card.icon}</div>
          <div class="eg-card-title">${title}</div>
          <div class="eg-card-desc">${desc}</div>
          ${showHint ? `<div class="eg-card-hint">${hint}</div>` : ''}
          <button class="eg-card-btn">${btn}</button>
        </div>
      `;
    }).join('');
  }

  _startTypewriter() {
    const isPL = PL();
    const d    = this._data;

    const text = isPL
      ? `Sfera Dysona jest ukończona. Brama Skoku aktywna.\n\n47 280 lat świetlnych od Ziemi — i po raz pierwszy w historii kolonii, ta odległość przestała być wyrokiem.\n\n${d.leaderName} stoi przed decyzją którą podjąć można tylko raz.`
      : `The Dyson Sphere is complete. The Jump Gate is active.\n\n47,280 light years from Earth — and for the first time in the colony's history, that distance is no longer a sentence.\n\n${d.leaderName} faces a decision that can only be made once.`;

    const el = this._container?.querySelector('#eg-narrative');
    if (!el) return;

    let i = 0;
    this._typewriterTimer = setInterval(() => {
      if (!this._container) {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
        return;
      }
      if (i >= text.length) {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
        // Pokaż karty po zakończeniu typewritera
        setTimeout(() => {
          if (!this._container) return;
          const choices = this._container.querySelector('#eg-choices');
          if (choices) choices.style.opacity = '1';
          this._bindChoices();
        }, 800);
        return;
      }
      // Obsługa \n jako <br>
      if (text[i] === '\n') {
        el.innerHTML += '<br>';
      } else {
        el.innerHTML += text[i];
      }
      i++;
    }, 30);  // ~30 ms/znak
  }

  _bindChoices() {
    const cards = this._container?.querySelectorAll('.eg-card');
    if (!cards) return;
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const ending = card.dataset.ending;
        this._selectEnding(ending);
      });
    });
  }

  _selectEnding(endingId) {
    if (!this._container) return;
    // Fade out
    this._container.style.opacity = '0';
    setTimeout(() => {
      this.destroy();
      EventBus.emit('endgame:chosen', {
        ending:   endingId,
        gameYear: this._data?.gameYear,
        slider:   this._data?.slider,
      });
    }, 2000);
  }

  _addStars() {
    const container = this._container?.querySelector('.eg-stars');
    if (!container) return;
    for (let i = 0; i < 150; i++) {
      const s = document.createElement('div');
      const size = Math.random() * 2 + 0.5;
      Object.assign(s.style, {
        position:     'absolute',
        width:        size + 'px',
        height:       size + 'px',
        borderRadius: '50%',
        background:   '#fff',
        opacity:      (Math.random() * 0.6 + 0.1).toString(),
        left:         (Math.random() * 100) + '%',
        top:          (Math.random() * 100) + '%',
      });
      container.appendChild(s);
    }
  }
}
