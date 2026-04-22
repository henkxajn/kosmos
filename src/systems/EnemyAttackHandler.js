// EnemyAttackHandler — obsługa wrogiego vessela z misją 'attack'.
//
// Wrogi vessel (isEnemy=true) z mission.type='attack' leci na zadeklarowaną planetę
// gracza. Po dotarciu (event vessel:arrived) odpala realną bitwę:
//   • stats wroga z modułów (vesselToBattleUnit)
//   • stats gracza z jego vesseli w tym samym systemie + obrona kolonii
//   • BattleSystem.resolveBattle deterministyczny
// Emituje battle:resolved zgodny z WarSystem (EventLog + cinematic odpalają się
// przez istniejące handlery w GameScene).
//
// Ścieżka ta przygotowuje grunt pod AI: gdy AI wroga zbuduje statek i wyśle na
// gracza, użyje dokładnie tego samego flow (createVessel → mission 'attack' → arrive).

import EventBus from '../core/EventBus.js';
import EntityManager from '../core/EntityManager.js';
import gameState from '../core/GameState.js';
import { resolveBattle, playerVesselsToBattleUnit } from './BattleSystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';

// Okno czasu (ms realnych) na dołączenie kolejnych wrogów do tej samej bitwy.
// Jeśli wrogi vessel #A przyleci, a w ciągu BATTLE_BATCH_WINDOW_MS dotrze #B
// do tej samej planety, walczą razem (zagregowani). Bez tego każdy vessel
// odpalał osobną sekwencyjną bitwę.
const BATTLE_BATCH_WINDOW_MS = 500;

export class EnemyAttackHandler {
  constructor() {
    // Map<planetId, { arrivedVesselIds: Set, timerId, firstVesselYear }>
    this._pendingBattles = new Map();

    EventBus.on('vessel:arrived', ({ vessel, mission }) => {
      this._onVesselArrived(vessel, mission);
    });
  }

  _onVesselArrived(vessel, mission) {
    if (!vessel || !mission) return;
    if (mission.type !== 'attack') return;
    if (!isEnemyVessel(vessel)) return;

    const K = window.KOSMOS;
    if (!K?.civMode) return;

    const targetPlanetId = mission.targetId;
    if (!targetPlanetId) return;

    // Zaplanuj zbiorową bitwę na tej planecie. Kolejni wrogowie dołączają
    // do tej samej, bez resetowania timer'a.
    const pending = this._pendingBattles.get(targetPlanetId);
    if (pending) {
      pending.arrivedVesselIds.add(vessel.id);
      return;
    }

    const firstYear = K.timeSystem?.gameTime ?? 0;
    const rec = {
      arrivedVesselIds: new Set([vessel.id]),
      firstVesselYear:  firstYear,
      timerId: null,
    };
    this._pendingBattles.set(targetPlanetId, rec);

    rec.timerId = setTimeout(() => {
      this._resolveBatchedBattle(targetPlanetId);
    }, BATTLE_BATCH_WINDOW_MS);
  }

  // Zbiera wszystkich wrogów orbitujących daną planetę (nowo-przybyłych +
  // zwycięzców poprzednich bitew, którzy tam stoją), agreguje ich stats
  // przez playerVesselsToBattleUnit (helper do sumowania vesseli wielu).
  // Jedna bitwa, wspólny wynik dla wszystkich.
  _resolveBatchedBattle(planetId) {
    const K = window.KOSMOS;
    const pending = this._pendingBattles.get(planetId);
    this._pendingBattles.delete(planetId);
    if (!K?.civMode || !pending) return;

    const warSys = K.warSystem;
    const evtLog = K.eventLogSystem;
    const vMgr   = K.vesselManager;
    const reg    = K.empireRegistry;
    const dipl   = K.diplomacySystem;

    if (!vMgr?._vessels) return;

    // Zbierz obecnych wrogów orbitujących tę planetę (w tym nowo-przybyłych
    // których VesselManager już zrobił state='orbiting'). Nie tylko arrivedVesselIds —
    // również wcześniejsi zwycięzcy którzy już stoją na orbicie.
    const allEnemies = [];
    for (const v of vMgr._vessels.values()) {
      if (!isEnemyVessel(v) || v.isWreck) continue;
      if (v.position?.state !== 'orbiting') continue;
      if (v.position.dockedAt !== planetId) continue;
      allEnemies.push(v);
    }

    if (allEnemies.length === 0) return;

    // Podstawowe dane — imperium pierwszego wroga (z arrivedVesselIds).
    const firstArrivedId = Array.from(pending.arrivedVesselIds)[0];
    const firstVessel    = vMgr.getVessel(firstArrivedId) ?? allEnemies[0];
    const empireId       = firstVessel.ownerEmpireId ?? firstVessel.owner;
    const empire         = empireId ? reg?.get?.(empireId) : null;
    const systemId       = firstVessel.systemId ?? K.activeSystemId ?? 'sys_home';
    const year           = K.timeSystem?.gameTime ?? pending.firstVesselYear;

    // Wojna — zadeklaruj jeśli brak
    let war = warSys?.getWarWith?.(empireId);
    if (!war?.active) {
      if (dipl?.declareWar) {
        dipl.declareWar(empireId, 'enemy_attack_arrived');
        war = warSys?.getWarWith?.(empireId);
      } else if (warSys?.createWar) {
        warSys.createWar(empireId, 'player', 'debug_attack');
        war = warSys.getWarWith(empireId);
      }
    }

    // Zagreguj stats wrogów — tę funkcję reużywamy (nazwa zawodząca, ale
    // faktycznie agreguje DOWOLNE vessele z modułami; oryginalnie player).
    const enemyUnit = playerVesselsToBattleUnit(
      allEnemies, HULLS, SHIP_MODULES,
      allEnemies.length > 1
        ? `${empire?.name ?? 'Flota wroga'} (${allEnemies.length} statków)`
        : `${empire?.name ?? 'Wróg'} — ${firstVessel.name ?? firstVessel.shipId}`
    );

    const playerUnit = warSys?._buildPlayerBattleUnit?.(systemId) ?? {
      label: 'Gracz',
      hp: 30, shieldHP: 0, armor: 0, evasion: 0.02,
      techMult: 1.0, morale: 1.0,
      weapons: [{ damage: 2, tracking: 0.5 }],
    };

    // Seed deterministyczny — rok + suma hash wrogów
    let seedSum = 0;
    for (const v of allEnemies) seedSum += this._hashStr(v.id);
    const seed = (year * 7919 + seedSum) & 0x7FFFFFFF;
    const result = resolveBattle(enemyUnit, playerUnit, {
      casusBelli: war?.casusBelli ?? 'border_incident',
      location:   systemId,
      seed,
    });

    const battleRec = {
      ...result,
      location: systemId,
      participantA: {
        type: 'vessel_group',
        empireId,
        vesselIds: allEnemies.map(v => v.id),
        count:     allEnemies.length,
        hp:        enemyUnit.hp,
        label:     enemyUnit.label,
      },
      participantB: {
        type: 'player',
        systemId,
      },
    };

    if (war) {
      const battleId = `battle_${year.toFixed(2)}_${empireId}_batch_${firstArrivedId}`.replace(/\./g, '_');
      battleRec.id = battleId;
      battleRec.warId = war.id;
      battleRec.year = year;
      gameState.set(`battles.${battleId}`, battleRec, 'enemy_attack_arrived');

      if (result.winner === 'A') {
        gameState.set(`orbitalDominance.${systemId}`, { controllerId: empireId, year }, 'enemy_attack_win');
      } else if (result.winner === 'B') {
        gameState.set(`orbitalDominance.${systemId}`, { controllerId: 'player', year }, 'enemy_attack_loss');
      }
      EventBus.emit('battle:resolved', { warId: war.id, battleId, result: battleRec });
    } else {
      evtLog?.push({
        text: `⚔ Bitwa w ${systemId}: ${enemyUnit.label} vs Gracz. Zwycięzca: ${result.winner === 'A' ? 'wróg' : result.winner === 'B' ? 'gracz' : 'remis'}.`,
        channel: 'combat',
        severity: result.winner === 'A' ? 'alert' : 'info',
        entityRef: systemId,
      });
    }

    // Skutki — dotyczą wszystkich wrogów biorących udział
    if (result.winner === 'A') {
      // Wrogowie wygrali — zostają na orbicie, flota gracza w systemie → wraki
      for (const v of allEnemies) {
        v.position.state = 'orbiting';
        v.position.dockedAt = planetId;
        v.status = 'idle';
        v.mission = null;
      }
      this._wreckPlayerVesselsInSystem(systemId, year);
    } else if (result.winner === 'B') {
      // Gracz wygrał — wszyscy wrogowie stają się wrakami
      for (const v of allEnemies) {
        this._turnIntoWreck(v, planetId, year);
      }
      const count = allEnemies.length;
      evtLog?.push({
        text: count > 1
          ? `💥 ${count} wrogich statków zestrzelonych nad ${systemId}.`
          : `💥 Wrogi statek "${firstVessel.name ?? '?'}" zestrzelony nad ${systemId}.`,
        channel: 'combat',
        severity: 'info',
        entityRef: systemId,
      });
    } else {
      // Draw — oboje tracą
      for (const v of allEnemies) this._turnIntoWreck(v, planetId, year);
      this._wreckPlayerVesselsInSystem(systemId, year);
      evtLog?.push({
        text: `💥 Bitwa nad ${systemId} — remis. Obie floty zniszczone (${allEnemies.length} wroga).`,
        channel: 'combat',
        severity: 'warn',
        entityRef: systemId,
      });
    }
  }

  // Konwertuje vessel na wrak — zachowuje go w VesselManager z nowym stanem.
  // Pozycja (r, θ, φ) jest zarządzana przez OrbitalSpaceSystem.transitionToWreck
  // — wrak trafia do graveyard range (r 1.2–1.5) z gwarantowaną separacją od
  // żywych statków dzięki min-angular-spacing.
  _turnIntoWreck(vessel, dockedAt, year) {
    if (!vessel || vessel.isWreck) return;
    vessel.isWreck           = true;
    vessel.status           = 'destroyed';
    vessel.mission          = null;
    vessel.wreckedAt        = year;
    vessel.position.state   = 'orbiting';
    vessel.position.dockedAt = dockedAt ?? vessel.position.dockedAt ?? null;
    vessel.fuel && (vessel.fuel.current = 0);

    // Przenieś do warstwy graveyard w OrbitalSpaceSystem. Ten system emituje
    // 'orbit:assigned' którego słucha ThreeRenderer i aktualizuje wizualnie.
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital && vessel.position.dockedAt) {
      if (orbital.hasOrbit(vessel.id)) {
        orbital.transitionToWreck(vessel.id, year);
      } else {
        orbital.assignOrbit(vessel.position.dockedAt, vessel.id, 'wreck');
      }
      // Pierwsza synchronizacja pozycji 2D dla tactical map — inaczej wrak
      // stoi w pozycji planety aż do pierwszego _updatePositions tick'a.
      const body = EntityManager.get(vessel.position.dockedAt);
      if (body) {
        const tSec = performance.now() * 0.001;
        const pos = orbital.getPosition(
          vessel.id,
          { x: body.x / 10, z: body.y / 10 },
          tSec
        );
        if (pos) {
          vessel.position.x = pos.x * 10;
          vessel.position.y = pos.z * 10;
        }
      }
    }

    EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
  }

  _wreckPlayerVesselsInSystem(systemId, year) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return;
    for (const v of vMgr._vessels.values()) {
      if (isEnemyVessel(v)) continue;
      if (v.isWreck)         continue;
      if ((v.systemId ?? 'sys_home') !== systemId) continue;
      this._turnIntoWreck(v, v.position?.dockedAt ?? null, year);
    }
  }

  _hashStr(s) {
    let h = 0;
    for (let i = 0; i < (s?.length ?? 0); i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
