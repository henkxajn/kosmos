// WarSystem — śledzenie wojen w czasie
//
// Domena: gameState.wars[warId] = {
//   id, aggressor, defender, casusBelli,
//   startYear, fronts: [{systemId, controller}],
//   exhaustion: {player, empireId},
//   battles: [battleId],
//   active: bool,
// }
//
// Domena: gameState.battles[battleId] = wynik BattleSystem.resolveBattle(...)
//
// Automatyczne reguły:
//   diplomacy:warDeclared → utwórz wpis wojny z inferred casus belli
//   diplomacy:peaceSigned → zamknij wojnę (active=false)
//   Tick co 1 civYear:
//     - Floty obce z destSystemId i etaYear <= currentYear → przybywa do systemu
//     - Jeśli po przybyciu w systemie jest kolonia gracza LUB flota gracza → BATTLE
//     - Exhaustion rośnie proporcjonalnie do bitew × casusBelli.exhaustionRate
//     - Gdy exhaustion.player LUB exhaustion.defender >= 100 → auto-peace
//
// Na razie (Faza 4) AI obcych nie wysyła flot agresywnie — to Faza 7.
// Tutaj wojna to logika + reaktywne starcie gdy gracz staje na ich drodze.

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { resolveBattle, empireFleetToBattleUnit, playerVesselsToBattleUnit } from './BattleSystem.js';
import { CASUS_BELLI, inferCasusBelli } from '../data/CasusBelliData.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';

const EXHAUSTION_PER_BATTLE = 15;   // ile exhaustion rośnie za pojedynczą bitwę
const AUTO_PEACE_EXHAUSTION = 100;  // próg auto-peace
const FLEET_AGGRO_INTERVAL  = 5;    // co ile lat AI wysyła flotę w stronę gracza

export class WarSystem {
  constructor() {
    this._tickAccum = 0;

    EventBus.on('diplomacy:warDeclared', ({ empireId, reason }) => this._onWarDeclared(empireId, reason));
    EventBus.on('diplomacy:peaceSigned', ({ empireId }) => this._onPeaceSigned(empireId));

    EventBus.on('time:tick', ({ civDeltaYears }) => {
      if (!civDeltaYears) return;
      this._tickAccum += civDeltaYears;
      if (this._tickAccum < 1.0) return;
      const steps = Math.floor(this._tickAccum);
      this._tickAccum -= steps;
      this._tickAll(steps);
    });
  }

  // ── Read-only ────────────────────────────────────────────────

  listActive() {
    const wars = gameState.get('wars') ?? {};
    return Object.values(wars).filter(w => w.active);
  }
  listAll() {
    const wars = gameState.get('wars') ?? {};
    return Object.values(wars);
  }
  getWar(warId) { return gameState.get(`wars.${warId}`) ?? null; }

  /** Zwraca aktywną wojnę z danym imperium (gracz jako agresor lub obrońca) */
  getWarWith(empireId) {
    return this.listActive().find(w =>
      (w.aggressor === 'player' && w.defender === empireId) ||
      (w.defender === 'player' && w.aggressor === empireId)
    ) ?? null;
  }

  // ── Intent methods ───────────────────────────────────────────

  /**
   * Ręczne utworzenie wpisu wojny. Zazwyczaj wywoływane przez handler
   * diplomacy:warDeclared — ale dostępne dla debugowania.
   */
  createWar(aggressor, defender, casusBelliId = 'border_incident') {
    const warId = `war_${aggressor}_${defender}_${this._year()}`.replace(/\./g, '_');
    if (this.getWar(warId)) return this.getWar(warId);
    const war = {
      id:         warId,
      aggressor,
      defender,
      casusBelli: casusBelliId,
      startYear:  this._year(),
      fronts:     [],
      exhaustion: { [aggressor]: 0, [defender]: 0 },
      battles:    [],
      active:     true,
    };
    gameState.set(`wars.${warId}`, war, 'war_created');
    EventBus.emit('war:declared', { warId, aggressor, defender, casusBelli: casusBelliId });
    return war;
  }

  /** Dodaje front (kontroler aktualny = brak lub kto trzyma system) */
  addFront(warId, systemId, controller = null) {
    const war = this.getWar(warId);
    if (!war) return false;
    if (war.fronts.some(f => f.systemId === systemId)) return false;
    const next = { ...war, fronts: [...war.fronts, { systemId, controller }] };
    gameState.set(`wars.${warId}`, next, 'front_added');
    return true;
  }

  changeExhaustion(warId, side, delta, reason = '') {
    const war = this.getWar(warId);
    if (!war) return;
    const oldV = war.exhaustion?.[side] ?? 0;
    const newV = Math.max(0, Math.min(100, oldV + delta));
    if (newV === oldV) return;
    const next = { ...war, exhaustion: { ...war.exhaustion, [side]: newV } };
    gameState.set(`wars.${warId}`, next, `exhaustion_${side}_${delta}_${reason}`);

    // Auto-peace gdy któryś przekroczy próg
    if (newV >= AUTO_PEACE_EXHAUSTION) {
      this._triggerAutoPeace(warId, side);
    }
  }

  /** Rekord wyniku bitwy — przypisuje do wojny + zapisuje w gameState.battles. */
  recordBattle(warId, result) {
    const war = this.getWar(warId);
    if (!war) return null;
    const year = this._year();
    const battleId = `battle_${year}_${warId}_${war.battles.length + 1}`.replace(/\./g, '_');
    const battleRec = {
      id: battleId,
      warId,
      year,
      location: result.location ?? null,
      winner:   result.winner,
      retreated: result.retreated ?? null,
      lossesA: result.lossesA ?? 0,
      lossesB: result.lossesB ?? 0,
      turns:   result.turns ?? 0,
      participantA: result.participantA ?? null,
      participantB: result.participantB ?? null,
      timeline: result.timeline ?? [],
    };
    gameState.set(`battles.${battleId}`, battleRec, 'battle_recorded');
    const nextWar = { ...war, battles: [...war.battles, battleId] };
    gameState.set(`wars.${warId}`, nextWar, 'war_battle_appended');

    // Exhaustion +X obu stron, skalowany przez casusBelli.exhaustionRate
    const cb = CASUS_BELLI[war.casusBelli] ?? CASUS_BELLI.border_incident;
    const rate = cb.exhaustionRate ?? 1.0;
    this.changeExhaustion(warId, war.aggressor, EXHAUSTION_PER_BATTLE * rate, 'battle');
    this.changeExhaustion(warId, war.defender, EXHAUSTION_PER_BATTLE * rate, 'battle');

    EventBus.emit('battle:resolved', { warId, battleId, result: battleRec });

    // Faza desantu: ustaw dominację orbitalną nad systemem bitwy
    this._updateOrbitalDominance(battleRec);

    return battleRec;
  }

  /**
   * Ustaw gameState.orbitalDominance[systemId] = { controllerId, year }
   * po rozstrzygnięciu bitwy. Controller = empireId (A wygrał) lub 'player' (B wygrał).
   * Draw → bez zmiany (poprzedni controller pozostaje).
   * Emituje battle:orbitalDominance dla InvasionSystem i UI.
   */
  _updateOrbitalDominance(battleRec) {
    const systemId = battleRec.location;
    if (!systemId || !battleRec.winner || battleRec.winner === 'draw') return;

    const winnerPart = battleRec.winner === 'A' ? battleRec.participantA : battleRec.participantB;
    if (!winnerPart) return;
    const controllerId = winnerPart.empireId ?? (winnerPart.type === 'player' ? 'player' : null);
    if (!controllerId) return;

    const year = this._year();
    gameState.set(`orbitalDominance.${systemId}`, { controllerId, year }, 'battle_resolved');
    EventBus.emit('battle:orbitalDominance', { systemId, controllerId, year });
  }

  /**
   * Natychmiastowe wymuszenie bitwy (debug / UI "Force Battle").
   * Wybiera najsilniejszą flotę imperium, ustawia ją w systemie gracza,
   * od razu rozstrzyga bitwę i zapisuje wynik. Nie czeka na tick.
   */
  forceBattle(warId) {
    const war = this.getWar(warId);
    if (!war?.active) return { success: false, reason: 'war_inactive' };
    const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
    const reg = window.KOSMOS?.empireRegistry;
    const homePlanet = window.KOSMOS?.homePlanet;
    if (!reg || !homePlanet) return { success: false, reason: 'no_registry_or_home' };
    const emp = reg.get(empireId);
    if (!emp) return { success: false, reason: 'no_empire' };
    const fleets = emp.fleets ?? [];
    if (fleets.length === 0) return { success: false, reason: 'no_fleet' };
    // Najsilniejsza flota
    const fleet = fleets.slice().sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))[0];
    const playerSystemId = homePlanet.systemId ?? 'sys_home';

    // Teleportuj flotę do systemu gracza
    const updated = fleets.map(f => f.id === fleet.id
      ? { ...f, systemId: playerSystemId, destSystemId: null, etaYear: null }
      : f);
    gameState.set(`empires.${empireId}.fleets`, updated, 'force_battle_teleport');

    // Rozstrzygnij bitwę i zapisz wynik
    const fleetUnit = empireFleetToBattleUnit(fleet, emp, fleet.id);
    const playerUnit = this._buildPlayerBattleUnit(playerSystemId);
    const result = resolveBattle(fleetUnit, playerUnit, {
      casusBelli: war.casusBelli,
      location:   playerSystemId,
      seed:       Math.floor(this._year() * 7919 + fleet.strength) & 0x7FFFFFFF,
    });

    // Straty dla floty obcej
    const newStrength = Math.max(0, fleet.strength - result.lossesA);
    reg.updateFleetStrength(empireId, fleet.id, newStrength, 'force_battle_damage');

    // Zapisz bitwę
    const recordedResult = {
      ...result,
      location: playerSystemId,
      participantA: { type: 'empire', empireId, fleetId: fleet.id, strength: fleet.strength },
      participantB: { type: 'player', systemId: playerSystemId },
    };
    const rec = this.recordBattle(warId, recordedResult);
    return { success: true, battle: rec, result };
  }

  // ── Event handlers ───────────────────────────────────────────

  _onWarDeclared(empireId, reason) {
    // Gracz zawsze agresorem gdy wojnę wypowiedział player przez DiplomacyOverlay
    // W przypadku auto-war (threshold hostility) → imperium agresorem
    const isPlayerAction = (reason === 'player_action');
    const aggressor = isPlayerAction ? 'player' : empireId;
    const defender  = isPlayerAction ? empireId  : 'player';

    // Inferuj casus belli z relacji
    const rel = window.KOSMOS?.diplomacySystem?.getRelation(empireId);
    const emp = window.KOSMOS?.empireRegistry?.get(empireId);
    const cbId = inferCasusBelli(rel, emp?.archetype);

    this.createWar(aggressor, defender, cbId);
  }

  _onPeaceSigned(empireId) {
    const war = this.getWarWith(empireId);
    if (!war) return;
    const next = { ...war, active: false, endYear: this._year() };
    gameState.set(`wars.${war.id}`, next, 'peace_signed');
    EventBus.emit('war:peaceSigned', { warId: war.id, empireId });
  }

  _triggerAutoPeace(warId, exhaustedSide) {
    const war = this.getWar(warId);
    if (!war || !war.active) return;
    const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
    const dipl = window.KOSMOS?.diplomacySystem;
    if (!dipl) return;
    // Wymuszenie pokoju — exhaustion >= 100 oznacza, że strona już nie może walczyć
    dipl.offerPeace(empireId, `exhaustion_${exhaustedSide}`);
  }

  // ── Ticker ───────────────────────────────────────────────────

  _tickAll(years) {
    const active = this.listActive();
    if (active.length === 0) return;

    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return;

    // Przemieszczaj floty obce, które mają ETA
    for (const war of active) {
      const empireId = war.aggressor === 'player' ? war.defender : war.aggressor;
      const emp = reg.get(empireId);
      if (!emp) continue;

      for (const fleet of emp.fleets ?? []) {
        if (!fleet.destSystemId || fleet.etaYear == null) continue;
        if (this._year() < fleet.etaYear) continue;
        // Flota dotarła
        this._fleetArrived(war, emp, fleet);
      }
    }

    // Faza 7: agresję AI przejął MilitaryAI (tick w AlienCivSystem).
    // WarSystem ogranicza się do przetwarzania dotarłych flot i rozstrzygania bitew.
  }

  _aiSendFleet_deprecated(war) {
    // DEPRECATED: Faza 7 przeniosła tę logikę do MilitaryAI.attack_player.
    // Pozostawione puste na wypadek referencji w starych save.
    return;
  }

  _fleetArrived(war, empire, fleet) {
    const reg = window.KOSMOS?.empireRegistry;
    // Flota doleciała do destSystemId — czy jest tam gracz?
    const destSystemId = fleet.destSystemId;
    const playerPresent = this._isPlayerInSystem(destSystemId);

    // Zawsze: flota teraz "mieszka" w destSystemId
    reg.updateFleetStrength(empire.id, fleet.id, fleet.strength, 'arrived'); // no-op na strength, ale triggers save
    // Zerowanie dest + etaYear:
    const fleets = [...(empire.fleets ?? [])];
    const idx = fleets.findIndex(f => f.id === fleet.id);
    if (idx >= 0) {
      fleets[idx] = { ...fleets[idx], systemId: destSystemId, destSystemId: null, etaYear: null };
      gameState.set(`empires.${empire.id}.fleets`, fleets, 'fleet_arrived');
    }

    if (!playerPresent) return;

    // BITWA
    const fleetUnit = empireFleetToBattleUnit(fleet, empire, fleet.id);
    const playerUnit = this._buildPlayerBattleUnit(destSystemId);
    const result = resolveBattle(fleetUnit, playerUnit, {
      casusBelli: war.casusBelli,
      location:   destSystemId,
      seed:       Math.floor(this._year() * 7919 + fleet.strength) & 0x7FFFFFFF,
    });

    // Aplikuj straty — flota obca pomniejszona o lossesA
    const newStrength = fleet.strength - result.lossesA;
    reg.updateFleetStrength(empire.id, fleet.id, newStrength, 'battle_damage');

    // Zapisz bitwę
    const recordedResult = {
      ...result,
      location: destSystemId,
      participantA: { type: 'empire', empireId: empire.id, fleetId: fleet.id, strength: fleet.strength },
      participantB: { type: 'player', systemId: destSystemId },
    };
    this.recordBattle(war.id, recordedResult);
  }

  _isPlayerInSystem(systemId) {
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr) return false;
    // Gracz obecny, jeśli ma kolonię w tym systemie
    return colMgr.getAllColonies().some(c => {
      return this._getBodySystemId(c.planetId) === systemId;
    });
  }

  _getBodySystemId(planetId) {
    if (!planetId) return null;
    const body = EntityManager.get(planetId);
    return body?.systemId ?? null;
  }

  _buildPlayerBattleUnit(systemId) {
    const vMgr = window.KOSMOS?.vesselManager;
    const colMgr = window.KOSMOS?.colonyManager;
    // Bierz TYLKO statki gracza w tym systemie — wrogie vessele nie mogą wzmacniać
    // obrony gracza. Bez filtra wrogi statek "walczył sam ze sobą".
    const vessels = vMgr?._vessels
      ? Array.from(vMgr._vessels.values()).filter(v =>
          v.systemId === systemId && !isEnemyVessel(v)
        )
      : [];

    // Zbierz statki + dodaj obronę z kolonii (fleet bazowy per kolonia)
    let unit = playerVesselsToBattleUnit(vessels, HULLS, SHIP_MODULES, 'Gracz');

    // Jeśli brak statków — obrona minimalna z kolonii (100 HP)
    if (!vessels.length) {
      const hasColony = colMgr?.getAllColonies().some(c => this._getBodySystemId(c.planetId) === systemId);
      if (hasColony) {
        unit = {
          label: 'Obrona kolonii',
          hp: 150, shieldHP: 0, armor: 2, evasion: 0.05,
          techMult: 1.0, morale: 1.0,
          weapons: [{ damage: 8, tracking: 0.6 }],
        };
      }
    }
    return unit;
  }

  // ── Pomocnicze ───────────────────────────────────────────────

  _year() { return window.KOSMOS?.timeSystem?.gameTime ?? 0; }

  /**
   * Kto kontroluje orbitę systemu (po ostatniej bitwie)?
   * @param {string} systemId
   * @returns {string|null} 'player' | empireId | null (nigdy nie było bitwy)
   */
  getOrbitalController(systemId) {
    return gameState.get(`orbitalDominance.${systemId}`)?.controllerId ?? null;
  }

  /**
   * Czy w systemie jest aktywna flota wroga (strength > 0)?
   * Używane do semantyki dominacji: pusta orbita = brak oporu = dominance domyślnie gracza.
   * @param {string} systemId
   * @returns {boolean}
   */
  _hasHostileFleetInSystem(systemId) {
    if (!systemId) return false;
    const reg = window.KOSMOS?.empireRegistry;
    if (!reg) return false;
    const empires = reg.listAll?.() ?? [];
    for (const emp of empires) {
      if (!emp?.fleets) continue;
      for (const f of emp.fleets) {
        if ((f.strength ?? 0) <= 0) continue;
        if (f.systemId === systemId || f.destSystemId === systemId) return true;
      }
    }
    return false;
  }

  /**
   * Czy gracz ma dominację orbitalną nad planetą?
   * Używane przez ColonyOverlay (drop mode, orbital strike UI) i dropTroop().
   *
   * Dominacja gracza obowiązuje gdy:
   *  (a) explicit: controller == 'player' (po wygranej bitwie), LUB
   *  (b) domyślnie: w systemie NIE MA wrogiej floty z strength > 0.
   *
   * Pusty system = brak oporu = orbita bezpieczna. Jeśli flota wroga przybędzie,
   * dominacja znika automatycznie i gracz musi wygrać walkę, by znowu móc desantować.
   *
   * @param {string} planetId
   * @returns {boolean}
   */
  playerHasOrbitalDominance(planetId) {
    const sysId = this._getBodySystemId(planetId);
    if (!sysId) return false;
    const ctrl = this.getOrbitalController(sysId);
    if (ctrl === 'player') return true;
    if (ctrl) return false; // kontroler to wrogie imperium → player nie ma
    // Brak explicit controller — sprawdź czy w systemie jest wroga flota
    return !this._hasHostileFleetInSystem(sysId);
  }

  /**
   * Kto kontroluje orbitę konkretnej planety (pochodna getOrbitalController).
   * @param {string} planetId
   * @returns {string|null}
   */
  getPlanetOrbitalController(planetId) {
    const sysId = this._getBodySystemId(planetId);
    if (!sysId) return null;
    return this.getOrbitalController(sysId);
  }
}
