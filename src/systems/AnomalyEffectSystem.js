// AnomalyEffectSystem — aplikuje efekty anomalii gdy rover ją zanalizuje
//
// Nasłuchuje: groundUnit:anomalyFound (po analyze)
// Emituje:    anomaly:discovered (dla popup UI)
//
// Efekty natychmiastowe: one_time_resource, research_bonus, combined, random
// Efekty pasywne:        passive_resource (registerProducer)
// Efekty tile-level:     tile_yield_bonus, building_multiplier, build_modifier,
//                        planet_modifier, area_debuff, dual
//                        → zapisane w tile.anomaly, stosowane przez inne systemy (przyszły etap)

import { ANOMALIES } from '../data/AnomalyData.js';
import EventBus from '../core/EventBus.js';

export class AnomalyEffectSystem {
  constructor() {
    // Nasłuchuj odkrycia anomalii przez rovera (po analyze)
    EventBus.on('groundUnit:anomalyFound', (data) => {
      this._onAnomalyFound(data);
    });
  }

  _onAnomalyFound({ unitId, tileKey, anomaly, planetId }) {
    const def = ANOMALIES[anomaly];
    if (!def) return;

    // Aplikuj efekt
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
    const civSys = window.KOSMOS?.civSystem;

    switch (effect.type) {

      case 'one_time_resource':
        // Dodaj zasób bezpośrednio do inventory kolonii
        if (effect.resource && effect.amount) {
          resSys?.receive?.({ [effect.resource]: effect.amount });
        }
        break;

      case 'passive_resource':
        // Zarejestruj pasywny producer per-tile
        if (effect.resource && effect.amount) {
          EventBus.emit('resource:registerProducer', {
            id:    `anomaly_${tileKey}`,
            rates: { [effect.resource]: effect.amount },
          });
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
        // Celowo nic
        break;

      // Efekty tile-level (tile_yield_bonus, building_multiplier, build_modifier,
      // planet_modifier, area_debuff, dual) — zapisane w tile.anomaly,
      // stosowane przez BuildingSystem w przyszłym etapie.
      default:
        break;
    }
  }
}
