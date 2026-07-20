// TerritoryService — indeks własności układów gwiezdnych (single source of truth)
//
// Zastępuje liczenie „czyj to układ" per klatka w widokach mapy (Stratcom).
// Buduje Map<systemId, { owner, kind, devScore, colonyIds }> z ColonyManager
// (kolonie/outposty) + StationSystem (stacje gracza jako „posterunki" w układach
// BEZ kolonii). Invalidacja eventami (zero liczenia w pętli renderu). Dostarcza
// też kolor tożsamości imperium (warstwa polityczna / strefy wpływów B3-B5).
//
// Komunikacja: EventBus + window.KOSMOS (bez importów systemów — CLAUDE.md).

import EventBus from '../core/EventBus.js';
import { ARCHETYPES } from '../data/EmpireData.js';

// Odpowiednik ColonyManager.isPlayerColony (kanon tam) — inline, by NIE importować
// systemu do systemu (CLAUDE.md) i utrzymać TerritoryService node-testowalnym.
const isPlayerColony = (c) => !!c && (!c.ownerEmpireId || c.ownerEmpireId === 'player');

// devScore dla samej stacji (posterunek bez kolonii) — stały, niski.
const STATION_DEV_SCORE = 1;

export class TerritoryService {
  constructor() {
    this._index = new Map();          // systemId → { owner, kind, devScore, colonyIds[] }
    this._dirty = true;
    this._onInvalidate = () => this._invalidate();
    // Zdarzenia unieważniające indeks (kolonie/outposty/stacje/imperia)
    this._events = [
      'colony:founded', 'outpost:founded', 'colony:destroyed', 'colony:captured',
      'colony:listChanged', 'empire:colonyAdded', 'empire:colonyRemoved',
      'empire:destroyed', 'station:created', 'station:destroyed',
    ];
    for (const ev of this._events) EventBus.on(ev, this._onInvalidate);
  }

  // Unieważnij indeks + powiadom warstwę pola (B3). Przebudowa leniwa przy odczycie.
  _invalidate() { this._dirty = true; EventBus.emit('territory:ownersChanged', {}); }

  // Wymuś przebudowę przy następnym odczycie (np. po restore save'a).
  reindex() { this._invalidate(); }

  // ── Odczyt ──────────────────────────────────────────────────────────────────
  getSystemOwner(systemId)    { this._ensure(); return this._index.get(systemId)?.owner ?? null; }
  getSystemDevScore(systemId) { this._ensure(); return this._index.get(systemId)?.devScore ?? 0; }

  // [{ systemId, devScore, kind }] dla właściciela ('player' | empireId)
  getOwnedSystems(ownerId) {
    this._ensure();
    const out = [];
    for (const [systemId, rec] of this._index) {
      if (rec.owner === ownerId) out.push({ systemId, devScore: rec.devScore, kind: rec.kind });
    }
    return out;
  }

  // Kolor tożsamości imperium ('player' czyta gameState.player.empireColor).
  getEmpireColor(ownerId) {
    if (ownerId === 'player') {
      return window.KOSMOS?.gameState?.get?.('player.empireColor') ?? '#33ccff';
    }
    const emp = window.KOSMOS?.empireRegistry?.get?.(ownerId);
    return emp?.color ?? ARCHETYPES[emp?.archetype]?.color ?? '#888888';
  }

  // ── Budowa indeksu ────────────────────────────────────────────────────────────
  _ensure() { if (this._dirty) this._rebuild(); }

  _rebuild() {
    this._dirty = false;
    const idx = this._index;
    idx.clear();
    const colMgr = window.KOSMOS?.colonyManager;
    const staMgr = window.KOSMOS?.stationSystem;

    // Kolonie i outposty — właściciel z ownerEmpireId, devScore z rozwoju.
    for (const c of (colMgr?.getAllColonies?.() ?? [])) {
      const systemId = c.systemId ?? 'sys_home';
      const owner = isPlayerColony(c) ? 'player' : c.ownerEmpireId;
      const kind  = c.isOutpost ? 'outpost' : 'colony';
      const dev   = (c.civSystem?.population ?? 0) + (c.buildingSystem?._active?.size ?? 0);
      let rec = idx.get(systemId);
      if (!rec) {
        idx.set(systemId, { owner, kind, devScore: dev, colonyIds: [c.planetId] });
        continue;
      }
      // Układ SPORNY: kolonia INNEGO właściciela NIE zasila devScore/colonyIds tej
      // strefy (rozwój AI nie może liczyć się graczowi). Właściciel = pierwszej kolonii.
      if (owner !== rec.owner) continue;
      // Ten sam właściciel: akumuluj; pełna kolonia bije outpost w etykiecie 'kind'.
      if (rec.kind === 'outpost' && kind === 'colony') rec.kind = 'colony';
      rec.devScore += dev;
      rec.colonyIds.push(c.planetId);
    }

    // Stacje GRACZA w układach BEZ kolonii → „posterunek" (kind:'station', niski devScore).
    for (const st of (staMgr?.getAllStations?.() ?? [])) {
      if ((st.ownerEmpireId ?? 'player') !== 'player') continue;   // stacje AI pomijamy
      const systemId = st.systemId ?? 'sys_home';
      if (idx.has(systemId)) continue;                             // kolonia już ustala własność
      idx.set(systemId, { owner: 'player', kind: 'station', devScore: STATION_DEV_SCORE, colonyIds: [] });
    }
  }

  dispose() {
    for (const ev of this._events ?? []) EventBus.off(ev, this._onInvalidate);
    this._events = [];
    this._index.clear();
  }
}
