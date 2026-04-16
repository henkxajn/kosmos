// MilitaryAI — decyzje wojenne imperium (Faza 7)
//
// Akcje (każda scoring 0-100, UtilityAI wybiera najwyższą):
//   attack_player   — wyślij flotę na home gracza
//   reinforce_home  — ściągnij wolne floty do home
//   build_fleet     — spawnuj nową flotę (zużyj production)
//
// Scoring idea:
//   attack = hostility × aggression × militaryRatio × (at_war ? 2 : 1)
//   reinforce = urgency (home unguarded ratio) × (at_war ? 2 : 1)
//   build_fleet = (100 - military_power) / 100 × production_ratio

import { UtilityAI, estimatePlayerMilitary } from './UtilityAI.js';

const BUILD_FLEET_COST_PRODUCTION = 30;   // ile production konsumuje spawn floty
const BUILD_FLEET_STRENGTH = 60;          // siła spawned floty

export class MilitaryAI {
  /**
   * Wykonaj decyzję wojenną dla imperium.
   * Wywoływane co 1 civYear per imperium w AlienCivSystem.
   */
  static tick(empireId) {
    return UtilityAI.decide(empireId, ACTIONS, 'military');
  }
}

// ── Akcje ──────────────────────────────────────────────────────

const ACTIONS = [
  {
    id: 'attack_player',
    score(ctx) {
      const { empire, personality, relation, war, galaxyData, homePlanet } = ctx;
      if (!homePlanet) return 0;
      if (!galaxyData?.systems) return 0;

      const hostility = relation?.hostility ?? 0;
      const aggression = personality.aggression ?? 0.5;
      const isAtWar = !!war?.active;
      const playerMil = estimatePlayerMilitary();
      const ownMil = empire.military?.power ?? 0;
      const militaryRatio = Math.min(3.0, ownMil / Math.max(1, playerMil));

      // Wymaga jakiejś floty
      const idleFleets = (empire.fleets ?? []).filter(f => !f.destSystemId && (f.strength ?? 0) > 30);
      if (idleFleets.length === 0) return 0;

      // Jeśli pokój i niska hostility — nie atakuj (chyba że xenophage/swarm)
      const peaceInhibitor = isAtWar ? 1.0 : (hostility < 40 ? 0.1 : 0.4);

      const raw = hostility * aggression * militaryRatio * peaceInhibitor;
      // Bonus za bycie w stanie AGGRESSIVE/WAR w FSM
      const fsmState = empire.fsm?.state;
      const fsmBonus = (fsmState === 'WAR' || fsmState === 'AGGRESSIVE') ? 1.5 : 1.0;

      return raw * fsmBonus;
    },
    execute(ctx) {
      const { empire, empireReg, galaxyData, homePlanet, year } = ctx;
      const playerSystemId = homePlanet?.systemId ?? 'sys_home';

      // Wybierz najsilniejszą idle flotę
      const idleFleets = (empire.fleets ?? [])
        .filter(f => !f.destSystemId && (f.strength ?? 0) > 30)
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0));
      if (idleFleets.length === 0) return;
      const fleet = idleFleets[0];

      // Oblicz ETA z dystansu LY (2 civYears / LY — abstract)
      const fromSys = galaxyData?.systems?.find(s => s.id === fleet.systemId);
      const toSys = galaxyData?.systems?.find(s => s.id === playerSystemId);
      if (!fromSys || !toSys) return;
      const dx = (fromSys.x ?? 0) - (toSys.x ?? 0);
      const dy = (fromSys.y ?? 0) - (toSys.y ?? 0);
      const distLY = Math.sqrt(dx * dx + dy * dy);
      const etaYears = Math.max(3, Math.round(distLY * 2));

      empireReg.moveFleet(empire.id, fleet.id, playerSystemId, etaYears);
    },
  },

  {
    id: 'reinforce_home',
    score(ctx) {
      const { empire } = ctx;
      // Ile flot jest w domu vs poza
      const home = empire.homeSystemId;
      const fleets = empire.fleets ?? [];
      const atHome = fleets.filter(f => f.systemId === home && !f.destSystemId);
      const awayFromHome = fleets.filter(f => f.systemId !== home || f.destSystemId);
      if (fleets.length === 0) return 0;
      if (atHome.length > 0) return 0; // już broniony
      if (awayFromHome.length === 0) return 0;

      // Home nieobroniony → priorytet średni
      // Bardziej dla trader/isolationist (defensywni), mniej dla xenophage/swarm
      const aggression = ctx.personality.aggression ?? 0.5;
      return 30 * (1.3 - aggression);
    },
    execute(ctx) {
      const { empire, empireReg } = ctx;
      const home = empire.homeSystemId;
      const awayFleets = (empire.fleets ?? []).filter(f => f.systemId !== home);
      if (awayFleets.length === 0) return;

      // Zawróć pierwszą idle lub nawet w tranzycie (abstract — zmiana destSystemId)
      const fleet = awayFleets[0];
      empireReg.moveFleet(empire.id, fleet.id, home, 3);
    },
  },

  {
    id: 'build_fleet',
    score(ctx) {
      const { empire, personality } = ctx;
      const production = empire.resources?.production ?? 0;
      if (production < BUILD_FLEET_COST_PRODUCTION) return 0;

      const ownMil = empire.military?.power ?? 0;
      const playerMil = estimatePlayerMilitary();
      const deficit = Math.max(0, playerMil * 1.2 - ownMil);
      const deficitRatio = deficit / playerMil;  // 0..1+
      // Expansion/aggression zwiększają apetyt na flotę
      const ambition = 0.5 * (personality.expansion ?? 0.5) + 0.5 * (personality.aggression ?? 0.5);
      const fsmBonus = (empire.fsm?.state === 'REARMING') ? 2.0 : 1.0;

      return 25 * deficitRatio * (0.5 + ambition) * fsmBonus;
    },
    execute(ctx) {
      const { empire, empireReg } = ctx;
      const production = empire.resources?.production ?? 0;
      if (production < BUILD_FLEET_COST_PRODUCTION) return;

      // Zużyj production przez intent method
      empireReg.updateResource(empire.id, 'production', -BUILD_FLEET_COST_PRODUCTION, 'ai_built_fleet');

      // Spawnuj flotę w home
      empireReg.spawnFleet(empire.id, {
        strength: BUILD_FLEET_STRENGTH,
        systemId: empire.homeSystemId,
      });
      empireReg.updateMilitaryPower(empire.id, BUILD_FLEET_STRENGTH, 'ai_built_fleet');
    },
  },
];
