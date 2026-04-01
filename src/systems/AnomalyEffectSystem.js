// AnomalyEffectSystem — aplikuje efekty anomalii gdy rover ją zanalizuje
//
// Nasłuchuje: groundUnit:anomalyFound (po analyze)
// Emituje:    anomaly:discovered (dla popup UI)
//
// Efekty natychmiastowe: one_time_resource, research_bonus, combined, random
// Efekty tile-level:     passive_resource, tile_yield_bonus, building_multiplier,
//                        build_modifier → zapisane w tile.anomalyEffect,
//                        stosowane przez BuildingSystem gdy budynek stanie na hexie
// Efekty planetarne:     planet_modifier → stosowane globalnie na kolonii

import { ANOMALIES } from '../data/AnomalyData.js';
import EventBus from '../core/EventBus.js';

// Typy efektów zapisywane na tile (NIE stosowane natychmiast)
const TILE_EFFECT_TYPES = new Set([
  'passive_resource',
  'tile_yield_bonus',
  'building_multiplier',
  'build_modifier',
]);

// Efekty planetarne (stosowane globalnie na kolonii)
const PLANET_EFFECT_TYPES = new Set([
  'planet_modifier',
]);

export class AnomalyEffectSystem {
  constructor() {
    // Aktywne modyfikatory planetarne per-kolonia: planetId → [{ effect }]
    this._planetModifiers = new Map();

    // Nasłuchuj odkrycia anomalii przez rovera (po analyze)
    EventBus.on('groundUnit:anomalyFound', (data) => {
      this._onAnomalyFound(data);
    });
  }

  _onAnomalyFound({ unitId, tileKey, anomaly, planetId }) {
    const def = ANOMALIES[anomaly];
    if (!def) return;

    // Aplikuj efekt (natychmiastowy lub zapisz na tile)
    this._applyEffect(def.effect, tileKey, planetId);

    // Emituj event dla UI (popup)
    EventBus.emit('anomaly:discovered', {
      anomalyId:  anomaly,
      tileKey,
      anomalyDef: def,
      planetId,
    });
  }

  _applyEffect(effect, tileKey, planetId) {
    if (!effect) return;

    const resSys = window.KOSMOS?.resourceSystem;

    // ── Efekty tile-level → zapisz na hexie, BuildingSystem je odczyta ──
    if (TILE_EFFECT_TYPES.has(effect.type)) {
      this._storeTileEffect(effect, tileKey, planetId);
      return;
    }

    // ── Efekty planetarne → zapisz per-kolonia ──
    if (PLANET_EFFECT_TYPES.has(effect.type)) {
      this._storePlanetModifier(effect, planetId);
      return;
    }

    // ── Efekty natychmiastowe ──
    switch (effect.type) {

      case 'one_time_resource':
        if (effect.resource && effect.amount) {
          resSys?.receive?.({ [effect.resource]: effect.amount });
        }
        break;

      case 'research_bonus':
        if (effect.oneTime) {
          resSys?.receive?.({ research: effect.oneTime });
        }
        break;

      case 'combined':
        if (effect.oneTimeResources) {
          resSys?.receive?.(effect.oneTimeResources);
        }
        break;

      case 'random': {
        // Losuj efekt z listy ważonej
        const roll = Math.random();
        let cumulative = 0;
        for (const option of (effect.options ?? [])) {
          cumulative += option.weight;
          if (roll < cumulative) {
            if (option.type !== 'nothing') {
              this._applyEffect(option, tileKey, planetId);
            }
            break;
          }
        }
        break;
      }

      case 'nothing':
        break;

      default:
        break;
    }
  }

  // Zapisz efekt na tile — BuildingSystem odczyta go z tile.anomalyEffect
  _storeTileEffect(effect, tileKey, planetId) {
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    const grid   = colony?.grid;
    if (!grid) return;

    const [q, r] = tileKey.split(',').map(Number);
    const tile = grid.get(q, r);
    if (!tile) return;

    tile.anomalyEffect = { ...effect };

    // Jeśli na tym hexie już stoi budynek — od razu przelicz stawki
    if (tile.buildingId) {
      colony?.buildingSystem?._reapplyAllRates?.();
    }
  }

  // Zapisz modyfikator planetarny per-kolonia
  _storePlanetModifier(effect, planetId) {
    if (!this._planetModifiers.has(planetId)) {
      this._planetModifiers.set(planetId, []);
    }
    this._planetModifiers.get(planetId).push({ ...effect });

    // Przelicz stawki wszystkich budynków na kolonii
    const colMgr = window.KOSMOS?.colonyManager;
    const colony = colMgr?.getColony(planetId);
    colony?.buildingSystem?._reapplyAllRates?.();
  }

  // ── API dla BuildingSystem ──────────────────────────────────────────────

  /** Pobierz modyfikator planetarny żywności dla kolonii */
  getFoodBonus(planetId) {
    const mods = this._planetModifiers.get(planetId);
    if (!mods) return 0;
    let bonus = 0;
    for (const m of mods) {
      if (m.foodBonus) bonus += m.foodBonus;
    }
    return bonus;
  }

  /** Pobierz wszystkie modyfikatory planetarne dla kolonii */
  getPlanetModifiers(planetId) {
    return this._planetModifiers.get(planetId) ?? [];
  }

  // ── Serializacja ────────────────────────────────────────────────────────

  serialize() {
    const mods = {};
    for (const [pid, arr] of this._planetModifiers) {
      mods[pid] = arr;
    }
    return { planetModifiers: mods };
  }

  restore(data) {
    this._planetModifiers.clear();
    if (data?.planetModifiers) {
      for (const [pid, arr] of Object.entries(data.planetModifiers)) {
        this._planetModifiers.set(pid, arr);
      }
    }
  }
}
