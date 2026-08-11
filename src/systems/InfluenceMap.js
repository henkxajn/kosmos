// InfluenceMap — mapa wpływów: przestrzeń ROSZCZONA + strefa GRANICZNA per imperium
// (workstream C, Slice 1, commit S2; orzeczenie R-2).
//
// ⚠ TO SĄ DANE, NIE RYSUNEK (decyzja 3 planu). Ten serwis odpowiada na pytania reguł
// Directora („czy uzbrojony statek gracza jest w strefie granicznej imperium X?") i na
// pytania D3 (granice, incydenty przekroczenia). `TerritoryField` / Stratcom pozostają
// NIETKNIĘTE — warstwa wizualna nie zmienia się w tym slice ani o piksel.
//
// ⚠ RUNTIME-ONLY, ZERO SERIALIZACJI (decyzja 2). Cała treść jest funkcją stanu, który już
// jest zapisany (kolonie, stacje, galaktyka), więc zapisywanie jej byłoby drugim źródłem
// prawdy do rozjechania. Wzór: `TerritoryService`, `SystemPoolService`.
//
// ── DLACZEGO LENIWA PRZEBUDOWA, A NIE PRZELICZANIE CO TICK ──────────────────────────
// Odległości między układami są STAŁE w obrębie partii (galaktyka się nie porusza), więc
// macierz 72×72 liczy się RAZ i żyje do końca gry. Zmienia się wyłącznie: kto co posiada
// (event `territory:ownersChanged`) i jak bardzo rozwinięty jest układ (`devScore`, rosnący
// bez eventu). Stąd dwa różne mechanizmy unieważniania — patrz `_invalidate` i `refresh`.
//
// ── GŁOŚNA AWARIA (audyt R12) ───────────────────────────────────────────────────────
// Brak `territoryService` albo `galaxyData` RZUCA przy pierwszym zapytaniu. Cichy no-op
// dałby regułę, która „nie odpala" nieodróżnialnie od reguły, której nikt nie podłączył —
// dokładnie mechanizm, którym `EconAI`/`MilitaryAI` przetrwały jako martwe zera.

import EventBus from '../core/EventBus.js';
import { GAME_CONFIG } from '../config/GameConfig.js';
import { claimedRadiusLY, classifyGalaxy, distanceLY, systemsWithinLY } from '../utils/InfluenceMath.js';

export class InfluenceMap {
  constructor() {
    this._dirty = true;
    /** ownerId → { claimed:Set<string>, border:Set<string>, sources:Array } */
    this._zones = new Map();
    /** systemId → { claimedBy: string|null, borderOf: string[] } */
    this._bySystem = new Map();

    this._onInvalidate = () => { this._dirty = true; };
    // Ten sam sygnał, którym unieważnia się indeks własności — InfluenceMap jest jego
    // konsumentem, więc nie potrzebuje własnej listy jedenastu zdarzeń.
    EventBus.on('territory:ownersChanged', this._onInvalidate);
    EventBus.on('colony:listChanged',      this._onInvalidate);
  }

  // ── Kolaboratorzy — GŁOŚNO ────────────────────────────────────────────────

  _require() {
    const terr   = window.KOSMOS?.territoryService;
    const galaxy = window.KOSMOS?.galaxyData;
    if (!terr)               throw new Error('[InfluenceMap] brak `window.KOSMOS.territoryService`');
    if (!galaxy?.systems?.length) throw new Error('[InfluenceMap] brak `window.KOSMOS.galaxyData.systems`');
    return { terr, systems: galaxy.systems };
  }

  // ── Przebudowa ────────────────────────────────────────────────────────────

  /**
   * Wymuś przeliczenie przy NASTĘPNYM zapytaniu.
   *
   * ⚠ Potrzebne osobno od eventu, bo `devScore` rośnie WRAZ Z POPULACJĄ i nie emituje
   * żadnego zdarzenia — ten sam powód, dla którego `TerritoryField` woła `reindex()`
   * co miesiąc cywilizacyjny (`TerritoryField.js:47`). Wołający ustala kadencję.
   */
  refresh() { this._dirty = true; }

  _ensure() { if (this._dirty) this._rebuild(); }

  _rebuild() {
    this._dirty = false;
    const { terr, systems } = this._require();
    const cfg = GAME_CONFIG.TERRITORY;
    const byId = new Map(systems.map((s) => [s.id, s]));

    this._zones.clear();
    this._bySystem.clear();

    // 1. Właściciele → ich źródła wpływu (pozycja + promień roszczony z devScore).
    const owners = new Set();
    for (const s of systems) {
      const o = terr.getSystemOwner(s.id);
      if (o) owners.add(o);
    }

    for (const ownerId of owners) {
      const sources = [];
      for (const rec of terr.getOwnedSystems(ownerId)) {
        const sys = byId.get(rec.systemId);
        if (!sys) continue;                       // układ spoza galaktyki — pomijamy cicho, to nie błąd
        sources.push({ system: sys, claimedR: claimedRadiusLY(rec.kind, rec.devScore, cfg) });
      }
      if (!sources.length) continue;
      const { claimed, border } = classifyGalaxy(systems, sources, cfg.BORDER_LY);
      this._zones.set(ownerId, { claimed, border, sources });
    }

    // 2. Indeks odwrotny: układ → kto go rości i czyich powłok dotyka.
    for (const s of systems) {
      const borderOf = [];
      let claimedBy = null;
      for (const [ownerId, z] of this._zones) {
        if (z.claimed.has(s.id)) claimedBy = claimedBy ?? ownerId;   // pierwszy roszczący wygrywa etykietę
        else if (z.border.has(s.id)) borderOf.push(ownerId);
      }
      this._bySystem.set(s.id, { claimedBy, borderOf });
    }
  }

  // ── Odczyt ────────────────────────────────────────────────────────────────

  /** Kto rości ten układ (`null` = niczyj). Uwaga: układ SPORNY zwraca pierwszego. */
  getClaimant(systemId) { this._ensure(); return this._bySystem.get(systemId)?.claimedBy ?? null; }

  /** Lista imperiów, w których strefie GRANICZNEJ leży ten układ (bez roszczących go). */
  getBorderOwners(systemId) { this._ensure(); return [...(this._bySystem.get(systemId)?.borderOf ?? [])]; }

  /**
   * Czy układ leży w strefie granicznej danego właściciela.
   * ⚠ Przestrzeń ROSZCZONA to NIE strefa graniczna — te zbiory są rozłączne
   * (`classifyGalaxy`). Reguła nacisku, która ma reagować i na jedno, i na drugie,
   * musi zapytać o oba; to jest celowe, bo „wszedł mi na podwórko" i „stoi tuż za
   * płotem" są w tej mechanice różnymi zdarzeniami.
   */
  isInBorderZone(systemId, ownerId) {
    this._ensure();
    return this._zones.get(ownerId)?.border.has(systemId) === true;
  }

  isClaimedBy(systemId, ownerId) {
    this._ensure();
    return this._zones.get(ownerId)?.claimed.has(systemId) === true;
  }

  /** Wszystkie układy w strefie granicznej właściciela (kopia — nikt nie mutuje indeksu). */
  getBorderSystems(ownerId) { this._ensure(); return [...(this._zones.get(ownerId)?.border ?? [])]; }
  getClaimedSystems(ownerId) { this._ensure(); return [...(this._zones.get(ownerId)?.claimed ?? [])]; }

  /** Właściciele, dla których mapa cokolwiek policzyła (gracz + imperia). */
  listOwners() { this._ensure(); return [...this._zones.keys()]; }

  /**
   * Najkrótsza odległość układu do przestrzeni ROSZCZONEJ właściciela, w LY.
   * Wartość ujemna = układ leży wewnątrz roszczenia. `null` = właściciel nie ma źródeł.
   * Hook pod D3 (stopniowanie incydentu) i pod przyszłe reguły dystansowe.
   */
  distanceToClaimLY(systemId, ownerId) {
    this._ensure();
    const z = this._zones.get(ownerId);
    if (!z?.sources?.length) return null;
    const { systems } = this._require();
    const sys = systems.find((s) => s.id === systemId);
    if (!sys) return null;
    let best = Infinity;
    for (const src of z.sources) best = Math.min(best, distanceLY(sys, src.system) - src.claimedR);
    return best;
  }

  /** Diagnostyka — surowe liczby do `KOSMOS.debug.influenceMap()`. */
  snapshot() {
    this._ensure();
    const { systems } = this._require();
    const rows = [];
    for (const [ownerId, z] of this._zones) {
      rows.push({
        owner: ownerId,
        sources: z.sources.length,
        claimed: z.claimed.size,
        border: z.border.size,
        coveragePct: +(100 * (z.claimed.size + z.border.size) / systems.length).toFixed(1),
      });
    }
    return { totalSystems: systems.length, borderLY: GAME_CONFIG.TERRITORY.BORDER_LY, owners: rows };
  }

  dispose() {
    EventBus.off('territory:ownersChanged', this._onInvalidate);
    EventBus.off('colony:listChanged',      this._onInvalidate);
    this._zones.clear();
    this._bySystem.clear();
  }
}

export { systemsWithinLY };
