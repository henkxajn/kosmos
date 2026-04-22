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
import { resolveBattle, vesselToBattleUnit } from './BattleSystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isEnemyVessel } from '../entities/Vessel.js';

export class EnemyAttackHandler {
  constructor() {
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

    const warSys = K.warSystem;
    const evtLog = K.eventLogSystem;
    const vMgr   = K.vesselManager;
    const reg    = K.empireRegistry;
    const dipl   = K.diplomacySystem;

    const empireId  = vessel.ownerEmpireId ?? vessel.owner;
    const empire    = empireId ? reg?.get?.(empireId) : null;
    const systemId  = vessel.systemId ?? K.activeSystemId ?? 'sys_home';
    const year      = K.timeSystem?.gameTime ?? 0;

    // 1) Upewnij się że jest wojna — debug spawn może nie przechodzić przez declareWar
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

    // 2) Zbuduj jednostki bitwy
    const enemyUnit = vesselToBattleUnit(
      vessel, HULLS, SHIP_MODULES,
      `${empire?.name ?? 'Wróg'} — ${vessel.name ?? vessel.shipId}`
    );
    const playerUnit = warSys?._buildPlayerBattleUnit?.(systemId) ?? {
      label: 'Gracz',
      hp: 150, shieldHP: 0, armor: 2, evasion: 0.05,
      techMult: 1.0, morale: 1.0,
      weapons: [{ damage: 8, tracking: 0.6 }],
    };

    // 3) Deterministyczny seed — vessel id + rok
    const seed = (year * 7919 + this._hashStr(vessel.id)) & 0x7FFFFFFF;
    const result = resolveBattle(enemyUnit, playerUnit, {
      casusBelli: war?.casusBelli ?? 'border_incident',
      location:   systemId,
      seed,
    });

    // 4) Przepisz wynik zgodnie z formatem BattleSystem (A=atakujący, B=obrońca)
    const battleRec = {
      ...result,
      location: systemId,
      participantA: {
        type: 'vessel',
        empireId,
        vesselId: vessel.id,
        hp:       enemyUnit.hp,
        label:    enemyUnit.label,
      },
      participantB: {
        type: 'player',
        systemId,
      },
    };

    // 5) Zapisz w gameState.battles (bez przejścia przez WarSystem.recordBattle —
    // tamten ma swoje exhaustion/updateOrbitalDominance, które robimy ręcznie)
    if (war) {
      const battleId = `battle_${year.toFixed(2)}_${empireId}_attack_${vessel.id}`.replace(/\./g, '_');
      battleRec.id = battleId;
      battleRec.warId = war.id;
      battleRec.year = year;
      gameState.set(`battles.${battleId}`, battleRec, 'enemy_attack_arrived');

      // Orbital dominance — zwycięzca przejmuje orbitę
      if (result.winner === 'A') {
        gameState.set(`orbitalDominance.${systemId}`, { controllerId: empireId, year }, 'enemy_attack_win');
      } else if (result.winner === 'B') {
        gameState.set(`orbitalDominance.${systemId}`, { controllerId: 'player', year }, 'enemy_attack_loss');
      }

      EventBus.emit('battle:resolved', { warId: war.id, battleId, result: battleRec });
    } else {
      // Bez wojny (cheat bez declareWar) — i tak emit, EventLog handler w GameScene
      // wymaga war ale robi guard; fallback to własny log
      evtLog?.push({
        text: `⚔ Bitwa w ${systemId}: ${enemyUnit.label} vs Gracz. Zwycięzca: ${result.winner === 'A' ? 'wróg' : result.winner === 'B' ? 'gracz' : 'remis'}.`,
        channel: 'combat',
        severity: result.winner === 'A' ? 'alert' : 'info',
        entityRef: systemId,
      });
    }

    // 6) Skutki dla vessela — wygrana = orbituje, przegrana = WRAK (nie dispose)
    if (result.winner === 'A') {
      // Wygrał wróg — zostaje na orbicie planety docelowej, misja się kończy.
      // Wrogie vessele gracza w systemie stają się wrakami (flota rozgromiona).
      vessel.position.state = 'orbiting';
      vessel.position.dockedAt = mission.targetId;
      vessel.status = 'idle';
      vessel.mission = null;

      this._wreckPlayerVesselsInSystem(systemId, year);
    } else if (result.winner === 'B') {
      // Przegrał wróg — jego statek staje się wrakiem dryfującym nad planetą.
      this._turnIntoWreck(vessel, mission?.targetId ?? null, year);
      evtLog?.push({
        text: `💥 Wrogi statek "${vessel.name ?? '?'}" zestrzelony nad ${systemId}.`,
        channel: 'combat',
        severity: 'info',
        entityRef: systemId,
      });
    } else {
      // Draw — wrakowanie obu stron (jeśli są vessele gracza w systemie)
      this._turnIntoWreck(vessel, mission?.targetId ?? null, year);
      this._wreckPlayerVesselsInSystem(systemId, year);
      evtLog?.push({
        text: `💥 Bitwa zakończona remisem nad ${systemId} — obie floty zniszczone.`,
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
