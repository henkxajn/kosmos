// GarrisonSystem — AI GARRISON (G2-3b): garnizony naziemne imperiów AI.
//
// C-S1 — MOBILIZACJA (D15, podpis 2026-10-02): rezerwa materializuje się jako prawdziwe jednostki RAZ na
// imperium, przy jego PIERWSZEJ wojnie. Ile, jakich, z jakim morale, na których ciałach i heksach — mówi
// planer G2-3a (`src/utils/GarrisonPlanner.js`); ten system tylko go WYKONUJE przez jedyne wejście
// tworzenia jednostki AI (`GroundUnitManager.createAIUnit`, G2-1).
//
//   • zaczep: `diplomacy:warDeclared` (jedyny emitent — `DiplomacySystem.declareWar`, para gracz↔imperium);
//   • zapis wczytany JUŻ w stanie wojny mobilizuje się na PIERWSZYM TICKU (`reconcile`) — przy wczytaniu
//     żadne zdarzenie wojny nie leci, a każda ścieżka, która ustawia status `'war'` bez zdarzenia (stary
//     zapis po migracji, konsola), trafia tutaj;
//   • flaga: `gameState.empires.<id>.garrison` (intencja `EmpireRegistry.markGarrisonMobilized`) — klucz
//     najwyższego poziomu `empires` jest zadeklarowany w `GameState`, więc pole wewnątrz przeżywa zapis
//     bez migracji (save v101); zapis bez pola = „nie zmobilizowano”;
//   • imperium BEZ pełnej kolonii (brak stolicy, D12) nie mobilizuje niczego i flagi NIE ustawia;
//   • jednostka bez wolnego heksu, na którym da się stanąć, NIE powstaje — zostaje w rezerwie (odp. (f));
//   • każda wojna, w której imperium bierze udział, się liczy (`isAtWar` — dowolna para relacji `'war'`);
//   • po wojnie jednostki zostają; drugiej mobilizacji nie ma (odrastanie strat = G3).
//
// G3-1 — ODRASTANIE STRAT (podpis właściciela, plan §1; domyślne potwierdzone 2026-10-04): po pierwszej mobilizacji
// imperium odzyskuje JEDNĄ jednostkę na rok gry (`GARRISON_REGROWTH_PER_YEAR`), w wojnie i w pokoju, do limitu
// liczonego W CHWILI tworzenia (planer — szczebel, morale i archetyp drabiny z tej chwili). Jednostka staje tam, gdzie
// bieżący plan ma największy niedobór (remis — stolica pierwsza); bez wolnego heksu na tym ciele — następne ciało wg
// tego rankingu; bez miejsca nigdzie — w tym roku nic. Limit poniżej żywych — nic nie powstaje i nic nie jest
// rozwiązywane. Ciała, których imperium już nie ma, nie dostają nic. Tworzenie wyłącznie przez `createAIUnit`.
// G3-2 (Finding 360) — UZGADNIANIE CO ROK: przy tej samej kontroli rocznej imperium w wojnie bez mobilizacji (brak
// pełnej kolonii w chwili wybuchu wojny albo wojna bez zdarzenia) mobilizuje się (`reason: 'reconcile_yearly'`).
//   • ROK GRY = 1,0 na zegarze `timeSystem.gameTime` (lata WYŚWIETLANE — ten sam, którym flaga zapisuje `year`;
//     = 12 civY); granica roku = wzrost `floor(gameTime)` (data w zegarze przechodzi na 01/01).
//   • DOKŁADNIE RAZ NA ROK, także przez zapis, pauzę i wysoką prędkość: rekord flagi niesie `regrowthYear` — ostatni
//     rozliczony rok kalendarzowy (intencja `EmpireRegistry.setGarrisonRegrowthYear`); kontrola co tick rozlicza
//     każdy rok od `regrowthYear + 1` do bieżącego (jeden tick może przeskoczyć kilka lat), pauza nie tyka. Zapis
//     z tego samego ticku co granica (autozapis słucha `time:tick` WCZEŚNIEJ niż ten system) rozlicza się po wczytaniu.
//   • Zapis sprzed G3 (flaga bez `regrowthYear`) — pierwsza kontrola tylko ustawia bieżący rok; odrastanie od
//     następnej granicy roku, bez nadrabiania lat sprzed wczytania (bez migracji, save v101).
//
// C-S2 — USUWANIE (D6, D16; Finding 319): przy zmianie właściciela ciała (przejęcie przez gracza, cesja,
// przerzut `transferColony`) znikają jednostki POPRZEDNIEGO właściciela na tym ciele; przy zniszczeniu ciała
// (`colony:destroyed` — kolizja, wyrzucenie z układu, `entity:removed`) znikają jednostki WSZYSTKICH imperiów AI;
// ciało BEZ kolonii zgłasza zniszczenie wyłącznie przez `entity:removed` (R7, G2-4).
//   • jednostki AI nie mają POP (`popCost` 0, G2-1), więc usunięcie to samo `removeUnit` — bez tabeli śmierci;
//   • jednostki GRACZA (decyzja właściciela 2026-10-03, Finding 358): na ciele ZNISZCZONYM znikają razem z nim, a ich POP
//     wracają do domu W CAŁOŚCI (R7, G2-4 — do G1c); na ciele, które zmieniło właściciela, zostają — przy oddaniu
//     ciała AI w traktacie obejmuje je flaga wycofania po pokoju (`WithdrawalSystem`, R3). Pin: `g2_seams_smoke` P6b;
//   • ładownia statku na orbicie (`in_cargo`) nie jest „na ciele” — `getUnitsOnPlanet` ją pomija.
//
// C-S3 — STEMPEL KAFLI (Finding 318): kafle kolonii AI niosą właściciela — od bootstrapu
// (`EmpireColonyBootstrap`), a w starych zapisach od PIERWSZEGO ticku (`reconcile` → `stampAiColonyTiles`, ten sam
// helper `TileOwnership.stampUnownedTiles`). Stemplujemy WYŁĄCZNIE kafle bez właściciela — kafel zajęty okupacją
// zostaje przy zajmującym. Uzgodnienie stempluje PRZED mobilizacją (mobilizacja z właścicieli kafli nie korzysta).
//
// ⚠ Determinizm: żadnego losowania — plan jest funkcją stanu świata (D1/D9/D10/D11/D12).
// ⚠ Jednostki AI powstają WYŁĄCZNIE przez `createAIUnit` (owner I factionId = imperium, popCost 0) —
//   `createUnit` z samym `{ owner }` wciągałby je w utrzymanie gracza (Finding 323, pin G2-0 P2).
// ⚠ Wyłącznik `enabled` istnieje dla setupu keeperów, które potrzebują NIEBRONIONEJ kolonii AI w stanie
//   wojny (zgoda właściciela 2026-10-03). To NIE jest flaga `FEATURES` gry — w grze jest zawsze `true`.
// ⚠ Brak wpisów w Dzienniku i dzwonka (poza zakresem G2-3b). Ślad audytu: `garrison:mobilized` /
//   `garrison:mobilizeSkipped` w `DebugLog.TRACKED_EVENTS` (reguła W3: nowy powód odmowy w tym samym commicie).

import EventBus from '../core/EventBus.js';
import {
  planEmpireGarrison, readEmpireGarrisonSnapshot, readGarrisonBodyContext,
  garrisonHexes, garrisonShortfall, garrisonRegrowthArchetype, readEmpireGarrisonUnits,
} from '../utils/GarrisonPlanner.js';
import { GARRISON_REGROWTH_PER_YEAR } from '../data/GarrisonData.js';
import { stampUnownedTiles } from '../utils/TileOwnership.js';

// `gameTime` to suma zmiennoprzecinkowych kroków: dwanaście kroków po 1/12 daje 0,9999999999999999, nie 1 — bez
// tolerancji granica roku spóźniałaby się o tick (ta sama klasa co próg terminu w `WithdrawalSystem`).
const YEAR_EPS = 1e-9;
const calendarYear = (gameTime) => Math.floor(gameTime + YEAR_EPS);

export class GarrisonSystem {
  constructor() {
    /** Wyłącznik mobilizacji — tylko dla setupu keeperów (patrz nagłówek). */
    this.enabled = true;
    this._reconciled = false;
    /** G3-2 — ostatni rok kalendarzowy uzgodnienia rocznego w tej sesji (`null` = jeszcze nie ustawiony). */
    this._reconciledYear = null;

    this._onWarDeclared = ({ empireId } = {}) => { this.mobilizeEmpire(empireId, 'war_declared'); };
    this._onFirstTick   = () => this._firstTick();
    this._onTick        = () => this._yearlyCheck();
    EventBus.on('diplomacy:warDeclared', this._onWarDeclared);
    EventBus.on('time:tick', this._onFirstTick);
    // G3-1 + G3-2 — kontrola roczna; zarejestrowana PO zatrzasku pierwszego ticku, więc w pierwszym ticku sesji
    //   uzgodnienie z wczytania mobilizuje przed nią.
    EventBus.on('time:tick', this._onTick);

    // C-S2 — zmiana właściciela (oba emitenty to `ColonyManager`) i zniszczenie ciała.
    EventBus.on('colony:capturedByPlayer', ({ planetId, previousOwner, reason } = {}) =>
      this.removeOnOwnerChange(planetId, previousOwner, reason ?? 'capture'));
    EventBus.on('colony:captured', ({ planetId, previousOwner, reason } = {}) =>
      this.removeOnOwnerChange(planetId, previousOwner, reason ?? 'transfer'));
    EventBus.on('colony:destroyed', ({ planetId, reason, bodyName } = {}) =>
      this.removeOnBodyDestroyed(planetId, reason ?? 'destroyed', bodyName ?? null));
    // R7 (G2-4) — ciało BEZ kolonii zniszczone (każde `EntityManager.remove`: kolizja, absorpcja, osierocony księżyc):
    //   `colony:destroyed` nie leci, więc jednostka gracza stojąca na nim (łazik zwiadu, desant na ciele niczyim)
    //   zostawała zarejestrowana na nieistniejącym ciele (zmierzone). Ciało Z kolonią idzie ścieżką wyżej — ColonyManager
    //   usuwa kolonię w mikrozadaniu i emituje `colony:destroyed`; stąd bramka `hasColony` (bez podwójnego usunięcia).
    EventBus.on('entity:removed', ({ entity } = {}) => {
      if (!entity?.id || this._K()?.colonyManager?.hasColony?.(entity.id)) return;
      this.removeOnBodyDestroyed(entity.id, 'entity_removed', entity.name ?? null);
    });
  }

  /** Usługi gry (w grze `window.KOSMOS`). */
  _K() { return (typeof window !== 'undefined') ? window.KOSMOS : null; }

  // ── Odczyty ──────────────────────────────────────────────────────────────────────────

  /** Czy imperium już się zmobilizowało (flaga w `empires.<id>.garrison`). */
  isMobilized(empireId) {
    return this._K()?.empireRegistry?.isGarrisonMobilized?.(empireId) === true;
  }

  /**
   * Czy imperium bierze udział w JAKIEJKOLWIEK wojnie (dowolna para relacji ze statusem `'war'`).
   * Źródło prawdy jak w D13: status relacji, nie rekord wojny. Brak dyplomacji ⇒ `false`.
   */
  isAtWar(empireId) {
    const rel = this._K()?.diplomacySystem?.relations;
    if (!empireId || typeof rel?.listPairsWith !== 'function') return false;
    try {
      return rel.listPairsWith(empireId).some(r => r?.status === 'war');
    } catch {
      return false;
    }
  }

  /**
   * Jednostki naziemne imperium AI (tylko odczyt) — do konsoli: `KOSMOS.garrisonSystem.listUnits('emp_001')`.
   * Bez argumentu — wszystkie imperia AI z rejestru.
   * @returns {Array<{empireId, unitId, planetId, archetypeId, morale, maxMorale, deployState, q, r, hp, status}>}
   */
  listUnits(empireId = null) {
    const K = this._K();
    const ids = new Set(empireId ? [empireId] : (K?.empireRegistry?.listIds?.() ?? []));
    return (K?.groundUnitManager?.getAllUnits?.() ?? [])
      .filter(u => ids.has(u?.owner))
      .map(u => ({
        empireId: u.owner, unitId: u.id, planetId: u.planetId, archetypeId: u.archetypeId ?? u.type,
        morale: u.morale, maxMorale: u.maxMorale, deployState: u.deployState ?? null,
        q: u.q, r: u.r, hp: u.hp, status: u.status,
      }));
  }

  // ── Mobilizacja (D15) ────────────────────────────────────────────────────────────────

  /**
   * Mobilizuje garnizon imperium wg planera — RAZ na imperium.
   * @param {string} empireId
   * @param {string} [reason] — `'war_declared'` (zaczep) | `'reconcile_at_war'` (pierwszy tick)
   * @returns {{ok:true, empireId:string, unitIds:string[], reserve:number, plan:Object} | {ok:false, reason:string}}
   */
  mobilizeEmpire(empireId, reason = 'war_declared') {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const reg = K?.empireRegistry;
    const gum = K?.groundUnitManager;
    if (!empireId || empireId === 'player' || !reg?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (typeof gum?.createAIUnit !== 'function') return { ok: false, reason: 'no_ground_unit_manager' };
    if (this.isMobilized(empireId)) {
      // D15: RAZ na imperium — kolejna wojna nie tworzy nic (odrastanie strat = G3). Ślad audytu jawny.
      EventBus.emit('garrison:mobilizeSkipped', { empireId, reason: 'already_mobilized', trigger: reason });
      return { ok: false, reason: 'already_mobilized' };
    }

    const snap = readEmpireGarrisonSnapshot(K, empireId);
    if (!snap.capitalId) {
      // Imperium bez pełnej kolonii: nic nie powstaje i flaga NIE jest ustawiana (mobilizacja przy
      // następnej wojnie albo przy następnym wczytaniu w stanie wojny).
      EventBus.emit('garrison:mobilizeSkipped', { empireId, reason: 'no_capital', trigger: reason });
      return { ok: false, reason: 'no_capital' };
    }

    const plan = planEmpireGarrison(snap, (planetId) => readGarrisonBodyContext(K, planetId));
    const unitIds = [];
    const perBody = [];
    let reserve = 0;
    let refused = 0;
    for (const body of plan.perBody) {
      const hexes = body.hexes?.hexes ?? [];
      let created = 0;
      for (let i = 0; i < body.count; i++) {
        const hex = hexes[i];
        if (!hex) { reserve++; continue; }      // brak wolnego heksu ⇒ nie powstaje, zostaje w rezerwie (f)
        const res = gum.createAIUnit({
          archetypeId: body.composition[i], empireId, planetId: body.planetId,
          q: hex.q, r: hex.r, morale: body.morale, deployed: true,
        });
        if (res?.ok) { unitIds.push(res.unit.id); created++; } else { refused++; reserve++; }
      }
      perBody.push({ planetId: body.planetId, role: body.role, planned: body.count, created });
    }

    const now = K?.timeSystem?.gameTime;
    const record = {
      mobilized: true,
      year:      now ?? null,
      // G3-1 — rok mobilizacji jest rozliczony: pierwsze odrastanie przy NASTĘPNEJ granicy roku.
      regrowthYear: Number.isFinite(now) ? calendarYear(now) : null,
      reason,
      tier:      plan.tier.index,
      morale:    plan.tier.morale,
      limit:     plan.limit,
      created:   unitIds.length,
      reserve,
      refused,
    };
    reg.markGarrisonMobilized(empireId, record);
    EventBus.emit('garrison:mobilized', { empireId, ...record, perBody });
    return { ok: true, empireId, unitIds, reserve, plan };
  }

  // ── Odrastanie strat (G3-1) i uzgadnianie co rok (G3-2) ──────────────────────────────

  /**
   * G3-1 — jedna próba odrastania imperium (wołana przez kontrolę roczną; z konsoli — tylko do pomiaru).
   * @param {string} empireId
   * @param {number|null} [year] — rozliczany rok kalendarzowy (do śladu audytu)
   * @returns {{ok:true, unitId:string, planetId:string, archetypeId:string, morale:number, tier:number}
   *          | {ok:false, reason:string, alive?:number, limit?:number}}
   *   powody: `disabled` · `unknown_empire` · `no_ground_unit_manager` · `not_mobilized` · `no_capital` ·
   *   `at_limit` (żywe ≥ limit — nic nie powstaje, nic nie jest rozwiązywane) · `no_free_hex` / `create_failed`
   *   (ślad `garrison:regrowthSkipped`)
   */
  regrowEmpire(empireId, year = null) {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const K = this._K();
    const gum = K?.groundUnitManager;
    if (!empireId || empireId === 'player' || !K?.empireRegistry?.get?.(empireId)) return { ok: false, reason: 'unknown_empire' };
    if (typeof gum?.createAIUnit !== 'function') return { ok: false, reason: 'no_ground_unit_manager' };
    if (!this.isMobilized(empireId)) return { ok: false, reason: 'not_mobilized' };

    const snap = readEmpireGarrisonSnapshot(K, empireId);
    if (!snap.capitalId) return { ok: false, reason: 'no_capital' };
    const plan = planEmpireGarrison(snap);
    const alive = readEmpireGarrisonUnits(K, empireId, snap.bodies.map(b => b.planetId));
    const count = new Map([...alive].map(([pid, list]) => [pid, list.length]));
    const aliveTotal = [...count.values()].reduce((s, n) => s + n, 0);
    if (aliveTotal >= plan.limit) return { ok: false, reason: 'at_limit', alive: aliveTotal, limit: plan.limit };

    let refused = 0;
    for (const cand of garrisonShortfall(plan, count)) {
      const body = plan.perBody.find(b => b.planetId === cand.planetId);
      const hex = garrisonHexes(readGarrisonBodyContext(K, cand.planetId), 1).hexes[0];
      if (!hex) continue;                         // brak wolnego heksu na tym ciele — następne ciało wg rankingu
      const archetypeId = garrisonRegrowthArchetype(body?.composition, alive.get(cand.planetId));
      if (!archetypeId) continue;
      const res = gum.createAIUnit({
        archetypeId, empireId, planetId: cand.planetId, q: hex.q, r: hex.r, morale: plan.tier.morale, deployed: true,
      });
      if (!res?.ok) { refused++; continue; }
      const out = { ok: true, unitId: res.unit.id, planetId: cand.planetId, archetypeId,
                    morale: plan.tier.morale, tier: plan.tier.index };
      EventBus.emit('garrison:regrown', {
        empireId, year, ...out, limit: plan.limit, alive: aliveTotal + 1, shortfall: cand.shortfall,
      });
      return out;
    }
    const reason = refused > 0 ? 'create_failed' : 'no_free_hex';
    EventBus.emit('garrison:regrowthSkipped', { empireId, year, reason, alive: aliveTotal, limit: plan.limit });
    return { ok: false, reason, alive: aliveTotal, limit: plan.limit };
  }

  /**
   * G3-1 + G3-2 — kontrola roczna (co tick, tanio: porównanie roku). Najpierw odrastanie każdego zmobilizowanego
   * imperium — raz na każdy rok od `regrowthYear + 1` do bieżącego — potem, przy granicy roku, uzgodnienie:
   * imperium w wojnie bez mobilizacji mobilizuje się.
   */
  _yearlyCheck() {
    if (!this.enabled) return;
    const K = this._K();
    const reg = K?.empireRegistry;
    const now = K?.timeSystem?.gameTime;
    if (typeof reg?.listAll !== 'function' || !Number.isFinite(now)) return;
    const year = calendarYear(now);

    for (const emp of reg.listAll()) {
      if (!emp?.id || !this.isMobilized(emp.id)) continue;
      const last = emp.garrison?.regrowthYear;
      if (!Number.isFinite(last)) { reg.setGarrisonRegrowthYear?.(emp.id, year); continue; }   // zapis sprzed G3
      if (last >= year) continue;
      for (let y = last + 1; y <= year; y++) {
        for (let k = 0; k < GARRISON_REGROWTH_PER_YEAR; k++) {
          if (!this.regrowEmpire(emp.id, y).ok) break;
        }
      }
      reg.setGarrisonRegrowthYear?.(emp.id, year);
    }

    if (this._reconciledYear === null) { this._reconciledYear = year; return; }
    if (year <= this._reconciledYear) return;
    this._reconciledYear = year;
    for (const emp of reg.listAll()) {
      if (!emp?.id || this.isMobilized(emp.id) || !this.isAtWar(emp.id)) continue;
      this.mobilizeEmpire(emp.id, 'reconcile_yearly');
    }
  }

  // ── Usuwanie (D6, D16) ───────────────────────────────────────────────────────────────

  /**
   * D6 — ciało zmieniło właściciela: jednostki POPRZEDNIEGO właściciela na nim znikają (jeśli to imperium AI).
   * Jednostki gracza zostają — przy oddaniu ciała AI w traktacie obejmuje je flaga wycofania (R3, `WithdrawalSystem`).
   * Inne ciała — nietknięte.
   * @returns {number} ile jednostek usunięto
   */
  removeOnOwnerChange(planetId, previousOwner, via = 'owner_change') {
    if (!planetId || !previousOwner || previousOwner === 'player') return 0;
    return this._removeUnits(planetId, (u) => u.owner === previousOwner, 'owner_change', via);
  }

  /**
   * D16 — ciało zniszczone: znikają WSZYSTKIE jednostki naziemne na nim — imperiów AI i (R7, G2-4) gracza.
   * G2-4 F4 (Finding 367) — `bodyName` jedzie do śladu `garrison:unitsRemoved` (meldunek R7 nazywa ciało, którego encji
   * może już nie być).
   * @returns {number} ile jednostek usunięto
   */
  removeOnBodyDestroyed(planetId, via = 'destroyed', bodyName = null) {
    if (!planetId) return 0;
    const ai = this._removeUnits(planetId, (u) => !!u.owner && u.owner !== 'player', 'body_destroyed', via, null, bodyName);
    // R7 (G2-4, Finding 358 — decyzja właściciela 2026-10-03): jednostki GRACZA też znikają razem z ciałem, a ich POP
    //   wracają do domu W CAŁOŚCI (`releaseGroundUnitPops` — kolonia macierzysta z terminem właściciela; brak domu ⇒
    //   meldunek `groundUnit:popsLost`). Tak do G1c (potem rodzina „utrata POP”, kierunek 333). Osobny wpis audytu
    //   (`owners: ['player']`), żeby ślad jednostek AI został taki jak w C-S2.
    const cm = this._K()?.colonyManager;
    const pl = this._removeUnits(planetId, (u) => (u.owner ?? 'player') === 'player', 'body_destroyed', via,
      (u) => cm?.releaseGroundUnitPops?.(u, 'body_destroyed'), bodyName);
    return ai + pl;
  }

  _removeUnits(planetId, pick, cause, via, beforeRemove = null, bodyName = null) {
    const gum = this._K()?.groundUnitManager;
    if (typeof gum?.getUnitsOnPlanet !== 'function') return 0;
    const doomed = gum.getUnitsOnPlanet(planetId).filter(pick);
    for (const u of doomed) {
      beforeRemove?.(u);                              // R7 — zwolnienie POP gracza PRZED usunięciem (czyta jednostkę)
      gum.removeUnit(u.id);                           // `groundUnit:removed` → ArmySystem sprząta armie
    }
    if (doomed.length > 0) {
      EventBus.emit('garrison:unitsRemoved', {
        planetId, cause, via, count: doomed.length, bodyName: bodyName ?? null,
        owners: [...new Set(doomed.map(u => u.owner))], unitIds: doomed.map(u => u.id),
      });
    }
    return doomed.length;
  }

  // ── Uzgodnienie na pierwszym ticku ───────────────────────────────────────────────────

  _firstTick() {
    EventBus.off('time:tick', this._onFirstTick);
    if (this._reconciled) return;
    this._reconciled = true;
    this.reconcile('first_tick');
  }

  /**
   * Pierwszy tick po starcie sceny (nowa gra albo wczytanie): (C-S3) stempluje kafle kolonii AI bez właściciela,
   * potem mobilizuje każde imperium, które JEST w stanie wojny, a flagi nie ma (zapis sprzed G2-3b albo status
   * ustawiony bez zdarzenia).
   * @returns {{trigger:string, stampedTiles:number, mobilized:string[]}}
   */
  reconcile(trigger = 'first_tick') {
    const stampedTiles = this.stampAiColonyTiles();
    const reg = this._K()?.empireRegistry;
    const mobilized = [];
    for (const emp of reg?.listAll?.() ?? []) {
      if (!emp?.id || this.isMobilized(emp.id) || !this.isAtWar(emp.id)) continue;
      const res = this.mobilizeEmpire(emp.id, 'reconcile_at_war');
      if (res.ok) mobilized.push(emp.id);
    }
    return { trigger, stampedTiles, mobilized };
  }

  /**
   * C-S3 (Finding 318) — stempel właściciela na kaflach BEZ właściciela we wszystkich koloniach AI.
   * @returns {number} ile kafli ostemplowano
   */
  stampAiColonyTiles() {
    let stamped = 0;
    for (const colony of this._K()?.colonyManager?.getAllColonies?.() ?? []) {
      if (!colony?.ownerEmpireId || colony.ownerEmpireId === 'player') continue;
      stamped += stampUnownedTiles(colony.grid, colony.ownerEmpireId);
    }
    return stamped;
  }
}

export default GarrisonSystem;
