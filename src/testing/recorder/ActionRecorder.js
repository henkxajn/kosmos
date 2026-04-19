// ═══════════════════════════════════════════════════════════════
// ActionRecorder — loguje akcje gracza do formatu ScriptedBot
// ─────────────────────────────────────────────────────────────
// Subskrybuje request events z EventBus i zapisuje akcje z civYear.
// Eksport: JSON zgodny ze ScriptedBot ({ name, fallback, actions: [...] }).
//
// Użycie w konsoli przeglądarki:
//   KOSMOS.recorder.start()
//   ... zagraj otwarcie ...
//   KOSMOS.recorder.stop()
//   KOSMOS.recorder.download('malk_opening.json')
// lub klawisz: Ctrl+Shift+R (toggle).
//
// Semantyczne ekspedycje:
// Zamiast surowego targetId (np. "entity_11" — id zależne od seedu), zapisujemy
// również _targetHint typu { kind, criteria } — ScriptedBot przy replay resolvuje
// hint na najbliższe pasujące ciało w BIEŻĄCYM układzie. Dzięki temu skrypt
// "skolonizuj najbliższy księżyc" działa w każdym układzie, nie tylko oryginalnym.
// ═══════════════════════════════════════════════════════════════

import EventBus from '../../core/EventBus.js';
import EntityManager from '../../core/EntityManager.js';

export class ActionRecorder {
  constructor() {
    this._recording = false;
    this._actions = [];
    this._handlers = [];      // [event, fn] — do odpięcia
    this._startCivYear = 0;
  }

  /** Aktualny civYear z TimeSystem (gameTime × CIV_TIME_SCALE=12). */
  _getCivYear() {
    const gameTime = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    return Math.floor(gameTime * 12);
  }

  /** Zacznij nagrywanie. civYear = 0 oznacza od teraz. */
  start() {
    if (this._recording) {
      console.warn('[Recorder] Już nagrywa.');
      return false;
    }
    this._recording = true;
    this._actions = [];
    this._startCivYear = this._getCivYear();
    this._attachHandlers();
    console.log(`[Recorder] Start @ civYear ${this._startCivYear}. Graj normalnie, akcje są zapisywane.`);
    return true;
  }

  /** Zakończ nagrywanie. Nie czyści akcji — można wywołać export/download. */
  stop() {
    if (!this._recording) {
      console.warn('[Recorder] Nie nagrywa.');
      return false;
    }
    this._recording = false;
    this._detachHandlers();
    console.log(`[Recorder] Stop. Nagrano ${this._actions.length} akcji.`);
    return true;
  }

  /** Czy aktualnie nagrywa. */
  isRecording() {
    return this._recording;
  }

  /** Zwróć kopię zapisanych akcji (bez relatywizacji civYear). */
  getActions() {
    return this._actions.map(a => ({ ...a, action: { ...a.action } }));
  }

  /** Wyczyść zapisane akcje (bez zmiany statusu nagrywania). */
  clear() {
    this._actions = [];
    console.log('[Recorder] Akcje wyczyszczone.');
  }

  /** Eksportuj jako JSON zgodny ze ScriptedBot. relative=true: civYear od 0. */
  export({ name = 'recorded_opening', description = '', fallback = 'rule', relative = true } = {}) {
    const offset = relative ? this._startCivYear : 0;
    const actions = this._actions.map(a => ({
      atCivYear: Math.max(0, a.atCivYear - offset),
      action: a.action,
    }));
    return {
      name,
      description: description || `Nagrane ${actions.length} akcji. Generated ${new Date().toISOString()}`,
      fallback,
      actions,
    };
  }

  /** Trigger pobrania pliku JSON przez przeglądarkę. */
  download(filename = 'recorded_opening.json', opts = {}) {
    const json = JSON.stringify(this.export(opts), null, 2);
    if (typeof document === 'undefined') {
      console.log('[Recorder] JSON (headless — brak downloadu):\n' + json);
      return json;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log(`[Recorder] Zapisano ${filename} (${this._actions.length} akcji).`);
    return json;
  }

  // ── EventBus subskrypcje ────────────────────────────────────────────

  _attachHandlers() {
    this._subscribe('planet:buildRequest',   this._onBuild.bind(this));
    this._subscribe('planet:upgradeRequest', this._onUpgrade.bind(this));
    this._subscribe('planet:demolishRequest', this._onDemolish.bind(this));
    this._subscribe('tech:researchRequest',  this._onResearch.bind(this));
    this._subscribe('expedition:sendRequest', this._onExpedition.bind(this));
    this._subscribe('fleet:buildRequest',    this._onBuildShip.bind(this));
    this._subscribe('factory:enqueue',       this._onFactoryEnqueue.bind(this));
    this._subscribe('factory:setMode',       this._onFactorySetMode.bind(this));
  }

  _subscribe(event, fn) {
    EventBus.on(event, fn);
    this._handlers.push([event, fn]);
  }

  _detachHandlers() {
    for (const [event, fn] of this._handlers) {
      EventBus.off?.(event, fn);
    }
    this._handlers = [];
  }

  _push(action) {
    this._actions.push({
      atCivYear: this._getCivYear(),
      action,
    });
  }

  // ── Handlery — zamiana eventu na akcję ScriptedBot ──────────────────

  _onBuild({ tile, buildingId }) {
    if (!tile || !buildingId) return;
    // Zapisujemy tileQ/tileR (ScriptedBot obsługuje to + ma auto-resolve gdy brak)
    this._push({
      type: 'build',
      buildingId,
      tileQ: tile.q ?? null,
      tileR: tile.r ?? null,
    });
  }

  _onUpgrade({ tile }) {
    if (!tile) return;
    this._push({
      type: 'upgrade',
      tileQ: tile.q ?? null,
      tileR: tile.r ?? null,
    });
  }

  _onDemolish({ tile }) {
    if (!tile) return;
    this._push({
      type: 'demolish',
      tileQ: tile.q ?? null,
      tileR: tile.r ?? null,
    });
  }

  _onResearch({ techId }) {
    if (!techId) return;
    this._push({ type: 'research', techId });
  }

  _onExpedition({ type, targetId, vesselId, cargo }) {
    if (!type || !targetId) return;
    const action = { type: 'expedition', missionType: type, targetId };
    if (vesselId) action.vesselId = vesselId;
    if (cargo) action.cargo = cargo;

    // Dorzuć semantyczny hint — ScriptedBot użyje go jako fallback gdy targetId nie istnieje
    const hint = this._buildTargetHint(type, targetId);
    if (hint) action._targetHint = hint;

    this._push(action);
  }

  /**
   * Buduj semantyczny opis celu z EntityManager:
   *   { kind: 'moon'|'planet', planetType: 'rocky', rank: 'nearest' }
   * ScriptedBot przy replay znajdzie najbliższe ciało pasujące do opisu.
   */
  _buildTargetHint(missionType, targetId) {
    const entity = EntityManager.get?.(targetId);
    if (!entity) return null;

    const hint = {
      kind:       entity.type,        // 'planet' | 'moon' | 'asteroid' | 'planetoid' | 'comet'
      planetType: entity.planetType ?? null,
      rank:       'nearest',          // szukamy najbliższego pasującego ciała
    };

    // Dla misji rozpoznawczych — preferuj unexplored
    if (missionType === 'recon') {
      hint.requireUnexplored = true;
    }
    // Dla kolonizacji — preferuj ciała bez istniejącej kolonii
    if (missionType === 'colony' || missionType === 'colonize') {
      hint.requireNoColony = true;
      hint.requireExplored = true;
    }

    return hint;
  }

  _onBuildShip({ shipId, modules, planetId }) {
    if (!shipId) return;
    const action = { type: 'buildShip', shipId };
    if (modules && modules.length > 0) action.modules = modules;
    if (planetId) action.planetId = planetId;
    this._push(action);
  }

  _onFactoryEnqueue({ commodityId, qty }) {
    if (!commodityId) return;
    this._push({ type: 'factoryEnqueue', commodityId, qty: qty ?? 1 });
  }

  _onFactorySetMode({ mode }) {
    if (!mode) return;
    this._push({ type: 'factorySetMode', mode });
  }
}

export default ActionRecorder;
