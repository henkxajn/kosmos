// ImpactDamageSystem — stopniowane uderzenia kosmiczne na kolonie
//
// Skala uderzeń (impactor_mass / target_mass):
//   NEGLIGIBLE (< 0.0001)  — brak efektu na kolonię
//   LIGHT (0.0001–0.001)   — 25% szansa na 1 uszkodzony budynek, 5% zasobów
//   MODERATE (0.001–0.01)  — 1 POP, 2-4 budynki, 15% zasobów
//   HEAVY (0.01–0.1)       — 50-75% POP, 50-70% budynków, 50% zasobów
//   EXTINCTION (≥ 0.1)     — wszystko zniszczone → game over jeśli homePlanet
//
// Planet-planet collision:
//   Loser: ZAWSZE EXTINCTION
//   Winner: zależy od mass ratio (ratio < 0.01 → MODERATE, 0.01–0.1 → HEAVY, ≥ 0.1 → EXTINCTION)
//   Deflection (redirect): EXTINCTION dla obu
//
// Komunikacja:
//   Nasłuchuje: body:collision, body:microimpact
//   Emituje:    impact:colonyDamage { planetId, severity, popLost, buildingsDestroyed }
//               game:over (gdy homePlanet traci wszystkich POPów)

import EventBus from '../core/EventBus.js';

// Progi mass ratio
const THRESHOLD_LIGHT      = 0.0001;
const THRESHOLD_MODERATE    = 0.001;
const THRESHOLD_HEAVY       = 0.01;
const THRESHOLD_EXTINCTION  = 0.1;

// Kategorie uderzeń
const SEVERITY = {
  NEGLIGIBLE: 'negligible',
  LIGHT:      'light',
  MODERATE:   'moderate',
  HEAVY:      'heavy',
  EXTINCTION: 'extinction',
};

// Wiadomości do EventLog
const SEVERITY_MESSAGES = {
  [SEVERITY.LIGHT]:      '☄ Uderzenie meteorytyczne na',
  [SEVERITY.MODERATE]:   '💥 Bombardowanie!',
  [SEVERITY.HEAVY]:      '🔥 KATASTROFALNE UDERZENIE!',
  [SEVERITY.EXTINCTION]: '☠ APOKALIPSA — Zagłada!',
};

export class ImpactDamageSystem {
  constructor(colonyManager) {
    this._colonyManager = colonyManager;

    // Planet-planet collision i duże ciała
    EventBus.on('body:collision', ({ winner, loser, type }) => {
      this._handleCollision(winner, loser, type);
    });

    // Mikrouderzenia małych ciał
    EventBus.on('body:microimpact', ({ planet, mass }) => {
      if (!planet || !this._colonyManager) return;
      const ratio = mass / (planet.physics?.mass ?? 1);
      const severity = this._classifyRatio(ratio);
      if (severity === SEVERITY.NEGLIGIBLE) return;
      this._applyDamage(planet.id, severity);
    });
  }

  // ── Klasyfikacja collision ────────────────────────────────────────
  _handleCollision(winner, loser, type) {
    if (!this._colonyManager) return;

    // Deflection (redirect): EXTINCTION dla obu stron
    if (type === 'redirect') {
      if (loser)  this._applyDamage(loser.id,  SEVERITY.EXTINCTION);
      if (winner) this._applyDamage(winner.id, SEVERITY.EXTINCTION);
      return;
    }

    // Eject: loser wyrzucony — EXTINCTION
    if (type === 'eject') {
      if (loser) this._applyDamage(loser.id, SEVERITY.EXTINCTION);
      // Winner: zależy od mass ratio
      if (winner && loser) {
        const ratio = (loser.physics?.mass ?? 0) / (winner.physics?.mass ?? 1);
        const severity = this._classifyPlanetCollision(ratio);
        if (severity !== SEVERITY.NEGLIGIBLE) {
          this._applyDamage(winner.id, severity);
        }
      }
      return;
    }

    // Absorb: loser pochłonięty
    if (type === 'absorb') {
      // Loser ZAWSZE EXTINCTION (pochłonięty)
      if (loser) this._applyDamage(loser.id, SEVERITY.EXTINCTION);

      // Winner: zależy od mass ratio
      if (winner && loser) {
        const ratio = (loser.physics?.mass ?? 0) / (winner.physics?.mass ?? 1);
        // Dla planet-planet: osobna klasyfikacja
        if (loser.type === 'planet') {
          const severity = this._classifyPlanetCollision(ratio);
          if (severity !== SEVERITY.NEGLIGIBLE) {
            this._applyDamage(winner.id, severity);
          }
        } else {
          // Małe ciało (asteroid, planetoid, comet): standardowa klasyfikacja
          const severity = this._classifyRatio(ratio);
          if (severity !== SEVERITY.NEGLIGIBLE) {
            this._applyDamage(winner.id, severity);
          }
        }
      }
      return;
    }
  }

  // Klasyfikacja wg mass ratio (małe ciała / mikrouderzenia)
  _classifyRatio(ratio) {
    if (ratio < THRESHOLD_LIGHT)      return SEVERITY.NEGLIGIBLE;
    if (ratio < THRESHOLD_MODERATE)    return SEVERITY.LIGHT;
    if (ratio < THRESHOLD_HEAVY)       return SEVERITY.MODERATE;
    if (ratio < THRESHOLD_EXTINCTION)  return SEVERITY.HEAVY;
    return SEVERITY.EXTINCTION;
  }

  // Klasyfikacja planet-planet (winner)
  _classifyPlanetCollision(ratio) {
    if (ratio < THRESHOLD_HEAVY)       return SEVERITY.MODERATE;
    if (ratio < THRESHOLD_EXTINCTION)  return SEVERITY.HEAVY;
    return SEVERITY.EXTINCTION;
  }

  // ── Aplikowanie zniszczeń ─────────────────────────────────────────
  _applyDamage(planetId, severity) {
    const colony = this._colonyManager.getColony(planetId);
    if (!colony) return; // brak kolonii na planecie — nic do zniszczenia

    const { civSystem, buildingSystem, resourceSystem } = colony;
    if (!civSystem || !buildingSystem || !resourceSystem) return;

    let popLost = 0;
    let buildingsDestroyed = 0;

    switch (severity) {
      case SEVERITY.LIGHT:
        // 25% szansa na 1 uszkodzony budynek, 5% zasobów
        if (Math.random() < 0.25) {
          buildingsDestroyed = this._destroyBuildings(buildingSystem, resourceSystem, civSystem, 1);
        }
        this._deductResources(resourceSystem, 0.05);
        break;

      case SEVERITY.MODERATE:
        // 1 POP, 2-4 budynki, 15% zasobów
        popLost = this._killPops(civSystem, 1);
        buildingsDestroyed = this._destroyBuildings(buildingSystem, resourceSystem, civSystem, 2 + Math.floor(Math.random() * 3));
        this._deductResources(resourceSystem, 0.15);
        break;

      case SEVERITY.HEAVY: {
        // 50-75% POP, 50-70% budynków, 50% zasobów
        const popFrac = 0.5 + Math.random() * 0.25;
        const killCount = Math.max(1, Math.floor(civSystem.population * popFrac));
        popLost = this._killPops(civSystem, killCount);
        const bldgFrac = 0.5 + Math.random() * 0.2;
        const bldgCount = Math.max(1, Math.floor(buildingSystem._active.size * bldgFrac));
        buildingsDestroyed = this._destroyBuildings(buildingSystem, resourceSystem, civSystem, bldgCount);
        this._deductResources(resourceSystem, 0.50);
        break;
      }

      case SEVERITY.EXTINCTION:
        // Wszystko zniszczone
        popLost = this._killPops(civSystem, civSystem.population);
        buildingsDestroyed = this._destroyBuildings(buildingSystem, resourceSystem, civSystem, buildingSystem._active.size);
        this._deductResources(resourceSystem, 1.0);
        break;
    }

    // Log do EventLog
    const planetName = colony.name || colony.planet?.name || planetId;
    const msg = SEVERITY_MESSAGES[severity];
    if (msg) {
      EventBus.emit('impact:colonyDamage', {
        planetId, severity, popLost, buildingsDestroyed,
        message: `${msg} ${planetName}`,
      });
    }

    // Sprawdź game over: homePlanet z 0 POPów
    if (civSystem.population <= 0 && planetId === window.KOSMOS?.homePlanet?.id) {
      EventBus.emit('time:pause');
      EventBus.emit('game:over', {
        reason: severity === SEVERITY.EXTINCTION ? 'extinction_impact' : 'colony_destroyed',
        planetName,
      });
    }
  }

  // ── Zabijanie POPów ──────────────────────────────────────────────
  _killPops(civSystem, killCount) {
    if (killCount <= 0 || civSystem.population <= 0) return 0;
    const killed = Math.min(civSystem.population, killCount);
    civSystem.population -= killed;
    if (civSystem.population < 0) civSystem.population = 0;
    EventBus.emit('civ:popDied', { cause: 'impact', population: civSystem.population });
    EventBus.emit('civ:populationChanged', civSystem._popSnapshot());
    return killed;
  }

  // ── Niszczenie budynków ──────────────────────────────────────────
  _destroyBuildings(buildingSystem, resourceSystem, civSystem, count) {
    if (count <= 0) return 0;

    // Zbierz listę aktywnych budynków (pomiń Stolicę)
    const destroyable = [];
    for (const [key, entry] of buildingSystem._active) {
      if (entry.building?.isCapital || entry.building?.isColonyBase) continue;
      destroyable.push({ key, entry });
    }

    if (destroyable.length === 0) return 0;

    // Losowo wybierz budynki do zniszczenia
    const toDestroy = Math.min(count, destroyable.length);
    // Tasowanie Fisher-Yates
    for (let i = destroyable.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [destroyable[i], destroyable[j]] = [destroyable[j], destroyable[i]];
    }

    let destroyed = 0;
    for (let i = 0; i < toDestroy; i++) {
      const { key, entry } = destroyable[i];

      // Usuń producenta zasobów
      const producerId = key.startsWith('capital_') ? key : `building_${key}`;
      resourceSystem.removeProducer(producerId);

      // Zwolnij housing
      if (entry.housing > 0) {
        civSystem.housing = Math.max(0, civSystem.housing - entry.housing);
      }

      // Zwolnij POPy (employment)
      const popCost = entry.popCost ?? entry.building?.popCost ?? 0.25;
      if (popCost > 0) {
        civSystem._employedPops = Math.max(0, civSystem._employedPops - popCost);
      }

      // Fabryka: przelicz punkty
      if (entry.building?.id === 'factory' && buildingSystem._factorySystem) {
        // Zostanie przeliczone po usunięciu z _active
      }

      // Usuń z mapy aktywnych budynków
      buildingSystem._active.delete(key);
      destroyed++;
    }

    // Przelicz fabryki jeśli zmieniono
    if (buildingSystem._factorySystem) {
      buildingSystem._recalcFactoryPoints();
    }

    // Emituj aktualizację populacji (housing + employment zmieniło się)
    EventBus.emit('civ:populationChanged', civSystem._popSnapshot());

    return destroyed;
  }

  // ── Utrata zasobów ────────────────────────────────────────────────
  _deductResources(resourceSystem, fraction) {
    if (fraction <= 0) return;

    // Iteruj po inventory i odejmij frakcję
    for (const [key, amount] of resourceSystem.inventory) {
      if (amount <= 0) continue;
      const loss = Math.floor(amount * fraction);
      if (loss > 0) {
        resourceSystem.inventory.set(key, amount - loss);
      }
    }

    // Research też traci
    if (resourceSystem.research?.amount > 0) {
      const loss = Math.floor(resourceSystem.research.amount * fraction);
      resourceSystem.research.amount -= loss;
    }
  }
}
