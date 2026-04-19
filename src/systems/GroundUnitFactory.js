// GroundUnitFactory — centralny punkt tworzenia instancji jednostek naziemnych
//
// Factory produkuje plain-object unit (NIE klasy) na podstawie:
//   - archetypeId (UNIT_ARCHETYPES) → role, baseStats, ability, counters
//   - factionId   (HUMANITY/UNE/Syndykat) → name, sprite, color, statsModifier
//
// Obiekt zwracany ma DWA zestawy pól:
//   1. Nowe: archetypeId, factionId, baseStats, currentHP, morale, experience, turnsAlive…
//   2. Legacy mirror: type, hp/hpMax, attack/defense/range, speedHex, role — kompatybilne
//      z istniejącym combat/save/renderer (GroundUnitManager.attackUnit, ColonyOverlay._drawUnits).

import { UNIT_ARCHETYPES, mapRoleToLegacy } from '../data/unitArchetypes.js';
import { GROUND_ABILITIES, getAbility }     from '../data/groundAbilities.js';
import { HUMANITY_UNITS }                   from '../data/factions/humanity.js';
import { UNE_UNITS }                        from '../data/factions/UNE.js';
import { SYNDYKAT_UNITS }                   from '../data/factions/Syndykat.js';
import { glbSnapshotRenderer }              from '../renderer/GlbSnapshotRenderer.js';

const FACTION_UNITS = {
  humanity: HUMANITY_UNITS,
  UNE:      UNE_UNITS,
  Syndykat: SYNDYKAT_UNITS,
};

const FACTION_DEFAULT_COLOR = {
  humanity: '#94A3B8',
  UNE:      '#2563EB',
  Syndykat: '#C2410C',
};

let _idCounter = 0;
let _placeholderDataUrl = null;

export const GroundUnitFactory = {
  /**
   * Stwórz nowy obiekt jednostki z archetypu + frakcji.
   * @param {string} archetypeId — klucz z UNIT_ARCHETYPES
   * @param {string} factionId   — 'humanity' | 'UNE' | 'Syndykat' | empireId
   * @param {string} planetId    — id planety na której jednostka stoi
   * @param {number} q           — hex coord q
   * @param {number} r           — hex coord r
   * @returns {Object|null} unit (plain object) lub null jeśli archetyp nieznany
   */
  create(archetypeId, factionId, planetId, q, r) {
    const arch = UNIT_ARCHETYPES[archetypeId];
    if (!arch) {
      console.warn(`[GroundUnitFactory] Unknown archetypeId: ${archetypeId}`);
      return null;
    }

    const factionUnits = this.resolveFaction(factionId);
    const override     = factionUnits[archetypeId] ?? {};

    // Merge baseStats + opcjonalny statsModifier z frakcji
    const baseStats = { ...arch.baseStats };
    if (override.statsModifier) {
      for (const k of Object.keys(override.statsModifier)) {
        baseStats[k] = (baseStats[k] ?? 0) + override.statsModifier[k];
      }
    }

    const id = `gu_${Date.now()}_${(++_idCounter).toString(36)}`;
    const legacyRole = mapRoleToLegacy(arch.role);

    // ── Opcja C v3: Supply/Org/Morale — domyślne z archetypu ──
    // ColonyManager._spawnGroundUnit może nadpisać tymi samymi polami z uwzględnieniem techBonuses.
    const noMor = arch.noMorale === true;
    const baseOrg       = arch.baseOrg       ?? 10;
    const baseMorale    = noMor ? 0 : (arch.baseMorale ?? 10);
    const baseSupplyCap = arch.baseSupplyCap ?? 100;

    return {
      // ── Identity ──
      id,
      archetypeId,
      factionId,

      // ── Display (override frakcji lub domyślne) ──
      name:   override.name   ?? arch.id,
      sprite: override.sprite ?? null,
      color:  override.color  ?? FACTION_DEFAULT_COLOR[factionId] ?? '#888888',

      // ── Stats (immutable po stworzeniu) ──
      baseStats,

      // ── Runtime state (mutowalne) ──
      currentHP:  baseStats.hp,
      status:     'idle',
      experience: 0,
      turnsAlive: 0,

      // ── Opcja C v3: Supply/Org/Morale ──
      org:                baseOrg,
      maxOrg:             baseOrg,
      morale:             baseMorale,
      maxMorale:          baseMorale,
      supply:             baseSupplyCap,
      supplyCap:          baseSupplyCap,
      supplyConsumption:  arch.supplyConsumption ?? 2,
      noMorale:           noMor,
      isSupplier:         arch.isSupplier === true,
      supplyTransferRate: arch.supplyTransferRate ?? 0,
      transportStatus:    null,
      prevStatus:         null,
      unpaidYears:        0,
      popCost:            0,  // nadpisywane przez ColonyManager._spawnGroundUnit

      // ── Position ──
      planetId,
      q,
      r,

      // ── Ability ──
      abilityId:                arch.ability,
      abilityCooldownRemaining: 0,

      // ── Metadata (kopiowane żeby mutacje na instancji nie niszczyły archetypu) ──
      tags:         [...(arch.tags ?? [])],
      counters:     [...(arch.counters ?? [])],
      counteredBy:  [...(arch.counteredBy ?? [])],
      specialRules: [...(arch.specialRules ?? [])],

      // ══════════════════════════════════════════════════════════════════════
      // LEGACY MIRROR — kompatybilność z istniejącym combat/save/renderer
      // Nie usuwać! GroundUnitManager.attackUnit i ColonyOverlay używają tych pól.
      // ══════════════════════════════════════════════════════════════════════
      type:      archetypeId,
      hp:        baseStats.hp,
      hpMax:     baseStats.hp,
      attack:    baseStats.dmg,
      defense:   baseStats.ac,
      range:     baseStats.rng,
      speedHex:  baseStats.mov,
      role:      legacyRole,
      owner:     'player', // nadpisywane przez GroundUnitManager.createUnit opts

      // Animacja ruchu + combat state (nieserializowane)
      _atkCooldown: 0,
      _path:        [],
      _animT:       0,
      _fromPixel:   null,
      _toPixel:     null,
      _facingLeft:  false,
      _stepCost:    1,

      // Stealth state (tylko dla jednostek z ability 'stealth')
      _stealthState:    arch.ability === 'stealth' ? 'hidden' : null,
      _stealthCooldown: 0,
    };
  },

  /**
   * Rozwiąż dane frakcji — fallback na humanity przy nieznanym factionId.
   * @param {string} factionId
   * @returns {Object} obiekt FACTION_UNITS (humanity/UNE/Syndykat)
   */
  resolveFaction(factionId) {
    const units = FACTION_UNITS[factionId];
    if (!units) {
      console.warn(`[GroundUnitFactory] Unknown factionId: ${factionId} — fallback to humanity`);
      return HUMANITY_UNITS;
    }
    return units;
  },

  /**
   * Zwróć definicję zdolności jednostki lub null jeśli brak ability.
   * @param {Object} unit
   * @returns {Object|null} GROUND_ABILITIES[unit.abilityId]
   */
  getAbility(unit) {
    return unit?.abilityId ? getAbility(unit.abilityId) : null;
  },

  /**
   * Policz efektywny damage po counter system + Opcja C v3 damageMult.
   *   1. Bazowy dmg z archetype (lub legacy .attack)
   *   2. Counter bonus: defender ∈ attacker.counters → ×1.3
   *   3. Opcja C v3 damageMult:
   *        supplyFactor = supply<=0 ? 0 : min(supply/20, 1)
   *        coreBonus    = (org + morale) / 200     (drone: tylko org, dzielone przez 100)
   *        multiplier   = supplyFactor × (1.0 + coreBonus)
   *        → 0 supply = 0 dmg; 100/10/10 = 1.10×; 100/100/100 = 2.00×
   * Counter NIE odejmuje AC — to robi GroundUnitManager.attackUnit.
   * @param {Object} attacker
   * @param {Object} defender
   * @returns {number} surowy dmg po counter × supply/org/morale mult (przed odjęciem AC)
   */
  getEffectiveDmg(attacker, defender) {
    const baseDmg = attacker?.baseStats?.dmg ?? attacker?.attack ?? 0;

    // Counter bonus (Ground Unit System)
    let dmg = baseDmg;
    if (attacker?.counters && defender?.archetypeId &&
        attacker.counters.includes(defender.archetypeId)) {
      dmg = Math.round(dmg * 1.3);
    }

    // Opcja C v3: supply/org/morale multiplier
    const mult = this.computeDamageMult(attacker);
    return dmg * mult;
  },

  /**
   * Opcja C v3: oblicz mnożnik dmg z supply/org/morale jednostki.
   * Działa też dla legacy jednostek (brak pól → traktowane jako full supply, org=10, mor=10 → ×1.10).
   * @param {Object} unit
   * @returns {number} 0..2.0
   */
  computeDamageMult(unit) {
    if (!unit) return 1.0;
    // Legacy jednostki (bez pola `supply`) — zachowują pełny dmg dla kompatybilności z fazą 6.
    if (unit.supply === undefined || unit.supply === null) return 1.0;

    if ((unit.supply ?? 0) <= 0) return 0;
    const supplyFactor = Math.min((unit.supply ?? 0) / 20, 1);

    const noMor   = unit.noMorale === true;
    const orgTerm = (unit.org ?? 0);
    const morTerm = noMor ? 0 : (unit.morale ?? 0);
    const coreDiv = noMor ? 100 : 200;  // drone — tylko org liczy się do bonusu
    const coreBonus = (orgTerm + morTerm) / coreDiv;

    return supplyFactor * (1.0 + coreBonus);
  },

  /**
   * Policz efektywny AC z modyfikatorem terenu.
   * Shock infantry: +1 AC w mieście (specialRule "Urban combat bonus").
   * @param {Object} defender
   * @param {string} terrain — typ terenu hexa (np. 'city', 'forest', 'plains')
   * @returns {number} AC po modyfikatorach terenowych
   */
  getEffectiveAC(defender, terrain) {
    let ac = defender?.baseStats?.ac ?? defender?.defense ?? 0;
    if (defender?.archetypeId === 'shock_infantry' && terrain === 'city') {
      ac += 1;
    }
    return ac;
  },

  /**
   * Czy jednostka żyje (currentHP > 0).
   * @param {Object} unit
   * @returns {boolean}
   */
  isAlive(unit) {
    return (unit?.currentHP ?? unit?.hp ?? 0) > 0;
  },

  /**
   * Czy drone wyczerpał baterię (turnsAlive >= 5).
   * Dotyczy tylko recon_drone — inne jednostki zawsze false.
   * @param {Object} unit
   * @returns {boolean}
   */
  isExpired(unit) {
    if (unit?.archetypeId !== 'recon_drone') return false;
    return (unit.turnsAlive ?? 0) >= 5;
  },

  /**
   * Krótki opis jednostki do UI/debug.
   * @param {Object} unit
   * @returns {string}
   */
  describe(unit) {
    if (!unit) return '(null)';
    const hp    = unit.currentHP ?? unit.hp ?? 0;
    const hpMax = unit.baseStats?.hp ?? unit.hpMax ?? 0;
    const dmg   = unit.baseStats?.dmg ?? unit.attack ?? 0;
    return `${unit.name ?? unit.archetypeId} [HP ${hp}/${hpMax}, DMG ${dmg}]`;
  },

  /**
   * Załaduj sprite jednostki z kaskadą fallbacków:
   *   1. GLB (3D model renderowany offscreen → PNG snapshot)
   *   2. PNG (zwykły obraz)
   *   3. Runtime placeholder (szary kwadrat "?")
   *
   * Zwraca `HTMLImageElement` natychmiast z placeholderem.
   * Właściwy obraz jest podmieniany async gdy GLB/PNG się załaduje.
   * Konsument (np. ColonyOverlay) rerenderuje co klatkę, więc zobaczy podmianę automatycznie.
   *
   * @param {string} spritePath — ścieżka do PNG (GLB szuka w tej samej ścieżce z .glb)
   * @returns {HTMLImageElement}
   */
  loadUnitSprite(spritePath) {
    const img = new Image();
    // Natychmiast pokaż placeholder — nie czekamy na async load
    img.src = this._getPlaceholderDataUrl();

    if (!spritePath) return img;

    // Ścieżka GLB wyprowadzona z PNG (zamiana rozszerzenia)
    const glbPath = spritePath.replace(/\.(png|jpg|jpeg|webp)$/i, '.glb');

    // ── Próba 1: GLB → offscreen Three.js snapshot ──
    glbSnapshotRenderer.snapshot(glbPath).then(canvas => {
      img.src = canvas.toDataURL('image/png');
    }).catch(() => {
      // GLB nie istnieje albo loader padł → próbuj PNG
      this._tryLoadPng(img, spritePath);
    });

    return img;
  },

  /** Fallback: spróbuj załadować PNG; jeśli nie ma → placeholder (nic nie rób, już jest). */
  _tryLoadPng(img, pngPath) {
    const pngTest = new Image();
    pngTest.onload  = () => { img.src = pngTest.src; };
    pngTest.onerror = () => { /* placeholder już w img.src — nic nie rób */ };
    pngTest.src = pngPath;
  },

  /**
   * Stwórz placeholder sprite jako HTMLCanvasElement (64×64, szary "?").
   * Używany gdy plik PNG nie istnieje — onerror podmienia src na toDataURL().
   * @returns {HTMLCanvasElement}
   */
  createPlaceholderSprite() {
    const canvas  = document.createElement('canvas');
    canvas.width  = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#444';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#fff';
    ctx.font         = 'bold 32px sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', 32, 32);
    return canvas;
  },

  /** Lazy cache placeholdera jako data URL. */
  _getPlaceholderDataUrl() {
    if (!_placeholderDataUrl) {
      _placeholderDataUrl = this.createPlaceholderSprite().toDataURL('image/png');
    }
    return _placeholderDataUrl;
  },
};
