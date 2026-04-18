// groundAbilities.js — zdolności jednostek naziemnych (Ground Unit System)
//
// Każda zdolność to obiekt z metadanymi + ewentualną funkcją `effect(unit, target, gameState)`.
// Zdolności pasywne (type:'passive') są przetwarzane przez GroundUnitManager._tickPassiveAbilities().
// Aktywne (type:'active') wywoływane jawnie, np. z UI lub AI, przez GroundUnitFactory.getAbility(u).effect(...).
//
// Komunikacja — wyłącznie EventBus + window.KOSMOS.gameState (żadnych importów z systems/).

import EventBus from '../core/EventBus.js';

export const GROUND_ABILITIES = {
  // ── Aktywna: zajęcie budynku na hex (2 tury = 2 civYears) ──
  capture_building: {
    id:            'capture_building',
    namePL:        'Zajmij budynek',
    nameEN:        'Capture Building',
    descriptionPL: 'Zajmuje budynek na aktualnym hex przez 2 tury. Opuszczenie hex resetuje progres.',
    descriptionEN: 'Captures the building on current hex over 2 turns. Leaving the hex resets progress.',
    type:     'active',
    cooldown: 0,
    range:    0,
    // Delegacja do managera — manager prowadzi _captureProgress i emituje eventy
    effect(unit, _target, _gameState) {
      const mgr = window.KOSMOS?.groundUnitManager;
      if (!mgr || typeof mgr.capture !== 'function') {
        return { success: false, reason: 'no_manager' };
      }
      return mgr.capture(unit.id);
    },
  },

  // ── Pasywna: leczy sąsiednie przyjazne jednostki +3 HP/turę ──
  heal_nearby: {
    id:            'heal_nearby',
    namePL:        'Leczenie wsparciowe',
    nameEN:        'Support Healing',
    descriptionPL: 'Leczy przyjazne jednostki w promieniu 1 hex o +3 HP na turę.',
    descriptionEN: 'Heals friendly units within 1 hex for +3 HP per turn.',
    type:        'passive',
    cooldown:    0,
    range:       1,
    healPerTurn: 3,
    healRange:   1,
  },

  // ── Aktywna PLACEHOLDER: wezwanie uderzenia orbitalnego (integracja w kolejnym PR) ──
  orbital_support: {
    id:                 'orbital_support',
    namePL:             'Wsparcie orbitalne',
    nameEN:             'Orbital Support',
    descriptionPL:      'Uderzenie orbitalne 20 DMG na aktualny hex. Wymaga kontroli orbity. (PLACEHOLDER)',
    descriptionEN:      'Orbital strike 20 DMG on current hex. Requires orbit control. (PLACEHOLDER)',
    type:               'active',
    cooldown:           3,   // civYears
    range:              0,
    damage:             20,
    friendlyFireChance: 0.15,
    friendlyFireRange:  2,
    effect(unit, _target, _gameState) {
      console.warn('[orbital_support] placeholder — BattleSystem integration pending');
      EventBus.emit('groundUnit:orbitalStrike', {
        unitId: unit.id,
        planetId: unit.planetId,
        q: unit.q,
        r: unit.r,
        hits: [],
        friendlyFireHits: [],
        placeholder: true,
      });
      return { success: true, placeholder: true };
    },
  },

  // ── Aktywna: położenie miny na aktualnym hex ──
  lay_minefield: {
    id:            'lay_minefield',
    namePL:        'Pole minowe',
    nameEN:        'Lay Minefield',
    descriptionPL: 'Zostawia minę na hex. Wroga jednostka wchodząc dostaje 8 DMG, mina zużyta.',
    descriptionEN: 'Places a mine on hex. Enemy entering the hex takes 8 DMG, mine is consumed.',
    type:     'active',
    cooldown: 0,
    range:    0,
    damage:   8,
    effect(unit, _target, gameState) {
      const gs = gameState ?? window.KOSMOS?.gameState;
      if (!gs) return { success: false, reason: 'no_gamestate' };

      const key = `${unit.q}_${unit.r}`;
      const path = `minefields.${unit.planetId}.${key}`;
      if (gs.get(path)) return { success: false, reason: 'already_mined' };

      const ownerId = unit.owner ?? unit.factionId ?? 'player';
      gs.set(path, {
        ownerId,
        damage: 8,
        laidBy: unit.id,
        q: unit.q,
        r: unit.r,
      }, 'minefield_laid');

      EventBus.emit('groundUnit:minefieldLaid', {
        planetId: unit.planetId,
        q: unit.q,
        r: unit.r,
        ownerId,
      });
      return { success: true };
    },
  },

  // ── Pasywna: ukrycie do pierwszego ataku, re-stealth po 2 turach bez ataku ──
  stealth: {
    id:             'stealth',
    namePL:         'Ukrycie',
    nameEN:         'Stealth',
    descriptionPL:  'Jednostka niewidoczna dla wroga do pierwszego ataku. Wraca do ukrycia po 2 turach bez walki.',
    descriptionEN:  'Unit invisible to enemy until first attack. Re-enters stealth after 2 turns without combat.',
    type:           'passive',
    cooldown:       0,
    range:          0,
    revealOnAttack: true,
    reHideTurns:    2,
  },

  // ── Pasywna: odsłania mgłę w promieniu 3 hex co turę ──
  reveal_fog: {
    id:            'reveal_fog',
    namePL:        'Zwiad',
    nameEN:        'Fog Reveal',
    descriptionPL: 'Odsłania mgłę wojny w promieniu 3 hex wokół jednostki co turę.',
    descriptionEN: 'Reveals fog of war within 3 hexes around the unit each turn.',
    type:        'passive',
    cooldown:    0,
    range:       3,
    revealRange: 3,
  },
};

/** Zwróć definicję zdolności po ID (lub null). */
export function getAbility(abilityId) {
  return GROUND_ABILITIES[abilityId] ?? null;
}
