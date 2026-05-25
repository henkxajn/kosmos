// ═══════════════════════════════════════════════════════════════
// ActionRecorder — loguje akcje gracza do formatu ScriptedBot
// ─────────────────────────────────────────────────────────────
// Subskrybuje request events z EventBus i zapisuje akcje z civYear.
// Eksport: JSON zgodny ze ScriptedBot ({ name, fallback, actions: [...] })
// + pole snapshots: [{ atCivYear, state }] — migawki stanu kolonii co N civYears
// (B.1, przez Snapshot.capture) na potrzeby replay-driven design AI.
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
import Snapshot from '../headless/Snapshot.js';

export class ActionRecorder {
  constructor({ snapshotIntervalYears = 5 } = {}) {
    this._recording = false;
    this._actions = [];
    this._snapshots = [];     // B.1 — timeline stanu kolonii (osobno od _actions)
    this._handlers = [];      // [event, fn] — do odpięcia
    this._startCivYear = 0;
    this._snapshotIntervalYears = snapshotIntervalYears; // B.1 — co ile civYears migawka
    this._lastSnapshotCivYear = 0;
  }

  /** Aktualny civYear z TimeSystem (gameTime × CIV_TIME_SCALE=12). */
  _getCivYear() {
    const gameTime = window.KOSMOS?.timeSystem?.gameTime ?? 0;
    return Math.floor(gameTime * 12);
  }

  /** Zacznij nagrywanie. civYear = 0 oznacza od teraz. snapshotIntervalYears opcjonalnie nadpisuje domyślny. */
  start({ snapshotIntervalYears } = {}) {
    if (this._recording) {
      console.warn('[Recorder] Już nagrywa.');
      return false;
    }
    if (typeof snapshotIntervalYears === 'number' && snapshotIntervalYears > 0) {
      this._snapshotIntervalYears = snapshotIntervalYears;
    }
    this._recording = true;
    this._actions = [];
    this._snapshots = [];
    this._startCivYear = this._getCivYear();
    this._lastSnapshotCivYear = this._startCivYear;
    this._attachHandlers();
    this._captureSnapshot();  // B.1 — baseline @ start (atCivYear = startCivYear)
    console.log(`[Recorder] Start @ civYear ${this._startCivYear}. Snapshot co ${this._snapshotIntervalYears} civYears. Graj normalnie, akcje są zapisywane.`);
    return true;
  }

  /** Zakończ nagrywanie. Nie czyści akcji — można wywołać export/download. */
  stop() {
    if (!this._recording) {
      console.warn('[Recorder] Nie nagrywa.');
      return false;
    }
    // B.1 — końcowy snapshot (chyba że już mamy wpis na tym civYear)
    const nowCiv = this._getCivYear();
    if (this._snapshots.length === 0 ||
        this._snapshots[this._snapshots.length - 1].atCivYear !== nowCiv) {
      this._captureSnapshot();
    }
    this._recording = false;
    this._detachHandlers();
    console.log(`[Recorder] Stop. Nagrano ${this._actions.length} akcji, ${this._snapshots.length} snapshotów.`);
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

  /** Zwróć kopię zapisanych snapshotów (bez relatywizacji civYear). B.1 */
  getSnapshots() {
    return this._snapshots.map(s => ({ atCivYear: s.atCivYear, state: s.state }));
  }

  /** Wyczyść zapisane akcje i snapshoty (bez zmiany statusu nagrywania). */
  clear() {
    this._actions = [];
    this._snapshots = [];
    console.log('[Recorder] Akcje i snapshoty wyczyszczone.');
  }

  /** Eksportuj jako JSON zgodny ze ScriptedBot. relative=true: civYear od 0. */
  export({ name = 'recorded_opening', description = '', fallback = 'rule', relative = true } = {}) {
    const offset = relative ? this._startCivYear : 0;
    const actions = this._actions.map(a => ({
      atCivYear: Math.max(0, a.atCivYear - offset),
      action: a.action,
    }));
    // B.1 — snapshoty z tym samym offsetem co akcje (wyrównane do tej samej osi czasu)
    const snapshots = this._snapshots.map(s => ({
      atCivYear: Math.max(0, s.atCivYear - offset),
      state: s.state,
    }));
    return {
      name,
      description: description || `Nagrane ${actions.length} akcji, ${snapshots.length} snapshotów. Generated ${new Date().toISOString()}`,
      fallback,
      actions,
      snapshots,
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
    // B.3 — decyzje handlowo-transportowe. UWAGA: eventy tradeRoute:create/pause/
    // resume/delete NIE istnieją w obecnym kodzie (CLAUDE.md nieaktualne). Realne:
    //   expedition:transportRequest (loop:true = cykliczna trasa handlowa)
    //   transport:cancelLoop         (anulowanie pętli)
    //   trade:setOverride            (blokada handlu/migracji)
    this._subscribe('expedition:transportRequest', this._onTransport.bind(this));
    this._subscribe('transport:cancelLoop',        this._onTransportCancel.bind(this));
    this._subscribe('trade:setOverride',           this._onTradeOverride.bind(this));
    // B.1 — tick czasu napędza snapshot timeline (odpinany na stop → brak leaku)
    this._subscribe('time:tick', this._onTimeTick.bind(this));
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

  // ── B.3: handlery handlowo-transportowe ─────────────────────────────

  /** expedition:transportRequest — transport zasobów; loop:true = cykliczna trasa handlowa. */
  _onTransport({ targetId, vesselId, cargo, loop, returnCargoSpec } = {}) {
    const action = { type: 'transport', targetId: targetId ?? null, loop: !!loop };
    if (vesselId) action.vesselId = vesselId;
    if (cargo && Object.keys(cargo).length > 0) action.cargo = cargo;
    if (returnCargoSpec) action.returnCargoSpec = returnCargoSpec;
    this._push(action);
  }

  /** transport:cancelLoop — anulowanie cyklicznej trasy handlowej. */
  _onTransportCancel({ vesselId } = {}) {
    if (!vesselId) return;
    this._push({ type: 'transportCancelLoop', vesselId });
  }

  /** trade:setOverride — ręczna blokada handlu towarem / migracji (mode='block' lub null=odblokuj). */
  _onTradeOverride({ colonyId, goodId, mode } = {}) {
    if (!goodId) return;
    this._push({ type: 'tradeOverride', colonyId: colonyId ?? null, goodId, mode: mode ?? null });
  }

  // ── B.1: snapshot timeline ──────────────────────────────────────────

  /** Tick czasu — migawka co _snapshotIntervalYears civYears. */
  _onTimeTick() {
    if (!this._recording) return;
    const civYear = this._getCivYear();
    if (civYear - this._lastSnapshotCivYear >= this._snapshotIntervalYears) {
      this._captureSnapshot();
    }
  }

  /**
   * Migawka stanu kolonii przez Snapshot.capture() (browser-safe — czyta window.KOSMOS).
   * Owinięte try/catch: błąd migawki nie przerywa nagrywania akcji.
   */
  _captureSnapshot() {
    const K = (typeof window !== 'undefined') ? window.KOSMOS : null;
    if (!K) return;
    try {
      const state = Snapshot.capture(K);
      const civYear = this._getCivYear();
      this._snapshots.push({ atCivYear: civYear, state });
      this._lastSnapshotCivYear = civYear;
    } catch (err) {
      console.warn('[Recorder] Snapshot capture nieudany:', err?.message ?? err);
    }
  }
}

export default ActionRecorder;
