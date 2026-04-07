// AutoPauseSystem — auto-pauza przy ważnych zdarzeniach gry (jak Stellaris)
//
// Zasada: gdy zachodzi ważne wydarzenie (event narracyjny, odkrycie,
// statek dotarł do celu, kryzys frakcji, ...) — gra się sama pauzuje,
// aby gracz mógł zareagować bez ręcznego zatrzymywania.
//
// Każda kategoria ma osobny toggle (włączona/wyłączona). Domyślnie
// wszystkie są włączone (z wyjątkiem 'newPop' — za częste).
//
// Komunikacja:
//   Nasłuchuje:
//     'narrative:eventTriggered'    → pauza (event narracyjny)
//     'expedition:colonyFounded'    → pauza (założenie kolonii)
//     'discovery:found'             → pauza (odkrycie ciała/anomalii)
//     'expedition:reconComplete'    → pauza (zakończony recon)
//     'expedition:missionReport'    → pauza (raport z misji)
//     'planet:constructionComplete' → pauza (jeśli tier ≥ 3)
//     'faction:crisis'              → pauza (kryzys frakcji)
//     'civ:popBorn'                 → pauza (nowy POP, domyślnie OFF)
//     'dyson:segmentCompleted'      → pauza (segment Sfery)
//     'leader:consulElectionNeeded' → pauza (wybory Konsula)
//   Emituje:
//     'time:pause'                  → TimeSystem
//     'ui:autoPauseNotification'    { reason } → UI toast

import EventBus from '../core/EventBus.js';
import { BUILDINGS } from '../data/BuildingsData.js';
import { TECHS }     from '../data/TechData.js';

// Domyślne ustawienia per kategoria
const DEFAULT_SETTINGS = {
  onNarrativeEvent:   true,  // eventy narracyjne frakcji
  onDiscovery:        true,  // odkrycia anomalii, ekspedycji
  onBuildingComplete: true,  // ukończenie budynku T3+
  onShipArrived:      true,  // statek dotarł do celu
  onCrisis:           true,  // kryzys frakcji, separacja
  onNewPop:           false, // nowy POP (domyślnie OFF — za częste)
  onSegmentComplete:  true,  // segment Sfery Dysona ukończony
  onConsulElection:   true,  // wybory Konsula
};

// Mapa: reason → klucz w settings
const REASON_TO_SETTING = {
  narrativeEvent:   'onNarrativeEvent',
  discovery:        'onDiscovery',
  buildingComplete: 'onBuildingComplete',
  shipArrived:      'onShipArrived',
  crisis:           'onCrisis',
  newPop:           'onNewPop',
  segmentComplete:  'onSegmentComplete',
  consulElection:   'onConsulElection',
};

// Klucz w localStorage dla ustawień (poza save'em — preferencja gracza)
const STORAGE_KEY = 'kosmos_autopause_settings';

export class AutoPauseSystem {
  constructor() {
    this._settings = { ...DEFAULT_SETTINGS };
    this._enabled  = true;  // master switch
    this._lastPauseReason = null;

    // Wczytaj ustawienia z localStorage (preferencja przeglądarki)
    this._loadFromStorage();

    this._setupListeners();
  }

  // ── Subskrypcje EventBus ──────────────────────────────────────

  _setupListeners() {
    // Eventy narracyjne (frakcje, fabuła)
    EventBus.on('narrative:eventTriggered', () => {
      this._pause('narrativeEvent');
    });

    // Odkrycia: założenie kolonii, znalezione ciało/anomalia
    EventBus.on('expedition:colonyFounded', () => {
      this._pause('discovery');
    });
    EventBus.on('discovery:found', () => {
      this._pause('discovery');
    });

    // Budynek ukończony — pauza tylko dla T3+
    EventBus.on('planet:constructionComplete', ({ buildingId, isUpgrade }) => {
      // Upgrade nie powinien pauzować — to rozbudowa istniejącego budynku
      if (isUpgrade) return;
      const tier = this._resolveBuildingTier(buildingId);
      if (tier >= 3) {
        this._pause('buildingComplete');
      }
    });

    // Statek dotarł do celu / zakończył misję
    EventBus.on('expedition:missionReport', () => {
      this._pause('shipArrived');
    });
    EventBus.on('expedition:reconComplete', () => {
      this._pause('shipArrived');
    });

    // Kryzys frakcji
    EventBus.on('faction:crisis', () => {
      this._pause('crisis');
    });

    // Nowy POP (domyślnie OFF — za częste)
    EventBus.on('civ:popBorn', () => {
      this._pause('newPop');
    });

    // Segment Sfery Dysona ukończony
    EventBus.on('dyson:segmentCompleted', () => {
      this._pause('segmentComplete');
    });

    // Wybory Konsula
    EventBus.on('leader:consulElectionNeeded', () => {
      this._pause('consulElection');
    });
  }

  // ── Logika pauzy ──────────────────────────────────────────────

  _pause(reason) {
    if (!this._enabled) return;

    // Sprawdź czy ta kategoria jest włączona
    const settingKey = REASON_TO_SETTING[reason];
    if (settingKey && !this._settings[settingKey]) return;

    // Nie pauzuj jeśli już spauzowane (uniknij dubla)
    const timeSystem = window.KOSMOS?.timeSystem;
    if (timeSystem?.isPaused) return;

    this._lastPauseReason = reason;
    EventBus.emit('time:pause');

    // Pokaż krótki toast informujący dlaczego spauzowano
    EventBus.emit('ui:autoPauseNotification', { reason });
  }

  // Wylicz tier budynku na podstawie wymaganej technologii.
  // Brak `requires` → tier 1. Wymagana tech → tier z TECHS[id].tier.
  _resolveBuildingTier(buildingId) {
    const bldDef = BUILDINGS[buildingId];
    if (!bldDef) return 1;
    if (bldDef.tier) return bldDef.tier;
    const reqId = bldDef.requires;
    if (!reqId) return 1;
    const tech = TECHS[reqId];
    return tech?.tier ?? 1;
  }

  // ── Public API ────────────────────────────────────────────────

  setSetting(key, value) {
    if (key in this._settings) {
      this._settings[key] = !!value;
      this._saveToStorage();
      EventBus.emit('autoPause:settingChanged', { key, value: !!value });
    }
  }

  setEnabled(value) {
    this._enabled = !!value;
    this._saveToStorage();
  }

  isEnabled() { return this._enabled; }

  getSettings() { return { ...this._settings }; }

  setAllSettings(value) {
    const v = !!value;
    for (const key of Object.keys(this._settings)) {
      this._settings[key] = v;
    }
    this._saveToStorage();
    EventBus.emit('autoPause:settingChanged', { key: '*', value: v });
  }

  // ── Persistence (localStorage — preferencja przeglądarki) ─────

  _saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        enabled:  this._enabled,
        settings: this._settings,
      }));
    } catch (e) { /* cicho */ }
  }

  _loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data?.enabled === 'boolean') this._enabled = data.enabled;
      if (data?.settings && typeof data.settings === 'object') {
        this._settings = { ...DEFAULT_SETTINGS, ...data.settings };
      }
    } catch (e) { /* cicho */ }
  }

  // ── Save/restore (stan w save'ie — synchronizacja z lokalną) ─

  serialize() {
    return {
      enabled:  this._enabled,
      settings: { ...this._settings },
    };
  }

  restore(data) {
    if (!data) return;
    if (typeof data.enabled === 'boolean') this._enabled = data.enabled;
    if (data.settings && typeof data.settings === 'object') {
      this._settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }
    this._saveToStorage();
  }
}
