// ═══════════════════════════════════════════════════════════════
// EmpireResearchSystem — model badań AI (S3.2 S2)
// ───────────────────────────────────────────────────────────────
// Imperia AI badają technologie W CZASIE z realnego zasobu `research`,
// zamiast dostawać statyczny grant przy bootstrapie. Każdy archetyp ma
// własną uporządkowaną kolejkę (`ARCHETYPES[archetype].researchQueue`).
//
// Pętla (per civYear, mirror EmpireLogisticsSystem):
//   dla każdej stolicy AI ze stacją badawczą:
//     progress += getGrossPerYear('research') × civDt
//     póki progress ≥ cost(current tech): grantTechs([tech]) → następny
//
// Stan per imperium na `empire.research = { queueIndex, progress }`
// (gameState.empires — round-trip w save, identycznie jak empire.logistics).
// System jest BEZSTANOWY względem save (brak serialize/restore — lazy-init
// `_ensureResearch` defaultuje pole na restorowanym imperium).
//
// ŚWIADOME DECYZJE (raport S3.2 S2):
//   - grantTechs jest CICHE (bez global 'tech:researched') — emit globalny
//     odpalałby player-facing hooki (narracja/frakcje/dyson via
//     emitCompletionHooks) + _reapplyAllRates WSZYSTKICH kolonii →
//     kontaminacja gracza techem AI. Mnożniki produkcji AI czytane są live
//     z aiTech przy re-apply rates w EmpireColonyMaintenance.
//   - Koszt = RAW TECHS[id].cost.research (nie getEffectiveCost, które
//     dolicza discovery-surcharge) — decyzja Filipa "pełny koszt jak w
//     TechData" + bypass miękkich bramek warp_theory (AI nie ma modelu
//     odkryć/zapasów; grantTechs i tak je pomija).
//   - Brak jawnego sprawdzania prereqów — uporządkowana kolejka gwarantuje,
//     że prereqy poprzedzają (grantTechs nie waliduje).
//
// Wzorzec ticku jak EmpireLogisticsSystem/EmpireStrategySystem (konstruktor
// subskrybuje time:tick, deps leniwie z window.KOSMOS).
// ═══════════════════════════════════════════════════════════════

import EventBus from '../core/EventBus.js';
import { ARCHETYPES } from '../data/EmpireData.js';
import { TECHS } from '../data/TechData.js';

// Budynek-gate produkcji research. Brak stacji w stolicy = badania stoją
// (colony_base daje 2 research/rok, ale gate wymaga REALNEJ stacji).
const RESEARCH_STATION_ID = 'research_station';

export class EmpireResearchSystem {
  constructor() {
    this._verbose = false;   // KOSMOS.empireResearchSystem._verbose = true

    this._onTick = ({ civDeltaYears }) => this._tick(civDeltaYears ?? 0);
    EventBus.on('time:tick', this._onTick);
  }

  stop() {
    EventBus.off('time:tick', this._onTick);
  }

  _log(msg, ctx = '') {
    if (!this._verbose) return;
    console.log(`[EmpireResearchSystem] ${msg}${ctx ? ' — ' + ctx : ''}`);
  }

  // ── Leniwe deps ───────────────────────────────────────────────────────────
  _reg()      { return window.KOSMOS?.empireRegistry; }
  _gameTime() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  // Imperia obsługiwane (mają znany archetyp; gracz NIE jest w EmpireRegistry).
  _managedEmpires() {
    const reg = this._reg();
    if (!reg?.listAll) return [];
    return reg.listAll().filter(e => !!ARCHETYPES[e?.archetype]);
  }

  // Kolejka badań archetypu (static data). Brak pola → [] (archetyp nie bada).
  _researchQueue(empire) {
    const q = ARCHETYPES[empire?.archetype]?.researchQueue;
    return Array.isArray(q) ? q : [];
  }

  // Stolica imperium = pierwsza pełna (nie-outpost) kolonia z resourceSystem.
  _pickCapital(empire) {
    const colonies = this._reg()?.getColoniesByEmpire?.(empire.id) ?? [];
    for (const c of colonies) {
      if (c && !c.isOutpost && c.resourceSystem) return c;
    }
    return null;
  }

  // Per-imperium TechSystem (aiTech). Stolica trzyma anchor; fallback przez
  // bootstrap helper (gdy stolica to kolonia wtórna bez własnego techSystem).
  _aiTech(empire, capital) {
    return capital?.techSystem
      ?? window.KOSMOS?.empireColonyBootstrap?._findEmpireTechSystem?.(empire.id)
      ?? null;
  }

  // Gate: czy stolica ma choć jedną stację badawczą (idiom z BuildingSystem).
  _hasResearchStation(capital) {
    const active = capital?.buildingSystem?._active;
    if (!active) return false;
    for (const entry of active.values()) {
      if (entry?.building?.id === RESEARCH_STATION_ID) return true;
    }
    return false;
  }

  // Lazy init stanu badań na obiekcie imperium (gameState live ref → round-trip).
  _ensureResearch(empire) {
    if (!empire) return null;
    if (!empire.research || typeof empire.research !== 'object') {
      empire.research = { queueIndex: 0, progress: 0 };
    }
    const r = empire.research;
    if (typeof r.queueIndex !== 'number' || r.queueIndex < 0) r.queueIndex = 0;
    if (typeof r.progress   !== 'number' || r.progress   < 0) r.progress   = 0;
    return r;
  }

  // ── Pętla czasu ─────────────────────────────────────────────────────────────
  _tick(civDt) {
    if (civDt <= 0) return;
    for (const empire of this._managedEmpires()) {
      try { this._tickEmpire(empire, civDt); }
      catch (e) { console.error(`[EmpireResearchSystem] tickEmpire ${empire?.id} threw:`, e); }
    }
  }

  _tickEmpire(empire, civDt) {
    const queue = this._researchQueue(empire);
    if (queue.length === 0) return;                 // archetyp bez kolejki → idle

    const state = this._ensureResearch(empire);
    if (state.queueIndex >= queue.length) return;   // kolejka wyczerpana → idle (bez akumulacji)

    const capital = this._pickCapital(empire);
    const aiTech = this._aiTech(empire, capital);
    if (!aiTech) return;                            // brak stolicy/techSystem → czekaj

    // Akumulacja TYLKO gdy gate OK (stacja badawcza + realny output).
    if (this._hasResearchStation(capital)) {
      const rate = capital.resourceSystem?.getGrossPerYear?.('research') ?? 0;
      if (rate > 0) state.progress += rate * civDt;
    }

    // Przejście kolejki: pomiń zbadane (gratis, progress niesie się dalej),
    // płać raw cost za resztę. while obsługuje wiele ukończeń w jednym tiku.
    while (state.queueIndex < queue.length) {
      const techId = queue[state.queueIndex];
      const tech = TECHS[techId];
      // EDGE: nieznane id / tech już zbadany (startowy lub restore) → skip.
      if (!tech || aiTech.isResearched(techId)) {
        state.queueIndex++;
        continue;
      }
      const cost = tech.cost?.research ?? Infinity;
      if (state.progress < cost) break;             // jeszcze za mało
      state.progress -= cost;
      aiTech.grantTechs([techId]);                  // ciche odblokowanie
      EventBus.emit('empire:techResearched', {
        empireId: empire.id, techId, year: this._gameTime(),
      });
      this._log(`${empire.id} zbadał ${techId}`, `reszta progress ${state.progress.toFixed(1)}`);
      state.queueIndex++;
    }
  }

  // ── Devtools ────────────────────────────────────────────────────────────────
  // KOSMOS.empireResearchSystem.debugDump() — szybki wgląd w stan badań AI (live game gate).
  debugDump() {
    const rows = [];
    for (const empire of this._managedEmpires()) {
      const queue = this._researchQueue(empire);
      const state = this._ensureResearch(empire);
      const capital = this._pickCapital(empire);
      const cur = queue[state.queueIndex] ?? '(kolejka wyczerpana)';
      const cost = TECHS[cur]?.cost?.research ?? null;
      rows.push({
        empire:    empire.id,
        archetype: empire.archetype,
        idx:       `${state.queueIndex}/${queue.length}`,
        current:   cur,
        progress:  `${Math.round(state.progress)}${cost != null ? '/' + cost : ''}`,
        station:   this._hasResearchStation(capital),
        rate:      Math.round((capital?.resourceSystem?.getGrossPerYear?.('research') ?? 0) * 10) / 10,
      });
    }
    console.table(rows);
    return rows;
  }
}
