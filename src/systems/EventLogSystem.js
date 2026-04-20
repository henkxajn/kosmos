// EventLogSystem — zunifikowany dziennik zdarzeń gry (Opcja B)
//
// Jeden strumień wpisów dla całego UI. Każdy wpis ma:
//   - id         (unikalny, rosnący)
//   - year       (rok gry — z TimeSystem)
//   - createdAt  (Date.now() — używane do animacji flash nowego wpisu)
//   - text       (gotowy tekst w aktywnej lokalizacji)
//   - channel    ('fleet' | 'civ' | 'life' | 'combat' | 'trade' | 'intel' | 'system')
//   - severity   ('info' | 'warn' | 'alert')
//   - entityRef  (opt — id encji powiązanej: planeta, statek, unit)
//
// Ring buffer: MAX_RUNTIME w pamięci, MAX_PERSIST trafia do save.
// Stary API (`_log(text, type)` + `_addNotification(text)`) jest cienkim wrapperem.

import EventBus from '../core/EventBus.js';

const MAX_RUNTIME = 500;
const MAX_PERSIST = 200;

// Mapowanie starych typów (z LOG_COLORS) → { channel, severity }.
// Zachowuje kompatybilność ~40 wywołań `_log(text, type)` rozsianych po kodzie.
const TYPE_MAP = {
  // Życie kosmiczne
  collision_absorb:   { channel: 'life',   severity: 'warn'  },
  collision_destroy:  { channel: 'life',   severity: 'alert' },
  collision_redirect: { channel: 'life',   severity: 'warn'  },
  ejection:           { channel: 'life',   severity: 'warn'  },
  new_planet:         { channel: 'life',   severity: 'info'  },
  life_good:          { channel: 'life',   severity: 'info'  },
  life_bad:           { channel: 'life',   severity: 'warn'  },
  disk_phase:         { channel: 'life',   severity: 'info'  },

  // Cywilizacja
  civ_epoch:          { channel: 'civ',    severity: 'info'  },
  civ_unrest:         { channel: 'civ',    severity: 'warn'  },
  civ_famine:         { channel: 'civ',    severity: 'alert' },
  pop_born:           { channel: 'civ',    severity: 'info'  },
  pop_died:           { channel: 'civ',    severity: 'warn'  },

  // Flota i misje
  expedition_ok:      { channel: 'fleet',  severity: 'info'  },
  expedition_fail:    { channel: 'fleet',  severity: 'warn'  },
  fleet:              { channel: 'fleet',  severity: 'info'  },

  // System
  auto_slow:          { channel: 'system', severity: 'info'  },
  info:               { channel: 'system', severity: 'info'  },
};

// Definicja kanałów — ikona + kolor (używane przez BottomBar do renderowania).
// Kolory przeniesione z LOG_COLORS (UIManager) — tam zostaną tylko getery kompatybilności.
export const CHANNELS = {
  fleet:  { icon: '🚀', labelPL: 'Flota',    labelEN: 'Fleet'    },
  civ:    { icon: '👥', labelPL: 'Cywil.',   labelEN: 'Civ'      },
  life:   { icon: '🌱', labelPL: 'Życie',    labelEN: 'Life'     },
  combat: { icon: '⚔',  labelPL: 'Walka',    labelEN: 'Combat'   },
  trade:  { icon: '💱', labelPL: 'Handel',   labelEN: 'Trade'    },
  intel:  { icon: '🔭', labelPL: 'Wywiad',   labelEN: 'Intel'    },
  system: { icon: '⚙',  labelPL: 'System',   labelEN: 'System'   },
};

export const CHANNEL_IDS = Object.keys(CHANNELS);

export class EventLogSystem {
  constructor() {
    this._entries = [];   // chronologicznie rosnąco (najnowsze na końcu)
    this._nextId  = 1;
    this._currentYear = 0;

    // Kanały ukryte (filtry) — używane przez UI. Runtime state, nie-serializowane.
    this._hiddenChannels = new Set();

    // Nasłuchuj czasu gry — rok jest częścią wpisu.
    EventBus.on('time:display', ({ gameTime }) => {
      if (gameTime != null) this._currentYear = Math.floor(gameTime);
    });
  }

  /**
   * Dodaj wpis. Preferowane API dla nowego kodu.
   * @param {object} opts
   * @param {string} opts.text
   * @param {string} [opts.channel='system']
   * @param {string} [opts.severity='info']
   * @param {string|null} [opts.entityRef=null]
   */
  push({ text, channel = 'system', severity = 'info', entityRef = null }) {
    if (!text) return null;
    if (!CHANNELS[channel]) channel = 'system';
    if (!['info', 'warn', 'alert'].includes(severity)) severity = 'info';

    const entry = {
      id:        this._nextId++,
      year:      this._currentYear,
      createdAt: Date.now(),
      text,
      channel,
      severity,
      entityRef,
    };
    this._entries.push(entry);
    if (this._entries.length > MAX_RUNTIME) {
      this._entries.splice(0, this._entries.length - MAX_RUNTIME);
    }
    EventBus.emit('eventLog:push', { entry });
    return entry;
  }

  /**
   * Legacy API — mapuje stare typy (`collision_absorb` itp.) na channel+severity.
   * Nowy kod powinien używać `push()` bezpośrednio.
   */
  pushLegacy(text, type = 'info', entityRef = null) {
    const mapped = TYPE_MAP[type] || TYPE_MAP.info;
    return this.push({ text, channel: mapped.channel, severity: mapped.severity, entityRef });
  }

  /**
   * Zwróć wpisy od najnowszego (index 0 = najnowszy).
   * @param {object} [opts]
   * @param {string[]|null} [opts.channels]   — whitelist kanałów
   * @param {string[]|null} [opts.severities] — whitelist severity
   * @param {number|null} [opts.limit]
   */
  getEntries({ channels = null, severities = null, limit = null } = {}) {
    let result = this._entries;
    if (channels)   result = result.filter(e => channels.includes(e.channel));
    if (severities) result = result.filter(e => severities.includes(e.severity));
    // Najnowsze na początku
    result = [...result].reverse();
    if (limit != null) result = result.slice(0, limit);
    return result;
  }

  /**
   * Wpisy widoczne po uwzględnieniu filtra ukrytych kanałów.
   * To jest standardowe wejście dla BottomBar.
   */
  getVisible(limit = null) {
    const channels = this._hiddenChannels.size === 0
      ? null
      : CHANNEL_IDS.filter(c => !this._hiddenChannels.has(c));
    return this.getEntries({ channels, limit });
  }

  /** Liczba wpisów per kanał (do badge'y w filtrach) */
  getCountsByChannel() {
    const counts = Object.fromEntries(CHANNEL_IDS.map(c => [c, 0]));
    for (const e of this._entries) counts[e.channel] = (counts[e.channel] ?? 0) + 1;
    return counts;
  }

  /** Toggle widoczności kanału w BottomBar */
  toggleChannel(channelId) {
    if (!CHANNELS[channelId]) return;
    if (this._hiddenChannels.has(channelId)) this._hiddenChannels.delete(channelId);
    else this._hiddenChannels.add(channelId);
  }

  isChannelHidden(channelId) {
    return this._hiddenChannels.has(channelId);
  }

  /** Wyczyść cały dziennik (np. przy nowej grze) */
  clear() {
    this._entries = [];
    this._nextId = 1;
  }

  /** Najnowszy wpis (do detekcji flash w BottomBar) */
  getLatest() {
    return this._entries[this._entries.length - 1] ?? null;
  }

  // ── Save / Restore ────────────────────────────────────────────────────────

  serialize() {
    // Zapisz tylko ostatnie MAX_PERSIST — reszta ginie (ring buffer).
    return {
      entries: this._entries.slice(-MAX_PERSIST),
      nextId:  this._nextId,
    };
  }

  restore(data) {
    if (!data) return;
    this._entries = Array.isArray(data.entries) ? [...data.entries] : [];
    this._nextId = data.nextId ?? (
      this._entries.length > 0
        ? Math.max(...this._entries.map(e => e.id ?? 0)) + 1
        : 1
    );
    // Hidden channels nie persistują — zawsze start z pełną widocznością.
    this._hiddenChannels.clear();
  }
}
