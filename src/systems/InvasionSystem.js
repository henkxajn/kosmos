// InvasionSystem — orkiestracja inwazji naziemnych (Faza 6)
//
// Domena gameState.invasions[invId] = {
//   id, planetId, aggressor, defender,
//   startYear, landedTroops[], active,
//   playerEmptySince — od którego civYear planeta nie ma obrońców
// }
//
// Triggery:
//   battle:resolved (wygrana obcego lub draw) z location=systemId gracza
//     → wyladuj troops na planecie gracza w tym systemie
//
// Capture:
//   Tick co 1 civYear — jeśli na planecie:
//     • są wrogie jednostki (owner != player)
//     • są 0 player ground units (militarne lub civilne)
//     • trwa już 3+ civYears
//   → ColonyManager.transferColony(planetId, aggressor)

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { INVASION_UNIT_POOLS } from '../data/GroundUnitData.js';
import { normalize as normalizeLocation } from '../utils/BattleLocation.js';

const CAPTURE_GRACE_YEARS = 3.0;
const MIN_SURVIVING_STRENGTH_TO_LAND = 30; // flota ABSTRAKCYJNA musi mieć min. siły
const TROOPS_PER_LANDING = 3;               // ile jednostek desantuje
/**
 * W3-6 — górna klamra desantu z REALNYCH kadłubów (jedna wygrana orbita = jedna fala).
 * ⚠ Świadomie NIE jest to odpowiednik `MIN_SURVIVING_STRENGTH_TO_LAND`: tamten próg mierzy
 * abstrakcyjną siłę floty i na ścieżce kadłubowej nie ma sensu (`lossesA` liczy tam STATKI,
 * nie HP — kolizja jednostek z W1 §Findings 3). Próg kadłubowy brzmi „czy ktokolwiek ocalały
 * potrafi zrzucić wojsko" i mieszka w `_onVesselGroupVictory`; ta stała ogranicza tylko ROZMIAR.
 */
const MAX_TROOPS_PER_VESSEL_LANDING = 6;

export class InvasionSystem {
  constructor() {
    this._tickAccum = 0;

    // Po każdej bitwie sprawdzamy desant
    EventBus.on('battle:resolved', (ev) => this._onBattleResolved(ev));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._tickCaptureChecks(steps);
      // Skan bezpieczeństwa: łapie stan, w którym event buildingCaptured już nie wróci
      // (stary save z przejętymi budynkami; ostatni wróg dobity PO przejęciu stolicy).
      this._tickPlayerConquestChecks();
    });

    // Player-side: przejęcie budynku przez gracza → natychmiastowa próba podboju (feedback).
    EventBus.on('groundUnit:buildingCaptured', (ev) => {
      if (ev?.newOwner === 'player') this._tryPlayerCapture(ev.planetId);
    });
  }

  // ── Read-only ────────────────────────────────────────────────

  listAll() {
    const inv = gameState.get('invasions') ?? {};
    return Object.values(inv);
  }
  listActive() { return this.listAll().filter(i => i.active); }
  getInvasionForPlanet(planetId) {
    return this.listActive().find(i => i.planetId === planetId) ?? null;
  }

  // ── Intent methods ───────────────────────────────────────────

  /**
   * Ląduj wojska na planecie.
   * @param {string} empireId — agresor
   * @param {string} planetId — cel (planeta gracza)
   * @param {number} troopCount — fallback ile jednostek gdy brak fleet.embarkedTroops
   * @param {string[]} [embarkedTroops] — konkretne archetypy do desantu (parity z graczem)
   */
  launchInvasion(empireId, planetId, troopCount = TROOPS_PER_LANDING, embarkedTroops = null) {
    const body = EntityManager.get(planetId);
    if (!body) return { success: false, reason: 'no_planet' };

    const reg = window.KOSMOS?.empireRegistry;
    const emp = reg?.get(empireId);
    if (!emp) return { success: false, reason: 'no_empire' };

    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return { success: false, reason: 'no_gum' };

    // Grid planety
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    const grid = colony?.grid;
    if (!grid) return { success: false, reason: 'no_grid' };

    // Lista archetypów do desantu: preferuj konkretne embarkedTroops (parity z graczem),
    // fallback na losowanie z puli archetypu imperium.
    let troops;
    if (Array.isArray(embarkedTroops) && embarkedTroops.length > 0) {
      troops = embarkedTroops.slice(0, troopCount);
    } else {
      const pool = INVASION_UNIT_POOLS[emp.archetype] ?? ['infantry', 'infantry'];
      troops = [];
      for (let i = 0; i < troopCount; i++) {
        troops.push(pool[Math.floor(Math.random() * pool.length)]);
      }
    }

    // Znajdź hexy landing: brzeg siatki, nie ocean, nie capital, nie pod wrogą jednostką
    const landingHexes = this._findLandingHexes(grid, colony);
    if (landingHexes.length === 0) {
      console.warn('[InvasionSystem] Brak miejsca do lądowania na', planetId);
      return { success: false, reason: 'no_landing_zone' };
    }

    const landed = [];
    for (let i = 0; i < troops.length; i++) {
      const hex = landingHexes[i % landingHexes.length];
      const type = troops[i];
      const unit = gum.createUnit(type, planetId, hex.q, hex.r, { owner: empireId });
      landed.push(unit.id);
    }

    // Zarejestruj w gameState.invasions
    const year = this._year();
    const invId = `inv_${empireId}_${planetId}_${year}`.replace(/\./g, '_');
    let inv = gameState.get(`invasions.${invId}`);
    if (!inv) {
      inv = {
        id:          invId,
        planetId,
        aggressor:   empireId,
        defender:    'player',
        startYear:   year,
        landedTroops: [],
        active:      true,
        playerEmptySince: null,
      };
    }
    inv.landedTroops = [...(inv.landedTroops ?? []), ...landed];
    gameState.set(`invasions.${invId}`, inv, 'invasion_launched');

    EventBus.emit('invasion:launched', { invasionId: invId, empireId, planetId, troops: landed.length });
    EventBus.emit('invasion:troopsLanded', { invasionId: invId, empireId, planetId, unitIds: landed });

    return { success: true, invasionId: invId, landed };
  }

  // ── Event handlers ───────────────────────────────────────────

  /**
   * W3-6 — DESANT Z BITWY PRAWDZIWYCH KADŁUBÓW.
   *
   * Ścieżka `participantA.type === 'empire'` niżej obsługuje WYŁĄCZNIE floty abstrakcyjne
   * (`empire.fleets[]`), a te w normalnej grze nie istnieją (audyt C-1/C-3: zero producentów).
   * Każda realna bitwa emituje `'vessel_group'` — DSCS i EnemyAttackHandler. Skutek: kierunek
   * AI→gracz był MARTWY na obu końcach, mimo że cała maszyneria lądowania i przejęcia działa
   * (używa jej gracz). To jest brakujące wejście, nie nowa maszyneria.
   *
   * ⚠ PRÓG DESANTU JEST WYPROWADZONY Z KADŁUBÓW, nie z abstrakcyjnej siły.
   * `MIN_SURVIVING_STRENGTH_TO_LAND = 30` nie ma znaczenia na tej ścieżce: `pA.strength` to
   * jednostka floty abstrakcyjnej, a `lossesA` w DSCS liczy STATKI, nie HP (W1 §Findings 3 —
   * kolizja jednostek pod tą samą nazwą pola). Zamiast przeliczać jedno na drugie pytamy
   * o rzecz, która ma sens fizyczny i jest lustrem wymagań GRACZA (`drop_pods` + ładownia):
   * **czy wśród OCALAŁYCH jest kadłub, który potrafi zrzucić wojsko**. Brak → brak desantu.
   *
   * ⚠ DOMINACJA ORBITALNA — ta sama bramka co u gracza (`playerHasOrbitalDominance` w UI
   * desantu). Wygrana bitwa nie wystarczy: trzeba TRZYMAĆ orbitę celu.
   */
  _onVesselGroupVictory({ result }) {
    const pA = result?.participantA;
    const pB = result?.participantB;
    if (pA?.type !== 'vessel_group') return;
    // Obrońcą musi być gracz. `{type:'player'}` bez `empireId` to kształt z EAH — W3-7 doda
    // tam stempel, więc akceptujemy oba zapisy, byle nie było to imperium.
    if (pB?.type !== 'player') return;
    if (result.winner !== 'A') return;                       // desantuje tylko zwycięzca

    const empireId = pA.empireId;
    if (!empireId) return;                                   // bez stempla właściciela — nie nasze
    const systemId = normalizeLocation(result.location).systemId;
    if (!systemId) return;

    // 1) DOMINACJA ORBITALNA nad układem celu.
    const controller = window.KOSMOS?.warSystem?.getOrbitalController?.(systemId);
    if (controller !== empireId) {
      EventBus.emit('invasion:blocked', { empireId, systemId, reason: 'no_orbital_dominance' });
      return;
    }

    // 2) OCALAŁE kadłuby zdolne do zrzutu — próg wyprowadzony z kadłubów.
    const vMgr = window.KOSMOS?.vesselManager;
    const ids = Array.isArray(pA.vesselIds) ? pA.vesselIds : [];
    const droppers = [];
    for (const vid of ids) {
      const v = vMgr?.getVessel?.(vid);
      if (!v || v.isWreck) continue;                         // poległ w tej właśnie bitwie
      if ((v.ownerEmpireId ?? v.owner) !== empireId) continue;
      if (!v.canDropTroops) continue;                        // brak modułu drop_pods
      if ((v.troopCapacity ?? 0) <= 0) continue;             // brak ładowni
      droppers.push(v);
    }
    if (droppers.length === 0) {
      // Wygrali orbitę, ale nie mają czym zejść na dół. To ta sama presja projektowa, co
      // u gracza: flota bojowa ≠ flota desantowa.
      EventBus.emit('invasion:blocked', { empireId, systemId, reason: 'no_drop_capable_hull' });
      return;
    }

    // 3) CEL — kolonia GRACZA w tym układzie, po STEMPLU WŁASNOŚCI (§Findings 20:
    //    `getAllColonies` zwraca kolonie wszystkich właścicieli).
    const colMgr = window.KOSMOS?.colonyManager;
    const targets = (colMgr?.getPlayerColonies?.() ?? []).filter(c =>
      EntityManager.get(c.planetId)?.systemId === systemId);
    if (targets.length === 0) return;
    const target = targets.find(c => c.isHomePlanet) ?? targets[0];

    // 4) SIŁA DESANTU = suma ładowni ocalałych zrzutowców (klamra, żeby jedna wygrana
    //    nie wysypywała armii; druga fala wymaga kolejnej wygranej orbity).
    const capacity = droppers.reduce((sum, v) => sum + (v.troopCapacity ?? 0), 0);
    const troopCount = Math.max(1, Math.min(MAX_TROOPS_PER_VESSEL_LANDING, Math.floor(capacity)));

    // Konkretne jednostki w ładowniach mają pierwszeństwo (parity z graczem); gdy pusto —
    // `launchInvasion` dobiera archetypy z puli imperium.
    const embarked = [];
    for (const v of droppers) {
      for (const uid of (v.groundUnits ?? [])) {
        const u = window.KOSMOS?.groundUnitManager?.getUnit?.(uid);
        if (u?.archetypeId ?? u?.type) embarked.push(u.archetypeId ?? u.type);
      }
    }

    this.launchInvasion(empireId, target.planetId, troopCount, embarked.length > 0 ? embarked : null);
  }

  _onBattleResolved({ warId, battleId, result }) {
    if (!result) return;
    const pA = result.participantA;
    const pB = result.participantB;
    // W3-6 — realne kadłuby mają WŁASNE wejście (abstrakcyjna gałąź niżej nie ma producenta).
    if (pA?.type === 'vessel_group') { this._onVesselGroupVictory({ result }); return; }
    if (pA?.type !== 'empire' || pB?.type !== 'player') return;
    // v66: location jest objectem {systemId, planetId, point}; normalize pokrywa
    // też legacy string.
    const systemId = normalizeLocation(result.location).systemId;
    if (!systemId) return;

    const empireId = pA.empireId;
    const startStr = pA.strength ?? 0;
    const survived = startStr - (result.lossesA ?? 0);
    if (survived < MIN_SURVIVING_STRENGTH_TO_LAND) return;

    // Faza desantu: sprawdź czy atakująca flota ma transport wojsk.
    // Bez `hasTroopTransport` flota może wygrać bitwę orbitalną, ale NIE desantuje.
    // To wymusza na AI dywersyfikację floty (walka vs transport) — analog gracza.
    const fleetId = pA.fleetId;
    const reg = window.KOSMOS?.empireRegistry;
    const empire = reg?.get(empireId);
    const fleet = empire?.fleets?.find(f => f.id === fleetId);
    const hasTransport = !!fleet?.hasTroopTransport;
    if (!hasTransport) {
      // Blokada się przedarła, ale nie ma czym desantować — tylko orbita.
      EventBus.emit('invasion:blocked', { empireId, systemId, reason: 'no_troop_transport' });
      return;
    }

    // Znajdź player colony w tym systemie — najlepsza (home jeśli możliwa)
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    const targets = colMgr.getAllColonies().filter(c => {
      const body = EntityManager.get(c.planetId);
      return body?.systemId === systemId;
    });
    if (targets.length === 0) return;

    // Prefer home, else first
    const target = targets.find(c => c.isHomePlanet) ?? targets[0];

    // Pojemność desantu zależy od floty (troopCapacity) z fallbackiem na stałą
    const troopCount = fleet.troopCapacity ?? TROOPS_PER_LANDING;
    // Konkretne archetypy załadowane na flocie (parity z graczem): jeśli puste — losowanie z puli
    const embarked = (fleet.embarkedTroops ?? []).slice();
    const res = this.launchInvasion(empireId, target.planetId, troopCount, embarked);

    // Po desancie: flota straciła ładunek — zeruj embarkedTroops (druga fala musi mieć nowe wojsko)
    if (res?.success && empire) {
      const nextFleets = (empire.fleets ?? []).map(f =>
        f.id === fleetId ? { ...f, embarkedTroops: [] } : f
      );
      gameState.set(`empires.${empireId}.fleets`, nextFleets, 'troops_disembarked');
    }
  }

  // ── Player-side conquest ─────────────────────────────────────
  //
  // Skan okresowy (1 civYear) — próbuje przejąć każde ciało AI. Konieczny obok
  // eventu buildingCaptured, bo event leci TYLKO w momencie przejęcia budynku:
  // na starym save (budynki przejęte w poprzedniej sesji) ani gdy ostatni wróg
  // ginie PO przejęciu stolicy — event już nie wróci, a skan wychwyci stan.
  _tickPlayerConquestChecks() {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return;
    for (const colony of colMgr.getAllColonies()) {
      if (!colony.ownerEmpireId || colony.ownerEmpireId === 'player') continue;
      this._tryPlayerCapture(colony.planetId);
    }
  }

  // Warunek podboju ciała AI przez gracza (jedno źródło prawdy dla eventu i skanu):
  //   • brak żywych wrogich jednostek naziemnych, ORAZ
  //   • kolonia MA stolicę → gracz jest właścicielem hexa capitalBase
  //   • kolonia NIE ma stolicy (outpost) → gracz kontroluje ≥1 hex z budynkiem
  // Zwraca true jeśli przejęto.
  _tryPlayerCapture(planetId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const gum = window.KOSMOS?.groundUnitManager;
    if (!colMgr || !gum) return false;

    const colony = colMgr.getColony(planetId);
    if (!colony) return false;
    // Już nasza (lub nie należy do imperium) — nic do przejęcia
    if (!colony.ownerEmpireId || colony.ownerEmpireId === 'player') return false;

    // Muszą zginąć wszyscy wrodzy obrońcy naziemni
    const enemyAlive = gum.getUnitsOnPlanet(planetId)
      .some(u => u.owner && u.owner !== 'player' && (u.hp ?? 0) > 0);
    if (enemyAlive) return false;

    const tiles = colony.grid?.toArray?.() ?? [];
    const capital = tiles.find(t => t?.capitalBase);
    if (capital) {
      // Pełna kolonia: wymagana stolica gracza
      if (capital.owner !== 'player') return false;
    } else {
      // Outpost bez stolicy: wymagany ≥1 przejęty hex z budynkiem
      const ownsBuilding = tiles.some(t => t && t.owner === 'player' && (t.buildingId || t.capitalBase));
      if (!ownsBuilding) return false;
    }

    return colMgr.captureColonyForPlayer?.(planetId, 'ground_invasion') === true;
  }

  // ── Tick: capture checks ─────────────────────────────────────

  _tickCaptureChecks(years) {
    const gum = window.KOSMOS?.groundUnitManager;
    const colMgr = window.KOSMOS?.colonyManager;
    if (!gum || !colMgr) return;

    const currentYear = this._year();
    for (const inv of this.listActive()) {
      const units = gum.getUnitsOnPlanet(inv.planetId);
      const enemyUnits = units.filter(u => u.owner && u.owner !== 'player' && (u.hp ?? 0) > 0);
      const playerMilitary = units.filter(u =>
        (u.owner === 'player' || !u.owner) &&
        u.role === 'military' &&
        (u.hp ?? 0) > 0
      );

      // Brak obcych → inwazja wygasa
      if (enemyUnits.length === 0) {
        const next = { ...inv, active: false, endYear: currentYear, endReason: 'defenders_repelled' };
        gameState.set(`invasions.${inv.id}`, next, 'invasion_repelled');
        EventBus.emit('invasion:repelled', { invasionId: inv.id, planetId: inv.planetId });
        continue;
      }

      // Faza 6.5: capture wymaga DWÓCH warunków naraz:
      //   (1) capital hex owned by aggressor
      //   (2) player nie ma żywych jednostek wojskowych na planecie
      // Gdy choćby jedna military żyje — gracz ma szansę odbić kapitał.
      const colony = colMgr.getColony(inv.planetId);
      const grid = colony?.grid;
      if (!grid) continue;
      const capital = grid.toArray().find(t => t?.capitalBase);
      if (!capital) continue;

      if (capital.owner === inv.aggressor && playerMilitary.length === 0) {
        this._captureColony(inv);
      }
    }
  }

  _captureColony(inv) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.transferColony) {
      console.warn('[InvasionSystem] ColonyManager.transferColony brak — nie mogę przejąć');
      return;
    }
    const year = this._year();
    const success = colMgr.transferColony(inv.planetId, inv.aggressor, 'invasion');
    if (!success) return;

    const next = {
      ...inv,
      active: false,
      endYear: year,
      endReason: 'colony_captured',
    };
    gameState.set(`invasions.${inv.id}`, next, 'invasion_successful');
    // colony:captured emituje ColonyManager.transferColony
  }

  /** Dostępne brzegowe hexy do lądowania (poza centralnymi, bez oceanu, bez wrogich jednostek). */
  _findLandingHexes(grid, colony) {
    const edgeHexes = [];
    const fallback = [];
    const gum = window.KOSMOS?.groundUnitManager;
    const allTiles = grid.toArray();  // HexGrid.toArray() — pełna lista

    for (const tile of allTiles) {
      if (!tile) continue;
      if (tile.type === 'ocean') continue;
      if (tile.capitalBase) continue;
      if (gum?.getUnitAt(colony.planetId, tile.q, tile.r)) continue;

      const isEdge = this._isEdgeHex(grid, tile);
      if (isEdge) edgeHexes.push({ q: tile.q, r: tile.r });
      else fallback.push({ q: tile.q, r: tile.r });
    }

    const pool = edgeHexes.length > 0 ? edgeHexes : fallback;
    // Shuffle (nie zawsze te same hexy)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  _isEdgeHex(grid, tile) {
    // Brzegowe hexy mają mniej niż 6 sąsiadów (pierwsza/ostatnia row, brzeg mapy).
    const neighbors = grid.getNeighbors ? grid.getNeighbors(tile.q, tile.r) : [];
    return neighbors.length < 6;
  }

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }
}
