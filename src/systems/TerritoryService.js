// TerritoryService — indeks własności układów gwiezdnych (single source of truth)
//
// Zastępuje liczenie „czyj to układ" per klatka w widokach mapy (Stratcom).
// Buduje Map<systemId, { owner, kind, devScore, colonyIds }> z ColonyManager
// (kolonie/outposty) + StationSystem (stacje gracza jako „posterunki" w układach
// BEZ kolonii). Invalidacja eventami (zero liczenia w pętli renderu). Dostarcza
// też kolor tożsamości imperium (warstwa polityczna / strefy wpływów B3-B5).
//
// Finding 600: ten indeks jest JEDYNYM kanonem „czyj to układ", a stempel
// `galaxyData.systems[].empireId` — jego pochodnym LUSTREM, przepisywanym tutaj
// (`syncOwnerStamps` / koniec `_rebuild`) i nigdzie indziej.
//
// Komunikacja: EventBus + window.KOSMOS (bez importów systemów — CLAUDE.md).

import EventBus from '../core/EventBus.js';
import { ARCHETYPES } from '../data/EmpireData.js';

// D6/OG-5 — kanon w `src/utils/ColonyOwnership.js` (zero importów => zero cykli, node-testowalny).
// Powód dla dawnej kopii inline („nie importujemy systemu do systemu") zniknął wraz z przeniesieniem
// kanonu poza systemy — to była cała treść ograniczenia 1 z D6.
import { isPlayerColony } from '../utils/ColonyOwnership.js';

// WP-2 — wzór rozwoju wyprowadzony z tej pętli do wspólnego helpera. Powód: stół pokoju
// wycenia tym samym rozwojem ciała, które zmienia właściciela, a druga kopia wzoru
// rozjechałaby strefę wpływów z ceną kolonii. Pin równości WYKONANIOWEJ: keeper WP-2 T14c.
import { colonyDevScore } from '../utils/ColonyDevScore.js';

// devScore dla samej stacji (posterunek bez kolonii) — stały, niski.
const STATION_DEV_SCORE = 1;

// Rejestr kolonii gotowy? Bez niego indeksu NIE przebudowujemy (Finding 600): przebudowa bez kolonii
// czyści indeks i zeruje `_dirty`, więc po powrocie rejestru kanon mówiłby „niczyj" do następnego zdarzenia.
const hasColonyRegistry = () => typeof window.KOSMOS?.colonyManager?.getAllColonies === 'function';

export class TerritoryService {
  constructor() {
    this._index = new Map();          // systemId → { owner, kind, devScore, colonyIds[] }
    this._dirty = true;
    this._onInvalidate = () => this._invalidate();
    // Zdarzenia unieważniające indeks (kolonie/outposty/stacje/imperia)
    this._events = [
      'colony:founded', 'outpost:founded', 'colony:destroyed',
      'colony:captured',          // AI przejmuje kolonię gracza (transferColony)
      'colony:capturedByPlayer',  // gracz przejmuje ciało AI po desancie (captureColonyForPlayer)
      'colony:listChanged', 'empire:colonyAdded', 'empire:colonyRemoved',
      'empire:destroyed', 'station:created', 'station:destroyed',
    ];
    for (const ev of this._events) EventBus.on(ev, this._onInvalidate);
  }

  // Unieważnij indeks + powiadom warstwę pola (B3).
  // ⚠ Przebudowa jest tu EAGER (Finding 600), nie leniwa przy odczycie: stempel właściciela
  // na `galaxyData.systems[].empireId` jest LUSTREM tego indeksu, a lustro odświeżane dopiero
  // przy pierwszym odczycie kanonu kłamałoby do tej chwili — i każdy czytelnik stempla, który
  // nie pyta kanonu (`DiplomacySystem`, `IntelSystem`, `SystemReveal`, `GalaxyOutlinerLogic`…),
  // widziałby stan sprzed zdarzenia. Koszt: O(kolonie) — `colonyDevScore` jest O(1).
  // Bez rejestru kolonii `_ensure` nic nie robi: `_dirty` zostaje `true` do pierwszego odczytu z rejestrem.
  _invalidate() {
    this._dirty = true;
    this._ensure();
    EventBus.emit('territory:ownersChanged', {});
  }

  // Wymuś przebudowę (np. po restore save'a).
  reindex() { this._invalidate(); }

  // ── Stempel właściciela na galaxyData (Finding 600) ───────────────────────────
  // Jedyne miejsce, które zapisuje `galaxyData.systems[].empireId`. Wszystkie dawne pisarze
  // (`EmpireRegistry.syncToGalaxyData`, `ColonyManager.transferColony`/`captureColonyForPlayer`,
  // `EmpireGenerator`) miały po DWIE różne reguły własności („ostatni wygrywa", „zdobywca bierze
  // cały układ", „czyść, gdy równy poprzedniemu") wobec jednej reguły kanonu („pierwsza kolonia
  // wygrywa", `_rebuild`) — i potrafiły się rozjechać z płytą galaktyki (zmierzone na ZF r120:
  // układ stolicy emp_002 niósł stempel `emp_test_enemy`).
  //
  // Kodowanie stempla: gracz → `null` (jak dotąd — `isHome` wskazuje układ gracza),
  // imperium AI → jego id, układ bez właściciela → `null`.
  //   • Stempel zapisany jako `undefined` (generator galaktyki go nie ustawia) liczy się jak `null`
  //     — układu niczyjego nie przepisujemy (stąd `?? null` przy porównaniu).
  //   • Brak `ColonyManager` ≠ brak właścicieli: bez rejestru kolonii nie ruszamy NICZEGO — ani
  //     stempli, ani indeksu, ani `_dirty` (inaczej wczesny rozruch wyzerowałby stemple z wczytanego zapisu).
  // Zwraca liczbę przepisanych stempli (0 = lustro już zgadzało się z kanonem).
  //
  // ⚠ To jest WYMUSZONA przebudowa, nie `_ensure()`: część zmian własności NIE emituje zdarzenia.
  // `EmpireColonyBootstrap.relinkColoniesAfterRestore` ustawia `ownerEmpireId` po cichu, a
  // wcześniejsze `colony:listChanged` z `ColonyManager.restore` zbudowało indeks w chwili, gdy
  // kolonie AI nie miały jeszcze właściciela. Indeks „nie brudny" ≠ indeks aktualny — i to właśnie
  // to wywołanie (raz po wczytaniu) rozstrzyga o stemplach, więc nie może ufać fladze `_dirty`.
  // Gdy wołający poda INNE `galaxyData` niż żywe (headless, testy), dopisujemy je tym samym
  // indeksem — nigdy z osobnej reguły.
  syncOwnerStamps(galaxyData = window.KOSMOS?.galaxyData) {
    if (!hasColonyRegistry()) return 0;
    let changed = this._rebuild();
    if (galaxyData !== window.KOSMOS?.galaxyData) changed += this._writeOwnerStamps(galaxyData);
    return changed;
  }

  // Sonda rozjazdu lustra z kanonem → [{ systemId, stamp, expected }] (pusta = zgodne).
  // ⚠ KOLEJNOŚĆ JEST CZĘŚCIĄ POMIARU: najpierw zdejmujemy migawkę stempli, DOPIERO POTEM
  // pytamy kanon — odczyt kanonu przebudowuje indeks, a przebudowa naprawia stemple, więc
  // sonda, która zaczęłaby od `getSystemOwner`, leczyłaby to, co ma mierzyć (pomiar jałowy).
  ownerStampMismatches(galaxyData = window.KOSMOS?.galaxyData) {
    const systems = galaxyData?.systems;
    if (!Array.isArray(systems)) return [];
    const snapshot = systems.map(s => ({ systemId: s.id, stamp: s.empireId ?? null }));
    const out = [];
    for (const row of snapshot) {
      const owner = this.getSystemOwner(row.systemId);
      const expected = owner === 'player' ? null : owner;
      if (row.stamp !== expected) out.push({ systemId: row.systemId, stamp: row.stamp, expected });
    }
    return out;
  }

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
  _ensure() { if (this._dirty && hasColonyRegistry()) this._rebuild(); }

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
      const dev   = colonyDevScore(c);
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

    // Lustro kanonu: stempel właściciela na galaxyData przepisujemy z TEGO indeksu, w tej samej
    // chwili, w której powstał (Finding 600) — nigdy z osobnej reguły własności.
    // Zwraca liczbę przepisanych stempli (dla `syncOwnerStamps`; `_ensure` ją ignoruje).
    return this._writeOwnerStamps(window.KOSMOS?.galaxyData);
  }

  // Przepisz `galaxyData.systems[].empireId` z indeksu (patrz `syncOwnerStamps`). Czyta WYŁĄCZNIE
  // `_index`, więc wolno ją wołać z wnętrza `_rebuild` (nie wchodzi w `_ensure`, nic nie emituje).
  _writeOwnerStamps(galaxyData) {
    const systems = galaxyData?.systems;
    if (!Array.isArray(systems)) return 0;
    if (!hasColonyRegistry()) return 0;
    let changed = 0;
    for (const sys of systems) {
      const owner = this._index.get(sys.id)?.owner ?? null;
      const stamp = owner === 'player' ? null : owner;
      if ((sys.empireId ?? null) === stamp) continue;
      sys.empireId = stamp;
      changed++;
    }
    return changed;
  }

  dispose() {
    for (const ev of this._events ?? []) EventBus.off(ev, this._onInvalidate);
    this._events = [];
    this._index.clear();
  }
}
