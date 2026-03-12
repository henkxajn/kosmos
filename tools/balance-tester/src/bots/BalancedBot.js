// BalancedBot — strategia wzorowana na doświadczonym graczu
// Filozofia: POP rush → kopalnie na bonusach → upgrade → port kosmiczny → ekspansja
//
// === Scenariusz standardowy (civilization) ===
// Faza 1 (0-10 lat): BOOTSTRAP — solar_farm → mine → factory → research_station
// Faza 2 (10-40 lat): WZROST — farmy/studnie/housing → POP rush + upgrades
// Faza 3 (40+ lat, bez portu): AKUMULACJA — kopalnie, zbieranie Fe na port
// Faza 4 (po porcie): EKSPANSJA — flota, recon, kolonizacja
//
// === Scenariusz boosted (civilization_boosted) ===
// Start: 4 POP, rocketry+exploration, launch_pad+shipyard, mining×5, factory×1.5
// Faza B1 (0-15): BOOTSTRAP — mine + factory + ekonomia bazowa
// Faza B2 (15-40): WZROST — POP rush + housing + upgrade + commodity production
// Faza B3 (40+): EKSPANSJA — statki + recon + kolonie

import { BotInterface } from './BotInterface.js';

export class BalancedBot extends BotInterface {
  constructor(runtime) {
    super(runtime, {});
    this.name = 'BalancedBot';
  }

  evaluatePriorities(state) {
    const base = super.evaluatePriorities(state);
    const year = state.gameYear ?? 0;
    const pop = state.colony.population;
    const hasRocketry = state.tech.researched.includes('rocketry');
    const hasExploration = state.tech.researched.includes('exploration');
    const hasShipyard = state.buildings.active.some(b => b.buildingId === 'shipyard');
    const hasLaunchPad = state.buildings.active.some(b =>
      b.buildingId === 'launch_pad' || b.buildingId === 'autonomous_spaceport');
    const mineCount = state.buildings.active.filter(b => b.buildingId === 'mine').length;
    const factoryCount = state.buildings.active.filter(b => b.buildingId === 'factory').length;
    const Fe = state.resources.inventory.Fe ?? 0;
    const savingForPort = hasRocketry && !hasLaunchPad;

    // Wykryj scenariusz boosted: ma launch_pad + shipyard od startu
    const isBoosted = hasLaunchPad && hasShipyard && year < 5 && pop <= 5;

    for (const p of base) {
      // ═══════════════════════════════════════════════════════════════
      // SCENARIUSZ BOOSTED: launch_pad + shipyard od startu
      // ═══════════════════════════════════════════════════════════════
      if (hasLaunchPad && hasShipyard) {

        if (year < 15) {
          // ── Faza B1: BOOTSTRAP — ekonomia bazowa ──
          // Priorytet: mine + factory + food/water + energia
          if (p.name === 'build_mine') p.score += 20;
          if (p.name === 'proactive_mine') p.score += 18;
          if (p.name === 'build_factory') p.score += 18;
          if (p.name === 'allocate_factory') p.score += 15;
          if (p.name === 'research_tech') p.score += 15;
          if (p.name === 'proactive_energy') p.score += 10;
          if (p.name === 'proactive_food') p.score += 5;
          if (p.name === 'proactive_water') p.score += 5;
          if (p.name === 'build_housing') p.score += 5;
          // Hamuj ekspansję — za wcześnie
          if (p.name === 'build_ship') p.score -= 20;
          if (p.name === 'send_recon') p.score -= 20;

        } else if (year < 40) {
          // ── Faza B2: WZROST — POP rush + commodity production ──
          if (p.name === 'proactive_food') p.score += 15;
          if (p.name === 'proactive_water') p.score += 12;
          if (p.name === 'build_housing') p.score += 15;
          if (p.name === 'proactive_energy') p.score += 8;
          if (p.name === 'allocate_factory') p.score += 18;
          if (p.name === 'build_mine') p.score += 12;
          if (p.name === 'proactive_mine') p.score += 10;
          if (p.name === 'research_tech') p.score += 12;
          if (p.name === 'build_factory' && factoryCount < 2) p.score += 15;
          if (year > 20 && p.name === 'upgrade_building') p.score += 20;
          // Statek: niższy priorytet, ale OK jeśli mamy surowce
          if (p.name === 'build_ship') p.score += 10;
          if (p.name === 'send_recon') p.score += 15;

        } else {
          // ── Faza B3: EKSPANSJA — statki + recon + kolonie ──
          // build_ship MUSI wygrywać z allocate_factory (base ~68)
          if (p.name === 'build_ship') p.score += 50;
          if (p.name === 'send_recon') p.score += 55;
          if (p.name === 'send_colony') p.score += 55;
          if (p.name === 'upgrade_building') p.score += 18;
          if (p.name === 'research_tech') p.score += 15;
          if (p.name === 'allocate_factory') p.score += 12;
          if (p.name === 'proactive_food') p.score += 8;
          if (p.name === 'proactive_water') p.score += 8;
          if (p.name === 'build_mine') p.score += 10;
          if (p.name === 'build_housing') p.score += 8;
        }

      // ═══════════════════════════════════════════════════════════════
      // SCENARIUSZ STANDARDOWY: bez launch_pad od startu
      // ═══════════════════════════════════════════════════════════════
      } else if (year < 10) {
        // ── Faza 1: BOOTSTRAP — infrastruktura before POP rush ──
        if (p.name === 'research_tech') p.score += 15;
        if (p.name === 'build_mine') p.score += 18;
        if (p.name === 'proactive_mine') p.score += 18;
        if (p.name === 'build_factory') p.score += 12;
        if (p.name === 'allocate_factory') p.score += 8;
        if (p.name === 'proactive_energy') p.score += 5;
        if (p.name === 'build_research') p.score += 5;
        if (p.name === 'proactive_food') p.score -= 10;
        if (p.name === 'proactive_water') p.score -= 5;
        if (p.name === 'build_housing') p.score -= 10;
        if (p.name === 'build_shipyard') p.score -= 30;
        if (p.name === 'build_launch_pad') p.score -= 30;
        if (p.name === 'build_ship') p.score -= 30;

      } else if (year < 40) {
        // ── Faza 2: WZROST — POP rush + upgrades + 2. fabryka ──
        if (p.name === 'proactive_food') p.score += 15;
        if (p.name === 'proactive_water') p.score += 12;
        if (p.name === 'build_housing') p.score += 15;
        if (p.name === 'proactive_energy') p.score += 8;
        if (p.name === 'research_tech') p.score += 12;
        if (p.name === 'build_research') p.score += 10;
        if (p.name === 'build_mine') p.score += 10;
        if (p.name === 'proactive_mine') p.score += 8;
        if (p.name === 'allocate_factory') p.score += 10;
        // 2. fabryka: buduj w fazie 2 (podwaja prędkość produkcji!)
        if (p.name === 'build_factory' && factoryCount < 2) p.score += 15;
        if (year > 15 && p.name === 'upgrade_building') p.score += 20;
        // Hamuj ekspansję
        if (p.name === 'build_shipyard') p.score -= 20;
        if (p.name === 'build_launch_pad') p.score -= 20;
        if (p.name === 'build_ship') p.score -= 20;

      } else if (savingForPort) {
        // ── Faza 3: AKUMULACJA Fe NA PORT KOSMICZNY (od orbital_survey) ──
        if (p.name === 'build_mine') p.score += 30;
        if (p.name === 'proactive_mine') p.score += 28;
        if (p.name === 'allocate_factory') p.score += 25;
        if (p.name === 'build_factory' && factoryCount < 2) p.score += 20;
        if (p.name === 'research_tech') p.score += 18;
        if (p.name === 'proactive_food') p.score += 5;
        if (p.name === 'proactive_water') p.score += 3;
        if (!hasShipyard && p.name === 'build_shipyard') p.score += 20;
        if (p.name === 'build_launch_pad') p.score += 35;
        if (p.name === 'upgrade_building') p.score -= 20;
        if (p.name === 'build_housing' && pop >= 10) p.score -= 15;
        if (p.name === 'build_ship') p.score -= 30;

      } else if (!hasLaunchPad && !savingForPort) {
        // ── Pre-orbital_survey: rozwój przemysłowy ──
        if (p.name === 'upgrade_building') p.score += 20;
        if (p.name === 'research_tech') p.score += 22;
        if (p.name === 'allocate_factory') p.score += 18;
        if (p.name === 'build_factory') p.score += 15;
        if (p.name === 'build_mine') p.score += 15;
        if (p.name === 'proactive_mine') p.score += 12;
        if (p.name === 'build_research') p.score += 10;
        if (p.name === 'proactive_food') p.score += 8;
        if (p.name === 'proactive_water') p.score += 6;
        if (p.name === 'build_housing') p.score += 8;
        if (p.name === 'build_shipyard') p.score -= 20;
        if (p.name === 'build_launch_pad') p.score -= 20;
        if (p.name === 'build_ship') p.score -= 20;
      }
    }

    return base;
  }
}
