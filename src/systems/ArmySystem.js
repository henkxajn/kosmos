// ArmySystem — zarządzanie armiami naziemnymi (Paradox-style)
//
// Armia = nazwany stack 2+ jednostek tego samego właściciela, na tym samym hexie.
// Rozkaz ruchu armii → wszyscy członkowie idą razem. Armia przestaje istnieć gdy:
//   - członkowie rozpraszają się na różne hexy (split manual lub auto-retreat)
//   - zostaje ≤ 1 członek (disband auto)
//   - wszyscy giną (disband auto)
//
// API:
//   createArmy(unitIds[], opts?) → { army }
//   disbandArmy(armyId)
//   splitArmy(armyId, splitUnitIds[]) → { newArmy }  — tworzy drugą armię z podzbioru
//   renameArmy(armyId, name)
//   getArmyForUnit(unitId) → army | null
//   getArmiesOnPlanet(planetId) → Army[]
//   getLoseUnitsOnPlanet(planetId) → Unit[]  — nienależące do żadnej armii
//
// EventBus:
//   Emituje:
//     army:created    → { army }
//     army:disbanded  → { armyId, reason }
//     army:split      → { original, newArmy }
//     army:renamed    → { armyId, name }
//     army:moved      → { armyId, q, r }
//   Nasłuchuje:
//     groundUnit:destroyed → usuń z armii; jeśli size ≤ 1 → disband
//     groundUnit:moved     → jeśli unit wyjdzie z hexu armii → usuń z niej

import EventBus from '../core/EventBus.js';

let _nextArmyId = 1;

// Pomocnicze nazwy rzymskie dla auto-generated armies
const ROMAN_NAMES = [
  'I Korpus', 'II Batalion', 'III Legion', 'IV Pułk', 'V Dywizja',
  'VI Kompania', 'VII Brygada', 'VIII Korpus', 'IX Batalion', 'X Legion',
];

export class ArmySystem {
  constructor() {
    /** @type {Map<string, Army>} */
    this._armies = new Map();
    /** @type {Map<string, string>} unitId → armyId (reverse index) */
    this._unitToArmy = new Map();

    EventBus.on('groundUnit:destroyed', ({ unitId }) => this._onUnitDestroyed(unitId));
    EventBus.on('groundUnit:removed',   ({ unitId }) => this._onUnitDestroyed(unitId));
    EventBus.on('groundUnit:moved',     ({ unitId, q, r }) => this._onUnitMoved(unitId, q, r));
    EventBus.on('groundUnit:routed',    ({ unitId, toQ, toR }) => this._onUnitMoved(unitId, toQ, toR));
  }

  // ── Publiczne API ────────────────────────────────────────────────────────

  /**
   * @param {string[]} unitIds — muszą być na tym samym hexie, tego samego właściciela, min. 2
   * @param {object} [opts] — { name, commanderId }
   */
  createArmy(unitIds, opts = {}) {
    if (!Array.isArray(unitIds) || unitIds.length < 2) {
      return { success: false, reason: 'min_2_units' };
    }
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return { success: false, reason: 'no_gum' };

    const units = unitIds.map(id => gum.getUnit(id)).filter(Boolean);
    if (units.length < 2) return { success: false, reason: 'units_missing' };

    // Walidacja: wszyscy na tym samym hexie, ten sam owner, żaden nie w innej armii
    const first = units[0];
    const owner = first.owner ?? 'player';
    for (const u of units) {
      if (u.planetId !== first.planetId || u.q !== first.q || u.r !== first.r) {
        return { success: false, reason: 'different_hex' };
      }
      if ((u.owner ?? 'player') !== owner) {
        return { success: false, reason: 'mixed_owner' };
      }
      if (this._unitToArmy.has(u.id)) {
        return { success: false, reason: 'already_in_army', unitId: u.id };
      }
    }

    const id = `army_${_nextArmyId++}`;
    const autoName = ROMAN_NAMES[(_nextArmyId - 2) % ROMAN_NAMES.length] ?? `Armia ${_nextArmyId - 1}`;
    const army = {
      id,
      name: opts.name ?? autoName,
      ownerId: owner,
      commanderId: opts.commanderId ?? first.id,
      members: new Set(unitIds),
      planetId: first.planetId,
      q: first.q,
      r: first.r,
      createdYear: window.KOSMOS?.timeSystem?.gameTime ?? 0,
      lastBattleYear: null,
      // Statystyki bojowe (cumulative — aktualizowane przez combat events)
      kills: 0,
      losses: 0,
    };
    this._armies.set(id, army);
    for (const uid of unitIds) this._unitToArmy.set(uid, id);
    EventBus.emit('army:created', { army });
    return { success: true, army };
  }

  /**
   * Rozwiąż armię. Jednostki pozostają na swoich hexach, tylko tracą przynależność.
   */
  disbandArmy(armyId, reason = 'manual') {
    const army = this._armies.get(armyId);
    if (!army) return { success: false, reason: 'no_army' };
    for (const uid of army.members) this._unitToArmy.delete(uid);
    this._armies.delete(armyId);
    EventBus.emit('army:disbanded', { armyId, reason });
    return { success: true };
  }

  /**
   * Podziel armię: wydziel `splitIds` jako nową armię na tym samym hexie.
   * Pozostali członkowie zostają w oryginalnej armii.
   */
  splitArmy(armyId, splitIds) {
    const army = this._armies.get(armyId);
    if (!army) return { success: false, reason: 'no_army' };
    if (!Array.isArray(splitIds) || splitIds.length === 0) {
      return { success: false, reason: 'no_ids' };
    }
    // Sprawdź czy wszystkie splitIds są członkami
    for (const uid of splitIds) {
      if (!army.members.has(uid)) return { success: false, reason: 'not_member', unitId: uid };
    }
    const remaining = [...army.members].filter(uid => !splitIds.includes(uid));
    if (splitIds.length === army.members.size) {
      // Całość → po prostu rename nie ma sensu; zachowaj armię
      return { success: false, reason: 'split_all' };
    }
    if (remaining.length < 1) {
      return { success: false, reason: 'leave_empty' };
    }

    // Podziel na dwie. Nowa armia dostaje splitIds, stara zachowuje remaining.
    // Jeśli remaining ma 1 → stara się rozpada.
    for (const uid of splitIds) {
      army.members.delete(uid);
      this._unitToArmy.delete(uid);
    }

    let newArmy = null;
    if (splitIds.length >= 2) {
      const res = this.createArmy(splitIds);
      if (res.success) newArmy = res.army;
    }
    // Jeśli splitIds = 1, pojedyncza jednostka zostaje lose (bez armii).

    // Stara armia: jeśli została tylko 1 → disband
    if (army.members.size < 2) {
      this.disbandArmy(armyId, 'split_left_too_few');
    } else {
      EventBus.emit('army:split', { original: army, newArmy });
    }
    return { success: true, newArmy };
  }

  renameArmy(armyId, name) {
    const army = this._armies.get(armyId);
    if (!army) return { success: false, reason: 'no_army' };
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { success: false, reason: 'empty_name' };
    }
    army.name = name.trim();
    EventBus.emit('army:renamed', { armyId, name: army.name });
    return { success: true };
  }

  // ── Zapytania ────────────────────────────────────────────────────────────

  getArmy(armyId) { return this._armies.get(armyId) ?? null; }

  getArmyForUnit(unitId) {
    const armyId = this._unitToArmy.get(unitId);
    return armyId ? this._armies.get(armyId) : null;
  }

  getAllArmies() { return [...this._armies.values()]; }

  getArmiesOnPlanet(planetId) {
    return this.getAllArmies().filter(a => a.planetId === planetId);
  }

  getArmyOnHex(planetId, q, r) {
    return this.getAllArmies().find(a => a.planetId === planetId && a.q === q && a.r === r) ?? null;
  }

  /**
   * Jednostki na planecie które NIE należą do żadnej armii.
   */
  getLoseUnitsOnPlanet(planetId) {
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return [];
    return gum.getUnitsOnPlanet(planetId).filter(u => !this._unitToArmy.has(u.id));
  }

  // ── Event handlers (auto-cleanup) ────────────────────────────────────────

  _onUnitDestroyed(unitId) {
    const armyId = this._unitToArmy.get(unitId);
    if (!armyId) return;
    const army = this._armies.get(armyId);
    if (!army) return;
    army.members.delete(unitId);
    this._unitToArmy.delete(unitId);
    army.losses++;
    if (army.members.size < 2) {
      this.disbandArmy(armyId, 'too_few_members');
    }
  }

  _onUnitMoved(unitId, q, r) {
    const army = this.getArmyForUnit(unitId);
    if (!army) return;
    // Jeśli jednostka wyszła z hexa armii → wyrzuć ją
    if (q !== army.q || r !== army.r) {
      army.members.delete(unitId);
      this._unitToArmy.delete(unitId);
      if (army.members.size < 2) {
        this.disbandArmy(army.id, 'member_left');
      }
      return;
    }
    // Jeśli ALL members ruszają wspólnie (sprawdzenie przez zebranie wszystkich)
    // — ale to złożone. Na razie: jeśli unit wychodzi z hexa, opuszcza armię.
    // Group move obsługuje ColonyOverlay contextmenu (iteruje _selectedUnits
    // i wywołuje moveUnit dla każdego — wszyscy pójdą na ten sam target).
  }

  // ── Aktualizacja pozycji armii (gdy wszyscy dotrzeli do nowego hexa) ─────
  /**
   * Przesuń armię na (q,r) gdy wszyscy członkowie są już tam.
   * Wywołuje się z zewnątrz (np. po groundUnit:moved dla ostatniego członka).
   */
  syncArmyPositions() {
    const gum = window.KOSMOS?.groundUnitManager;
    if (!gum) return;
    for (const army of this._armies.values()) {
      const members = [...army.members].map(id => gum.getUnit(id)).filter(Boolean);
      if (members.length === 0) continue;
      const first = members[0];
      const allSame = members.every(m =>
        m.planetId === first.planetId && m.q === first.q && m.r === first.r
      );
      if (allSame && (army.q !== first.q || army.r !== first.r || army.planetId !== first.planetId)) {
        army.planetId = first.planetId;
        army.q = first.q;
        army.r = first.r;
        EventBus.emit('army:moved', { armyId: army.id, q: first.q, r: first.r });
      }
    }
  }

  // ── Serialize / restore ─────────────────────────────────────────────────

  serialize() {
    return {
      armies: [...this._armies.values()].map(a => ({
        id: a.id, name: a.name, ownerId: a.ownerId, commanderId: a.commanderId,
        members: [...a.members], planetId: a.planetId, q: a.q, r: a.r,
        createdYear: a.createdYear, lastBattleYear: a.lastBattleYear,
        kills: a.kills, losses: a.losses,
      })),
      nextId: _nextArmyId,
    };
  }

  restore(data) {
    this._armies.clear();
    this._unitToArmy.clear();
    if (!data) { _nextArmyId = 1; return; }
    _nextArmyId = data.nextId ?? 1;
    for (const a of (data.armies ?? [])) {
      const army = {
        id: a.id, name: a.name, ownerId: a.ownerId ?? 'player',
        commanderId: a.commanderId,
        members: new Set(a.members ?? []),
        planetId: a.planetId, q: a.q, r: a.r,
        createdYear: a.createdYear ?? 0,
        lastBattleYear: a.lastBattleYear ?? null,
        kills: a.kills ?? 0, losses: a.losses ?? 0,
      };
      this._armies.set(army.id, army);
      for (const uid of army.members) this._unitToArmy.set(uid, army.id);
    }
  }
}
