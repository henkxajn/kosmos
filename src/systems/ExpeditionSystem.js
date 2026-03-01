// ExpeditionSystem — zarządzanie misjami kosmicznymi
//
// Obsługuje wysyłanie, śledzenie i zakończenie ekspedycji do ciał niebieskich.
//
// Typy ekspedycji:
//   'recon'      — rozpoznanie układu (scope: 'nearest' | 'full_system')
//   'mining'     — wydobycie surowców (cel: zbadana asteroida, planetoida, inna planeta)
//   'scientific' — punkty nauki + odkrycie ciała (cel: zbadana kometa, asteroida, planeta, księżyc)
//   'colony'     — kolonizacja zbadanego ciała (cel: explored rocky/moon/planetoid)
//
// Wymagania do wysłania:
//   mining/scientific:
//     - technologia 'rocketry' zbadana
//     - budynek 'launch_pad' aktywny na mapie planety
//     - scientific: wymaga statku 'science_vessel' w hangarze floty
//     - koszt startowy: { minerals: 150, energy: 200, organics: 50 }
//     - wolni POPowie: freePops >= 0.5
//   colony:
//     - technologia 'colonization' zbadana
//     - budynek 'launch_pad' aktywny + statek 'colony_ship' w hangarze
//     - cel explored=true (wcześniejsza ekspedycja scientific)
//     - cel: skaliste ciało (planet rocky/ice, moon, planetoid)
//     - 2 wolne POPy (crewCost=2.0)
//     - koszt: { minerals: 500, energy: 300, organics: 200, water: 100 }
//     - colony_ship zużywany z hangaru po wysłaniu!
//
// Czas podróży = odległość_AU × 2 lat (minimum 2 lata, colony: minimum 3)
//
// Zdarzenia losowe przy przybyciu do celu:
//   mining/scientific:
//     5%  — katastrofa: brak zarobku
//     10% — częściowy sukces: zarobek × 0.5
//     75% — normalny sukces: zarobek × 1.0
//     10% — bonus: zarobek × 1.5
//   colony:
//     5%  — katastrofa: kolonia NIE powstaje, POPy giną
//     15% — trudny start: kolonia z -50% zasobów
//     70% — normalny: kolonia z pełnymi zasobami
//     10% — świetne warunki: kolonia z +50% zasobów
//
// Komunikacja:
//   Nasłuchuje: 'expedition:sendRequest' { type, targetId, sourcePlanetId }
//   Emituje:    'expedition:launched'    { expedition }
//               'expedition:arrived'    { expedition, gained, multiplier }
//               'expedition:disaster'   { expedition }
//               'expedition:returned'   { expedition }
//               'expedition:launchFailed' { reason }
//               'expedition:colonyFounded' { expedition, planetId, roll }
//               'civ:lockPops'          { amount }  → przy starcie
//               'civ:unlockPops'        { amount }  → przy powrocie/katastrofie

import EventBus          from '../core/EventBus.js';
import EntityManager     from '../core/EntityManager.js';
import { DistanceUtils } from '../utils/DistanceUtils.js';
import { SHIPS }         from '../data/ShipsData.js';

// Koszt ekspedycji mining/scientific (stały, niezależnie od celu)
const LAUNCH_COST          = { minerals: 150, energy: 200, organics: 50 };
// Koszt ekspedycji kolonizacyjnej
const COLONY_LAUNCH_COST   = { minerals: 500, energy: 300, organics: 200, water: 100 };
// Koszt misji rozpoznawczej
const RECON_COST           = { energy: 100 };
const MIN_TRAVEL_YEARS     = 2;     // minimalna długość podróży w latach gry
const MIN_COLONY_TRAVEL    = 3;     // minimalna podróż kolonizacyjna
const EXPEDITION_CREW_COST = 0.5;   // POP zablokowany na czas misji (mining/scientific)
const COLONY_CREW_COST     = 2.0;   // POPy blokowane przez ekspedycję kolonizacyjną
const RECON_CREW_COST      = 0.5;   // POP zablokowany na czas misji rozpoznawczej

// Zasoby startowe nowej kolonii (przed mnożnikiem zdarzenia)
const COLONY_START_RESOURCES = { minerals: 200, energy: 150, organics: 150, water: 100, research: 50 };

export class ExpeditionSystem {
  constructor(resourceSystem = null) {
    this.resourceSystem = resourceSystem;
    this._expeditions   = [];   // tablica aktywnych i ostatnich zakończonych misji
    this._nextId        = 1;
    this._gameYear      = 0;    // bieżący rok gry (śledzony z time:display)

    // Śledź bieżący rok gry
    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
    });

    // Sprawdzaj przybycia i powroty co tick
    EventBus.on('time:tick', () => this._checkArrivals());

    // Obsługa żądania wysłania ekspedycji z UI
    EventBus.on('expedition:sendRequest', ({ type, targetId, cargo }) =>
      this._launch(type, targetId, cargo));

    // Obsługa żądania transferu zasobów
    EventBus.on('expedition:transportRequest', ({ targetId, cargo }) =>
      this._launchTransport(targetId, cargo));
  }

  // ── API publiczne ──────────────────────────────────────────────────────────

  // Sprawdź czy gracz może aktualnie wysłać ekspedycję mining/scientific
  // Zwraca { ok, techOk, padOk, crewOk, vesselOk } — powody blokady jeśli !ok
  canLaunch(type = 'mining') {
    const techOk = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
    const padOk  = this._hasBuilding('launch_pad');
    const crewOk = (window.KOSMOS?.civSystem?.freePops ?? 0) >= EXPEDITION_CREW_COST;
    // Ekspedycje scientific wymagają statku naukowego w hangarze
    const colMgr = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const vesselOk = type !== 'scientific' || (colMgr?.hasShip(activePid, 'science_vessel') ?? false);
    return { ok: techOk && padOk && crewOk && vesselOk, techOk, padOk, crewOk, vesselOk };
  }

  // Sprawdź czy gracz może wysłać ekspedycję kolonizacyjną
  canLaunchColony(targetId) {
    const techOk   = window.KOSMOS?.techSystem?.isResearched('colonization') ?? false;
    const padOk    = this._hasBuilding('launch_pad');
    const colMgr   = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const shipOk   = colMgr?.hasShip(activePid, 'colony_ship') ?? false;
    const crewOk   = (window.KOSMOS?.civSystem?.freePops ?? 0) >= COLONY_CREW_COST;
    const target   = this._findTarget(targetId);
    const exploredOk = target?.explored === true;
    // Cel musi być skalisty (planet rocky/ice, moon, planetoid)
    const typeOk   = target
      ? (target.type === 'planetoid' || target.type === 'moon' ||
         (target.type === 'planet' && (target.planetType === 'rocky' || target.planetType === 'ice')))
      : false;
    // Nie można kolonizować ciała, które już ma kolonię
    const notColonized = colMgr ? !colMgr.hasColony(targetId) : true;
    return {
      ok: techOk && padOk && shipOk && crewOk && exploredOk && typeOk && notColonized,
      techOk, padOk, shipOk, crewOk, exploredOk, typeOk, notColonized
    };
  }

  // Sprawdź czy gracz może wysłać misję rozpoznawczą
  canLaunchRecon() {
    const techOk   = window.KOSMOS?.techSystem?.isResearched('rocketry') ?? false;
    const padOk    = this._hasBuilding('launch_pad');
    const crewOk   = (window.KOSMOS?.civSystem?.freePops ?? 0) >= RECON_CREW_COST;
    const colMgr   = window.KOSMOS?.colonyManager;
    const activePid = colMgr?.activePlanetId;
    const vesselOk = colMgr?.hasShip(activePid, 'science_vessel') ?? false;
    return { ok: techOk && padOk && crewOk && vesselOk, techOk, padOk, crewOk, vesselOk };
  }

  // Liczba niezbadanych ciał niebieskich wg typu
  getUnexploredCount() {
    const homePl = window.KOSMOS?.homePlanet;
    let planets = 0, moons = 0, other = 0;
    for (const p of EntityManager.getByType('planet')) {
      if (p === homePl) continue;
      if (!p.explored) planets++;
    }
    for (const m of EntityManager.getByType('moon')) {
      if (!m.explored) moons++;
    }
    for (const t of ['asteroid', 'comet', 'planetoid']) {
      for (const b of EntityManager.getByType(t)) {
        if (!b.explored) other++;
      }
    }
    const total = planets + moons + other;
    return { planets, moons, other, total };
  }

  // Szacowany czas misji rozpoznawczej
  getReconTime(scope) {
    if (scope === 'nearest') return 3;
    // 'full_system': 8 + (liczba planet × 2)
    const nPlanets = EntityManager.getByType('planet').length;
    return 8 + nPlanets * 2;
  }

  // Wszystkie ekspedycje (aktywne + ostatnie zakończone)
  getAll() {
    return [...this._expeditions];
  }

  // Tylko aktywne (en_route lub returning)
  getActive() {
    return this._expeditions.filter(e => e.status !== 'completed');
  }

  // Szacunkowy zarobek bez mnożnika zdarzenia (do wyświetlenia w modalu)
  estimateYield(type, targetId) {
    const target = this._findTarget(targetId);
    if (!target) return {};
    return this._baseYield(type, target);
  }

  // Serializacja do save
  serialize() {
    return {
      expeditions: this._expeditions.map(e => ({ ...e })),
      nextId:      this._nextId,
    };
  }

  // Odtworzenie ze save
  restore(data) {
    if (!data) return;
    this._expeditions = data.expeditions ?? [];
    this._nextId      = data.nextId ?? (this._expeditions.length + 1);

    // Przywróć lockedPops — aktywne ekspedycje blokują POPy
    let totalLocked = 0;
    for (const exp of this._expeditions) {
      if (exp.status === 'en_route' || exp.status === 'returning') {
        totalLocked += exp.crewCost ?? EXPEDITION_CREW_COST;
      }
    }
    if (totalLocked > 0) {
      EventBus.emit('civ:lockPops', { amount: totalLocked });
    }
  }

  // ── Prywatne ──────────────────────────────────────────────────────────────

  // Sprawdź czy istnieje aktywny budynek o danym id
  _hasBuilding(buildingId) {
    const bSys = window.KOSMOS?.buildingSystem;
    if (!bSys) return false;
    for (const [, entry] of bSys._active) {
      if (entry.building.id === buildingId) return true;
    }
    return false;
  }

  // Wyślij nową ekspedycję
  _launch(type, targetId) {
    // Rozdziel obsługę kolonizacji
    if (type === 'colony') {
      this._launchColony(targetId);
      return;
    }

    // Rozdziel obsługę misji rozpoznawczej
    if (type === 'recon') {
      this._launchRecon(targetId);  // targetId = 'nearest' | 'full_system'
      return;
    }

    // Sprawdź wymagania (mining/scientific)
    const { ok, techOk, padOk, crewOk, vesselOk } = this.canLaunch(type);
    if (!ok) {
      const reason = !techOk
        ? 'Brak technologii: Rakietnictwo'
        : !padOk
          ? 'Brak budynku: Wyrzutnia Rakietowa'
          : !vesselOk
            ? 'Brak statku: Statek Naukowy (zbuduj w Stoczni)'
            : `Brak wolnych POPów (potrzeba ${EXPEDITION_CREW_COST})`;
      EventBus.emit('expedition:launchFailed', { reason });
      return;
    }

    const target = this._findTarget(targetId);
    if (!target) {
      EventBus.emit('expedition:launchFailed', { reason: 'Nieznany cel ekspedycji' });
      return;
    }

    // Mining/scientific wymaga zbadanego celu
    if (!target.explored) {
      EventBus.emit('expedition:launchFailed', { reason: 'Cel nie został zbadany (wyślij misję rozpoznawczą)' });
      return;
    }

    // Sprawdź zasięg statku (scientific wymaga science_vessel)
    if (type === 'scientific' && !this._isInRange(target, 'science_vessel')) {
      const dist = DistanceUtils.orbitalFromHomeAU(target).toFixed(1);
      const range = SHIPS.science_vessel.range;
      EventBus.emit('expedition:launchFailed', {
        reason: `Cel poza zasięgiem statku (${dist} AU, zasięg: ${range} AU)`
      });
      return;
    }

    // Sprawdź i pobierz koszt startowy
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(LAUNCH_COST)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców startowych' });
        return;
      }
      this.resourceSystem.spend(LAUNCH_COST);
    }

    // Zablokuj POPy na czas misji
    EventBus.emit('civ:lockPops', { amount: EXPEDITION_CREW_COST });

    // Oblicz odległość i czas podróży
    const distance   = this._calcDistance(target);
    const travelTime = Math.max(MIN_TRAVEL_YEARS, Math.ceil(distance * 2));
    const departYear = Math.floor(this._gameYear);

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type,
      targetId,
      targetName:  target.name,
      targetType:  target.type,
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:    EXPEDITION_CREW_COST,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);
    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij ekspedycję kolonizacyjną
  _launchColony(targetId) {
    const check = this.canLaunchColony(targetId);
    if (!check.ok) {
      const reason = !check.techOk
        ? 'Brak technologii: Kolonizacja'
        : !check.padOk
          ? 'Brak budynku: Wyrzutnia Rakietowa'
          : !check.shipOk
            ? 'Brak statku: Statek Kolonijny (zbuduj w Stoczni)'
            : !check.crewOk
              ? `Brak wolnych POPów (potrzeba ${COLONY_CREW_COST})`
              : !check.exploredOk
                ? 'Cel nie został zbadany (wyślij najpierw ekspedycję naukową)'
                : !check.typeOk
                  ? 'Cel nie nadaje się do kolonizacji (wymagane skaliste ciało)'
                  : 'Cel już posiada kolonię';
      EventBus.emit('expedition:launchFailed', { reason });
      return;
    }

    const target = this._findTarget(targetId);

    // Sprawdź zasięg statku kolonijnego
    if (!this._isInRange(target, 'colony_ship')) {
      const dist = DistanceUtils.orbitalFromHomeAU(target).toFixed(1);
      const range = SHIPS.colony_ship.range;
      EventBus.emit('expedition:launchFailed', {
        reason: `Cel poza zasięgiem statku (${dist} AU, zasięg: ${range} AU)`
      });
      return;
    }

    // Pobierz zasoby
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(COLONY_LAUNCH_COST)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców startowych' });
        return;
      }
      this.resourceSystem.spend(COLONY_LAUNCH_COST);
    }

    // Zablokuj 2 POPy
    EventBus.emit('civ:lockPops', { amount: COLONY_CREW_COST });

    // Zużyj colony_ship z hangaru floty
    const colMgrC = window.KOSMOS?.colonyManager;
    if (colMgrC) {
      colMgrC.consumeShip(colMgrC.activePlanetId, 'colony_ship');
    }

    // Oblicz odległość i czas podróży
    const distance   = this._calcDistance(target);
    const travelTime = Math.max(MIN_COLONY_TRAVEL, Math.ceil(distance * 2));
    const departYear = Math.floor(this._gameYear);

    const expedition = {
      id:             `exp_${this._nextId++}`,
      type:           'colony',
      targetId,
      targetName:     target.name,
      targetType:     target.type,
      departYear,
      arrivalYear:    departYear + travelTime,
      returnYear:     null,   // ekspedycja kolonizacyjna nie wraca
      distance:       parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:       COLONY_CREW_COST,
      status:         'en_route',
      gained:         null,
      eventRoll:      null,
    };

    this._expeditions.push(expedition);
    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij transport zasobów między koloniami
  _launchTransport(targetId, cargo) {
    if (!cargo || Object.keys(cargo).length === 0) {
      EventBus.emit('expedition:launchFailed', { reason: 'Brak ładunku do transportu' });
      return;
    }

    const padOk  = this._hasBuilding('launch_pad');
    const crewOk = (window.KOSMOS?.civSystem?.freePops ?? 0) >= EXPEDITION_CREW_COST;

    if (!padOk) {
      EventBus.emit('expedition:launchFailed', { reason: 'Brak budynku: Wyrzutnia Rakietowa' });
      return;
    }
    if (!crewOk) {
      EventBus.emit('expedition:launchFailed', { reason: `Brak wolnych POPów (potrzeba ${EXPEDITION_CREW_COST})` });
      return;
    }

    // Sprawdź czy kolonia docelowa istnieje
    const colMgr = window.KOSMOS?.colonyManager;
    if (!colMgr?.hasColony(targetId)) {
      EventBus.emit('expedition:launchFailed', { reason: 'Kolonia docelowa nie istnieje' });
      return;
    }

    // Pobierz zasoby z bieżącej kolonii
    if (this.resourceSystem && !this.resourceSystem.canAfford(cargo)) {
      EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców do transportu' });
      return;
    }
    if (this.resourceSystem) this.resourceSystem.spend(cargo);

    // Zablokuj POPy na czas transportu
    EventBus.emit('civ:lockPops', { amount: EXPEDITION_CREW_COST });

    const target = this._findTarget(targetId);
    const distance   = this._calcDistance(target || { orbital: { a: 2 } });
    const travelTime = Math.max(MIN_TRAVEL_YEARS, Math.ceil(distance * 2));
    const departYear = Math.floor(this._gameYear);

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type:        'transport',
      targetId,
      targetName:  target?.name ?? colMgr.getColony(targetId)?.name ?? targetId,
      targetType:  target?.type ?? 'colony',
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(2)),
      travelTime,
      crewCost:    EXPEDITION_CREW_COST,
      cargo:       { ...cargo },
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);
    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij misję rozpoznawczą
  // scope: 'nearest' — najbliższa niezbadana planeta; 'full_system' — cały układ
  _launchRecon(scope) {
    const { ok, techOk, padOk, crewOk, vesselOk } = this.canLaunchRecon();
    if (!ok) {
      const reason = !techOk
        ? 'Brak technologii: Rakietnictwo'
        : !padOk
          ? 'Brak budynku: Wyrzutnia Rakietowa'
          : !vesselOk
            ? 'Brak statku: Statek Naukowy (zbuduj w Stoczni)'
            : `Brak wolnych POPów (potrzeba ${RECON_CREW_COST})`;
      EventBus.emit('expedition:launchFailed', { reason });
      return;
    }

    // Sprawdź czy jest coś do zbadania
    const unexplored = this.getUnexploredCount();
    if (scope === 'nearest' && unexplored.planets === 0) {
      EventBus.emit('expedition:launchFailed', { reason: 'Brak niezbadanych planet' });
      return;
    }
    if (unexplored.total === 0) {
      EventBus.emit('expedition:launchFailed', { reason: 'Układ w pełni zbadany' });
      return;
    }

    // Pobierz koszt
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(RECON_COST)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców (100⚡)' });
        return;
      }
      this.resourceSystem.spend(RECON_COST);
    }

    // Zablokuj POPy
    EventBus.emit('civ:lockPops', { amount: RECON_CREW_COST });

    // Oblicz czas podróży
    const travelTime = this.getReconTime(scope);
    const departYear = Math.floor(this._gameYear);

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type:        'recon',
      scope,
      targetId:    scope,
      targetName:  scope === 'nearest' ? 'Najbliższa planeta' : 'Cały układ',
      targetType:  'recon',
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    0,
      travelTime,
      crewCost:    RECON_CREW_COST,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);
    EventBus.emit('expedition:launched', { expedition });
  }

  // Sprawdź przybycia i powroty przy każdym time:tick
  _checkArrivals() {
    let changed = false;

    for (const exp of this._expeditions) {
      if (exp.status === 'en_route' && this._gameYear >= exp.arrivalYear) {
        this._processArrival(exp);
        changed = true;
      } else if (exp.status === 'returning' && exp.returnYear && this._gameYear >= exp.returnYear) {
        exp.status = 'completed';
        // Odblokuj POPy — załoga wraca
        EventBus.emit('civ:unlockPops', { amount: exp.crewCost ?? EXPEDITION_CREW_COST });
        EventBus.emit('expedition:returned', { expedition: exp });
        changed = true;
      }
    }

    // Ogranicz historię zakończonych ekspedycji do ostatnich 5
    if (changed) {
      const completed = this._expeditions.filter(e => e.status === 'completed');
      if (completed.length > 5) {
        const keep = new Set(completed.slice(-5));
        this._expeditions = this._expeditions.filter(
          e => e.status !== 'completed' || keep.has(e)
        );
      }
    }
  }

  // Przetwórz przybycie ekspedycji — losuj zdarzenie i oblicz zarobek
  _processArrival(exp) {
    // Ekspedycja kolonizacyjna — osobna obsługa
    if (exp.type === 'colony') {
      this._processColonyArrival(exp);
      return;
    }

    // Transport zasobów — dostarczenie ładunku do kolonii docelowej
    if (exp.type === 'transport') {
      this._processTransportArrival(exp);
      return;
    }

    // Misja rozpoznawcza — osobna obsługa
    if (exp.type === 'recon') {
      this._processReconArrival(exp);
      return;
    }

    const roll = Math.random() * 100;
    exp.eventRoll = roll;

    if (roll < 5) {
      // KATASTROFA (5%) — brak zarobku, załoga zaginiona → odblokuj POPy
      exp.status = 'completed';
      exp.gained = {};
      EventBus.emit('civ:unlockPops', { amount: exp.crewCost ?? EXPEDITION_CREW_COST });
      EventBus.emit('expedition:disaster', { expedition: exp });
      return;
    }

    // Ekspedycja naukowa → oznacz cel jako zbadany
    if (exp.type === 'scientific') {
      const target = this._findTarget(exp.targetId);
      if (target) target.explored = true;
    }

    // Oblicz zarobek bazowy
    const target    = this._findTarget(exp.targetId);
    const baseGains = this._baseYield(exp.type, target);

    // Zastosuj mnożnik zdarzenia
    let multiplier;
    if      (roll < 15) multiplier = 0.5;    // częściowy sukces (10%)
    else if (roll < 90) multiplier = 1.0;    // normalny sukces (75%)
    else                multiplier = 1.5;    // bonus (10%)

    const gained = {};
    for (const [key, val] of Object.entries(baseGains)) {
      gained[key] = Math.floor(val * multiplier);
    }

    exp.gained = gained;
    exp.status = 'returning';

    // Dostarcz zasoby przy przybyciu (nie przy powrocie)
    if (this.resourceSystem && Object.keys(gained).length > 0) {
      this.resourceSystem.receive(gained);
    }

    EventBus.emit('expedition:arrived', { expedition: exp, gained, multiplier });
  }

  // Przetwórz przybycie ekspedycji kolonizacyjnej
  _processColonyArrival(exp) {
    const roll = Math.random() * 100;
    exp.eventRoll = roll;

    if (roll < 5) {
      // KATASTROFA (5%) — kolonia NIE powstaje, POPy giną, zasoby stracone
      exp.status = 'completed';
      exp.gained = {};
      // POPy giną — nie odblokuj, ale zmniejsz populację
      EventBus.emit('civ:unlockPops', { amount: exp.crewCost });
      // Emituj śmierć za każdy POP
      for (let i = 0; i < exp.crewCost; i++) {
        EventBus.emit('civ:popDied', { cause: 'colony_disaster', population: 0 });
      }
      EventBus.emit('expedition:disaster', { expedition: exp });
      return;
    }

    // Oblicz mnożnik zasobów startowych
    let resourceMult;
    if      (roll < 20) resourceMult = 0.5;   // trudny start (15%)
    else if (roll < 90) resourceMult = 1.0;   // normalny (70%)
    else                resourceMult = 1.5;   // świetne warunki (10%)

    // Zasoby startowe z mnożnikiem
    const startResources = {};
    for (const [key, val] of Object.entries(COLONY_START_RESOURCES)) {
      startResources[key] = Math.floor(val * resourceMult);
    }

    exp.gained = startResources;
    exp.status = 'completed';   // ekspedycja kolonizacyjna nie wraca

    // Odblokuj POPy ze źródła (zostaną przeniesione do nowej kolonii)
    EventBus.emit('civ:unlockPops', { amount: exp.crewCost });

    // Emituj zdarzenie założenia kolonii — ColonyManager obsłuży
    EventBus.emit('expedition:colonyFounded', {
      expedition:     exp,
      planetId:       exp.targetId,
      startResources,
      startPop:       exp.crewCost,   // 2 POPy
      roll:           roll,
      resourceMult,
    });

    EventBus.emit('expedition:arrived', {
      expedition: exp,
      gained: startResources,
      multiplier: resourceMult,
    });
  }

  // Przetwórz przybycie transportu zasobów
  _processTransportArrival(exp) {
    const colMgr = window.KOSMOS?.colonyManager;
    const targetCol = colMgr?.getColony(exp.targetId);

    if (targetCol && exp.cargo) {
      // Dostarczenie ładunku do kolonii docelowej
      targetCol.resourceSystem.receive(exp.cargo);
    }

    exp.gained = exp.cargo || {};
    exp.status = 'returning';  // załoga wraca

    EventBus.emit('expedition:arrived', {
      expedition: exp,
      gained: exp.cargo,
      multiplier: 1.0,
    });
  }

  // Przetwórz przybycie misji rozpoznawczej
  _processReconArrival(exp) {
    const roll = Math.random() * 100;
    exp.eventRoll = roll;

    if (roll < 5) {
      // KATASTROFA (5%) — statek utracony, załoga zaginiona
      exp.status = 'completed';
      exp.gained = {};
      EventBus.emit('civ:unlockPops', { amount: exp.crewCost ?? RECON_CREW_COST });
      // Zużyj statek naukowy przy katastrofie
      const colMgr = window.KOSMOS?.colonyManager;
      const activePid = colMgr?.activePlanetId;
      if (colMgr) colMgr.consumeShip(activePid, 'science_vessel');
      EventBus.emit('expedition:disaster', { expedition: exp });
      return;
    }

    // Sukces — odkryj ciała
    const discovered = [];

    if (exp.scope === 'nearest') {
      // Odkryj najbliższą niezbadaną planetę + jej księżyce
      const planet = this._findNearestUnexplored();
      if (planet) {
        planet.explored = true;
        discovered.push(planet.id);
        // Odkryj też księżyce tej planety
        for (const m of EntityManager.getByType('moon')) {
          if (m.parentPlanetId === planet.id && !m.explored) {
            m.explored = true;
            discovered.push(m.id);
          }
        }
      }
    } else {
      // 'full_system' — odkryj WSZYSTKIE ciała niebieskie
      const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
      const homePl = window.KOSMOS?.homePlanet;
      for (const t of TYPES) {
        for (const b of EntityManager.getByType(t)) {
          if (b === homePl) continue;
          if (!b.explored) {
            b.explored = true;
            discovered.push(b.id);
          }
        }
      }
    }

    exp.gained = { discovered: discovered.length };
    exp.status = 'returning';

    EventBus.emit('expedition:reconComplete', {
      expedition: exp,
      scope: exp.scope,
      discovered,
    });
    EventBus.emit('expedition:arrived', { expedition: exp, gained: exp.gained, multiplier: 1.0 });
  }

  // Znajdź najbliższą niezbadaną planetę (wg odległości od homePlanet)
  _findNearestUnexplored() {
    const homePl = window.KOSMOS?.homePlanet;
    const planets = EntityManager.getByType('planet')
      .filter(p => !p.explored && p !== homePl);
    if (planets.length === 0) return null;
    planets.sort((a, b) => this._calcDistance(a) - this._calcDistance(b));
    return planets[0];
  }

  // Bazowy zarobek bez mnożnika zdarzenia
  // Używany zarówno do szacunków (modal) jak i do obliczeń przy przybyciu
  _baseYield(type, target) {
    if (!target) return { minerals: 30 };

    const gained = {};

    if (target.type === 'asteroid' || target.type === 'planetoid') {
      // Asteroidy i planetoidy — głównie minerały wg zawartości żelaza
      const feContent  = target.composition?.Fe ?? 20;
      const massFactor = target.physics?.mass   ?? 1;
      gained.minerals  = Math.max(20, Math.min(300,
        Math.floor(feContent * 1.5 + massFactor * 20)
      ));
      if (type === 'scientific') {
        gained.research = 30;
      }

    } else if (target.type === 'comet') {
      // Komety — bogate w lód wodny i organikę
      gained.water    = 200;   // szacunek (losowy przy przybyciu przez mnożnik)
      gained.organics = 40;
      gained.research = 50;

    } else if (target.type === 'moon') {
      // Księżyc — mniejszy zarobek niż planeta, zależny od typu
      const isMassive = (target.physics?.mass ?? 0) > 0.01;
      gained.minerals = isMassive ? 80 : 40;
      if (target.moonType === 'icy') {
        gained.water = 100;
      }
      if (type === 'scientific') {
        gained.research = 40;
      }

    } else if (target.type === 'planet') {
      // Inna planeta — minerały i woda wg składu chemicznego
      const comp     = target.composition ?? {};
      gained.minerals = Math.max(30, Math.floor((comp.Fe  ?? 15) * 0.8));
      gained.water    = Math.max(10, Math.floor((comp.H2O ?? 5)  * 0.8));
      if (target.surface?.hasWater) {
        gained.organics = 30;
      }
      if (type === 'scientific') {
        gained.research = (target.lifeScore ?? 0) > 30 ? 80 : 30;
      }

    } else {
      // Fallback
      gained.minerals = 30;
    }

    return gained;
  }

  // Oblicz odległość od planety domowej do celu w AU (euklidesowa, dynamiczna)
  _calcDistance(target) {
    const home = window.KOSMOS?.homePlanet;
    if (!home || !target) return 0.5;
    const dist = DistanceUtils.euclideanAU(home, target);
    // Minimum 0.5 AU — podróże muszą trwać co najmniej MIN_TRAVEL_YEARS lat
    return Math.max(0.5, dist);
  }

  // Sprawdź czy cel jest w zasięgu statku (orbitalna, stabilna metryka)
  _isInRange(target, shipId) {
    const ship = SHIPS[shipId];
    if (!ship || !ship.range) return true; // brak limitu = brak blokady
    const dist = DistanceUtils.orbitalFromHomeAU(target);
    return dist <= ship.range;
  }

  // Znajdź ciało niebieskie po id — przeszukaj wszystkie typy
  _findTarget(targetId) {
    const TYPES = ['planet', 'moon', 'asteroid', 'comet', 'planetoid'];
    for (const t of TYPES) {
      const bodies = EntityManager.getByType(t);
      const found  = bodies.find(b => b.id === targetId);
      if (found) return found;
    }
    return null;
  }
}
