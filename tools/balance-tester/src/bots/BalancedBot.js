// BalancedBot — odwzorowanie strategii agresywnego gracza
//
// BUILD ORDER (boosted):
// 1. Mine → coal_plant → metallurgy → factory (steel budget: 13-3-3-5=2)
// 2. Food/water jeśli trzeba, inaczej consumer_factory Lv1
// 3. Kopalnia #2, upgrade factory→Lv2, research
// 4. Water/food/energy jeśli trzeba, factory→Lv3, mine→Lv3
// 5. Science vessel → recon full_system
// 6. Consumer factory
// 7. Produkuj 3× autonomous mine + solar prefab, czekaj na Fe
// 8. Produkuj autonomous spaceport prefab (Fe:1000!)
// 9. Cargo ship → załaduj prefaby → outpost na księżyc

import { BotInterface } from './BotInterface.js';

export class BalancedBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {});
    this.name = 'BalancedBot';
  }

  evaluatePriorities(state) {
    const base = super.evaluatePriorities(state);
    const year = state.gameYear ?? 0;
    const s = state;
    const hasShipyard = s.buildings.active.some(b => b.buildingId === 'shipyard');
    const hasLaunchPad = s.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const factoryCount = s.buildings.active.filter(b => b.buildingId === 'factory').length;
    const cfCount = s.buildings.active.filter(b => b.buildingId === 'consumer_factory').length;
    const mineCount = s.buildings.active.filter(b => b.buildingId === 'mine').length;
    const fleet = s.fleet.allVessels || [];
    const sciVessels = fleet.filter(v => v.shipId === 'science_vessel').length;
    const cargoShips = fleet.filter(v => v.shipId === 'cargo_ship').length;
    const factoryLv = Math.max(...s.buildings.active
      .filter(b => b.buildingId === 'factory').map(b => b.level ?? 1), 0);
    const mineLv = Math.max(...s.buildings.active
      .filter(b => b.buildingId === 'mine').map(b => b.level ?? 1), 0);
    const prosperity = s.colony.prosperity ?? 50;
    const outposts = (s.colonies ?? []).filter(c => c.isOutpost).length;

    for (const p of base) {
      // ═══════════════════════════════════════════════════════════════
      // SCENARIUSZ BOOSTED
      // ═══════════════════════════════════════════════════════════════
      if (hasLaunchPad && hasShipyard) {

        // ── KROK 1: mine FIRST → coal → metallurgy → factory (yr 0-3) ──
        if (factoryCount === 0) {
          // Mine MUSI być pierwsza — Fe drains at 120/gameYear from maintenance!
          if (p.name === 'build_mine') p.score += 50;
          if (p.name === 'proactive_mine') p.score += 50;
          if (p.name === 'proactive_energy') p.score += 35;  // coal_plant
          if (p.name === 'research_tech') p.score += 25;     // metallurgy (po mine!)
          if (p.name === 'build_factory') p.score += 20;     // factory po coal+metallurgy
          // NIE hamuj food/water → zapobiega starvation
          if (p.name === 'build_ship') p.score -= 30;
          if (p.name === 'send_recon') p.score -= 30;
          if (p.name === 'send_transport') p.score -= 30;
          continue;
        }

        // ── KROK 2-4: food/water + mine#2 + factory→Lv2/3 + mine→Lv3 (yr 3-15) ──
        if (year < 15) {
          if (p.name === 'allocate_factory') p.score += 5;   // produkuj commodities!
          if (p.name === 'upgrade_building') p.score += 22;   // factory/mine upgrade
          if (p.name === 'proactive_food') p.score += 18;
          if (p.name === 'proactive_water') p.score += 15;
          if (p.name === 'proactive_energy') p.score += 12;
          if (p.name === 'build_mine' && mineCount < 2) p.score += 20;
          if (p.name === 'proactive_mine') p.score += 15;
          if (p.name === 'build_consumer_factory' && cfCount === 0 && factoryLv >= 2) p.score += 18;
          if (p.name === 'research_tech') p.score += 15;
          if (p.name === 'build_housing') p.score += 10;
          // Statki: science_vessel po mine Lv3 + factory Lv2
          if (p.name === 'build_ship' && mineLv >= 3 && factoryLv >= 2) p.score += 25;
          if (p.name === 'send_recon' && sciVessels > 0) p.score += 30;

        // ── KROK 5-6: science vessel + consumer factory (yr 15-25) ──
        } else if (year < 25) {
          if (p.name === 'build_ship') p.score += 30;
          if (p.name === 'send_recon') p.score += 40;
          if (p.name === 'allocate_factory') p.score += 5;
          if (p.name === 'upgrade_building') p.score += 20;
          if (p.name === 'build_consumer_factory' && cfCount < 1) p.score += 25;
          if (p.name === 'research_tech') p.score += 18;
          if (p.name === 'proactive_food') p.score += 12;
          if (p.name === 'proactive_water') p.score += 10;
          if (p.name === 'proactive_energy') p.score += 10;
          if (p.name === 'build_housing') p.score += 12;
          if (p.name === 'build_mine') p.score += 8;
          // Cargo ship po science vessel
          if (p.name === 'send_transport') p.score += 35;

        // ── KROK 7-9: prefaby + cargo ship + outpost (yr 25+) ──
        } else {
          if (p.name === 'send_transport') p.score += 48;    // outpost!
          if (p.name === 'upgrade_outpost') p.score += 50;
          if (p.name === 'send_colony') p.score += 45;
          if (p.name === 'send_recon') p.score += 42;
          if (p.name === 'build_ship') p.score += 38;
          if (p.name === 'allocate_factory') p.score += 5;
          if (p.name === 'upgrade_building') p.score += 20;
          if (p.name === 'research_tech') p.score += 18;
          if (p.name === 'build_consumer_factory' && cfCount < 2 && prosperity < 30) p.score += 28;
          if (p.name === 'proactive_food') p.score += 12;
          if (p.name === 'proactive_water') p.score += 10;
          if (p.name === 'proactive_energy') p.score += 10;
          if (p.name === 'build_housing') p.score += 12;
        }

      // ═══════════════════════════════════════════════════════════════
      // SCENARIUSZ STANDARDOWY
      // ═══════════════════════════════════════════════════════════════
      } else if (year < 15) {
        if (p.name === 'build_mine') p.score += 20;
        if (p.name === 'proactive_mine') p.score += 20;
        if (p.name === 'proactive_energy') p.score += 15;
        if (p.name === 'build_factory') p.score += 15;
        if (p.name === 'research_tech') p.score += 15;
        if (p.name === 'build_ship') p.score -= 30;
      } else if (year < 40) {
        if (p.name === 'upgrade_building') p.score += 22;
        if (p.name === 'build_consumer_factory') p.score += 20;
        if (p.name === 'proactive_food') p.score += 18;
        if (p.name === 'proactive_water') p.score += 15;
        if (p.name === 'build_housing') p.score += 18;
        if (p.name === 'allocate_factory') p.score += 5;
        if (p.name === 'research_tech') p.score += 15;
        if (p.name === 'build_ship') p.score += 20;
        if (p.name === 'send_recon') p.score += 25;
      } else {
        if (p.name === 'send_recon') p.score += 45;
        if (p.name === 'send_transport') p.score += 42;
        if (p.name === 'upgrade_outpost') p.score += 45;
        if (p.name === 'build_ship') p.score += 35;
        if (p.name === 'allocate_factory') p.score += 5;
        if (p.name === 'upgrade_building') p.score += 20;
        if (p.name === 'research_tech') p.score += 18;
        if (p.name === 'proactive_food') p.score += 12;
        if (p.name === 'proactive_energy') p.score += 10;
      }
    }

    return base;
  }
}
