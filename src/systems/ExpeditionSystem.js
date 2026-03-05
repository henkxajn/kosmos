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
//     - koszt startowy: { Fe: 50, C: 20 }
//     - wolni POPowie: freePops >= 0.5
//   colony:
//     - technologia 'colonization' zbadana
//     - budynek 'launch_pad' aktywny + statek 'colony_ship' w hangarze
//     - cel explored=true (wcześniejsza ekspedycja scientific)
//     - cel: skaliste ciało (planet rocky/ice, moon, planetoid)
//     - 2 wolne POPy (crewCost=2.0)
//     - koszt: { Fe: 150, C: 50, Ti: 20, food: 100, water: 50 }
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
import { COMMODITIES }   from '../data/CommoditiesData.js';

// Koszt ekspedycji mining/scientific (stały, niezależnie od celu)
const LAUNCH_COST          = { Fe: 50, C: 20 };
// Koszt ekspedycji kolonizacyjnej
const COLONY_LAUNCH_COST   = { Fe: 150, C: 50, Ti: 20, food: 100, water: 50 };
// Koszt misji rozpoznawczej (symboliczny — energia flow nie pobierana z inventory)
const RECON_COST           = { Fe: 10 };
const MIN_TRAVEL_YEARS     = 0.008; // ~3 dni gry — absolutne minimum podróży
const MIN_COLONY_TRAVEL    = 0.02;  // ~7 dni gry — minimum podróży kolonizacyjnej
const EXPEDITION_CREW_COST = 0.5;   // POP zablokowany na czas misji (mining/scientific)
const COLONY_CREW_COST     = 2.0;   // POPy blokowane przez ekspedycję kolonizacyjną
const RECON_CREW_COST      = 0.5;   // POP zablokowany na czas misji rozpoznawczej

// Zasoby startowe nowej kolonii (przed mnożnikiem zdarzenia)
const COLONY_START_RESOURCES = { Fe: 200, C: 150, Si: 100, Cu: 50, food: 100, water: 100, research: 50 };

export class ExpeditionSystem {
  constructor(resourceSystem = null) {
    this.resourceSystem = resourceSystem;
    this._expeditions   = [];   // tablica aktywnych i ostatnich zakończonych misji
    this._nextId        = 1;
    this._gameYear      = 0;    // bieżący rok gry (śledzony z time:display)
    this._visitCounts   = new Map(); // Map<bodyId, number> — licznik wizyt

    // Śledź bieżący rok gry
    EventBus.on('time:display', ({ gameTime }) => {
      this._gameYear = gameTime;
    });

    // Sprawdzaj przybycia i powroty co tick
    EventBus.on('time:tick', () => this._checkArrivals());

    // Obsługa żądania wysłania ekspedycji z UI
    EventBus.on('expedition:sendRequest', ({ type, targetId, cargo, vesselId }) =>
      this._launch(type, targetId, cargo, vesselId));

    // Obsługa żądania transferu zasobów
    EventBus.on('expedition:transportRequest', ({ targetId, cargo, vesselId, cargoPreloaded }) =>
      this._launchTransport(targetId, cargo, vesselId, cargoPreloaded));

    // Obsługa rozkazu powrotu z orbity
    EventBus.on('expedition:orderReturn', ({ expeditionId }) =>
      this._orderReturn(expeditionId));

    // Obsługa rozkazu zmiany celu z orbity
    EventBus.on('expedition:orderRedirect', ({ expeditionId, targetId }) =>
      this._orderRedirect(expeditionId, targetId));

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
  getReconTime(scope, vesselId) {
    const speed = this._getShipSpeed(vesselId);
    if (scope === 'nearest') {
      // Dynamiczny: dystans do najbliższej niezbadanej planety / prędkość
      const nearest = this._findNearestUnexplored();
      const dist = nearest ? this._calcDistance(nearest) : 2.0;
      return parseFloat(Math.max(0.05, dist / speed).toFixed(3));
    }
    if (scope === 'full_system') {
      // Szacunek: dystans do najbliższego × ~N (sekwencyjne odkrywanie)
      const nearest = this._findNearestUnexplored();
      const dist = nearest ? this._calcDistance(nearest) : 2.0;
      const unexploredTotal = this.getUnexploredCount().total;
      // Optymistyczny szacunek: średni dystans × liczba ciał
      return parseFloat(Math.max(0.1, (dist / speed) * Math.max(1, unexploredTotal * 0.7)).toFixed(1));
    }
    // Konkretne ciało (targetId) — dystans do celu × 2 (tam i z powrotem)
    const target = this._findTarget(scope);
    if (target) {
      const dist = this._calcDistance(target);
      return parseFloat(Math.max(0.05, (dist / speed) * 2).toFixed(3));
    }
    return 1.0;
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

  // Pobierz liczbę wizyt na ciele
  getVisitCount(bodyId) { return this._visitCounts.get(bodyId) ?? 0; }

  // Serializacja do save
  serialize() {
    // Konwersja Map → Object dla visitCounts
    const visitObj = {};
    for (const [k, v] of this._visitCounts) visitObj[k] = v;
    return {
      expeditions: this._expeditions.map(e => ({ ...e })),
      nextId:      this._nextId,
      visitCounts: visitObj,
    };
  }

  // Odtworzenie ze save
  restore(data) {
    if (!data) return;
    this._expeditions = data.expeditions ?? [];
    this._nextId      = data.nextId ?? (this._expeditions.length + 1);

    // Przywróć visitCounts
    this._visitCounts.clear();
    if (data.visitCounts) {
      for (const [k, v] of Object.entries(data.visitCounts)) {
        this._visitCounts.set(k, v);
      }
    }

    // Przywróć lockedPops — aktywne ekspedycje blokują POPy
    let totalLocked = 0;
    for (const exp of this._expeditions) {
      if (exp.status === 'en_route' || exp.status === 'returning' || exp.status === 'orbiting') {
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
  // vesselId: opcjonalny — konkretny statek do przypisania (nowy system)
  _launch(type, targetId, cargo, vesselId) {
    // Rozdziel obsługę kolonizacji
    if (type === 'colony') {
      this._launchColony(targetId, vesselId);
      return;
    }

    // Rozdziel obsługę misji rozpoznawczej
    if (type === 'recon') {
      this._launchRecon(targetId, vesselId);  // targetId = 'nearest' | 'full_system'
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

    // Oblicz odległość
    const distance = this._calcDistance(target);

    // Sprawdź zasięg: jeśli podano vessel → sprawdź paliwo, inaczej stary system (range)
    const vMgr = window.KOSMOS?.vesselManager;
    let assignedVesselId = vesselId ?? null;
    if (vMgr && assignedVesselId) {
      const vessel = vMgr.getVessel(assignedVesselId);
      if (!vessel || vessel.status !== 'idle') {
        EventBus.emit('expedition:launchFailed', { reason: 'Statek niedostępny' });
        return;
      }
      const fuelNeeded = distance * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        EventBus.emit('expedition:launchFailed', {
          reason: `Brak paliwa (potrzeba ${fuelNeeded.toFixed(1)} pc, ma ${vessel.fuel.current.toFixed(1)})`
        });
        return;
      }
    } else if (type === 'scientific' && !this._isInRange(target, 'science_vessel')) {
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

    // Czas podróży — nowa formuła: dystans / prędkość statku
    const shipSpeed  = this._getShipSpeed(assignedVesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type,
      targetId,
      targetName:  target.name,
      targetType:  target.type,
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    EXPEDITION_CREW_COST,
      vesselId:    assignedVesselId,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);

    // Wyślij vessel na misję (jeśli przypisany)
    if (vMgr && assignedVesselId) {
      vMgr.dispatchOnMission(assignedVesselId, {
        type,
        targetId,
        targetName: target.name,
        departYear,
        arrivalYear: expedition.arrivalYear,
        returnYear:  expedition.returnYear,
        fuelCost:    distance * (vMgr.getVessel(assignedVesselId)?.fuel?.consumption ?? 0),
      });
    }

    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij ekspedycję kolonizacyjną
  _launchColony(targetId, vesselId) {
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
    const distance = this._calcDistance(target);

    // Sprawdź zasięg: vessel → paliwo, fallback → stary range
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (!vessel || vessel.status !== 'idle') {
        EventBus.emit('expedition:launchFailed', { reason: 'Statek niedostępny' });
        return;
      }
      const fuelNeeded = distance * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        EventBus.emit('expedition:launchFailed', {
          reason: `Brak paliwa (potrzeba ${fuelNeeded.toFixed(1)} pc, ma ${vessel.fuel.current.toFixed(1)})`
        });
        return;
      }
    } else if (!this._isInRange(target, 'colony_ship')) {
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

    // Czas podróży — colony_ship wolniejszy (speedAU = 0.8)
    const colonySpeed = SHIPS.colony_ship?.speedAU ?? 0.8;
    const travelTime  = parseFloat(Math.max(MIN_COLONY_TRAVEL, distance / colonySpeed).toFixed(3));
    const departYear  = this._gameYear;

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
      vesselId:       vesselId ?? null,
    };

    this._expeditions.push(expedition);

    // Wyślij vessel na misję (widoczny na mapie 3D podczas lotu)
    if (vMgr && vesselId) {
      vMgr.dispatchOnMission(vesselId, {
        type:        'colony',
        targetId,
        targetName:  target.name,
        departYear,
        arrivalYear: expedition.arrivalYear,
        returnYear:  null,
        fuelCost:    distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0),
      });
    }

    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij transport zasobów między koloniami
  _launchTransport(targetId, cargo, vesselId, cargoPreloaded = false) {
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

    const colMgr = window.KOSMOS?.colonyManager;

    // Pobierz zasoby z kolonii — pomiń jeśli cargo już załadowane na statek
    if (!cargoPreloaded) {
      if (this.resourceSystem && !this.resourceSystem.canAfford(cargo)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców do transportu' });
        return;
      }
      if (this.resourceSystem) this.resourceSystem.spend(cargo);
    }

    // Zablokuj POPy na czas transportu
    EventBus.emit('civ:lockPops', { amount: EXPEDITION_CREW_COST });

    const target = this._findTarget(targetId);
    const distance   = this._calcDistance(target || { orbital: { a: 2 } });
    const shipSpeed  = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

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
      vesselId:    vesselId ?? null,
      cargo:       { ...cargo },
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);

    // Wyślij vessel na transport
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr && vesselId) {
      vMgr.dispatchOnMission(vesselId, {
        type: 'transport', targetId,
        targetName: expedition.targetName,
        departYear, arrivalYear: expedition.arrivalYear, returnYear: expedition.returnYear,
        fuelCost: distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0),
        cargo: { ...cargo },
      });
    }

    EventBus.emit('expedition:launched', { expedition });
  }

  // Rozkaz powrotu statku z orbity (gracz ręcznie wywołuje)
  _orderReturn(expeditionId) {
    const exp = this._expeditions.find(e => e.id === expeditionId);
    if (!exp || (exp.status !== 'orbiting' && exp.status !== 'en_route')) return;

    const vMgr = window.KOSMOS?.vesselManager;
    const shipSpeed = this._getShipSpeed(exp.vesselId);

    if (exp.status === 'en_route') {
      // Zawrócenie w locie — oblicz dystans z bieżącej pozycji statku do bazy
      const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;
      const homeEntity = vessel ? EntityManager.getById(vessel.colonyId) : null;
      let returnDist = exp.distance; // fallback
      if (vessel && homeEntity) {
        returnDist = DistanceUtils.euclideanAU(
          { x: vessel.position.x, y: vessel.position.y },
          homeEntity
        );
      }
      const returnTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, returnDist / shipSpeed).toFixed(3));
      exp.status = 'returning';
      exp.returnYear = this._gameYear + returnTime;
      if (vessel?.mission) {
        vessel.mission.returnYear = exp.returnYear;
      }
      if (vMgr && exp.vesselId) vMgr.startReturn(exp.vesselId);
    } else {
      // Z orbity — standardowy powrót (dystans = droga tam)
      const returnTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, exp.distance / shipSpeed).toFixed(3));
      exp.status = 'returning';
      exp.returnYear = this._gameYear + returnTime;
      if (vMgr && exp.vesselId) {
        const vessel = vMgr.getVessel(exp.vesselId);
        if (vessel?.mission) {
          vessel.mission.returnYear = exp.returnYear;
        }
        vMgr.startReturn(exp.vesselId);
      }
    }

    EventBus.emit('expedition:returnOrdered', { expedition: exp });
  }

  // Rozkaz zmiany celu statku na orbicie (gracz ręcznie wywołuje)
  _orderRedirect(expeditionId, newTargetId) {
    const exp = this._expeditions.find(e => e.id === expeditionId);
    if (!exp || exp.status !== 'orbiting') return;

    const target = this._findTarget(newTargetId);
    if (!target) {
      EventBus.emit('expedition:redirectFailed', { reason: 'Nieznany cel' });
      return;
    }

    // Oblicz dystans od bieżącej pozycji (orbiting body) do nowego celu
    const currentBody = this._findTarget(exp.targetId);
    const dist = currentBody
      ? DistanceUtils.euclideanAU(currentBody, target)
      : this._calcDistance(target);

    // Sprawdź paliwo (tylko w jedną stronę — statek będzie orbitował nowy cel)
    const vMgr = window.KOSMOS?.vesselManager;
    if (exp.vesselId && vMgr) {
      const vessel = vMgr.getVessel(exp.vesselId);
      if (vessel) {
        const fuelNeeded = dist * vessel.fuel.consumption;
        if (vessel.fuel.current < fuelNeeded) {
          EventBus.emit('expedition:redirectFailed', {
            reason: `Brak paliwa (potrzeba ${fuelNeeded.toFixed(1)} pc, ma ${vessel.fuel.current.toFixed(1)})`
          });
          return;
        }
      }
    }

    // Zaktualizuj ekspedycję
    const shipSpeed = this._getShipSpeed(exp.vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, dist / shipSpeed).toFixed(3));

    exp.targetId    = newTargetId;
    exp.targetName  = target.name ?? '???';
    exp.distance    = parseFloat(dist.toFixed(4));
    exp.arrivalYear = this._gameYear + travelTime;
    exp.returnYear  = null;
    exp.status      = 'en_route';

    // Przekieruj vessel
    if (exp.vesselId && vMgr) {
      vMgr.redirectToTarget(exp.vesselId, newTargetId, exp.arrivalYear);
    }

    EventBus.emit('expedition:redirected', { expedition: exp });
  }

  // _deliverCargo — usunięte: statek transportowy teraz dostarcza ładunek natychmiast

  // Wyślij misję rozpoznawczą
  // scope: 'nearest' | 'full_system' | konkretne body.id
  _launchRecon(scope, vesselId) {
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
    const isSpecificTarget = scope !== 'nearest' && scope !== 'full_system';

    if (!isSpecificTarget) {
      if (scope === 'nearest' && unexplored.planets === 0 && unexplored.moons === 0) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak niezbadanych ciał niebieskich' });
        return;
      }
      if (unexplored.total === 0) {
        EventBus.emit('expedition:launchFailed', { reason: 'Układ w pełni zbadany' });
        return;
      }
    }

    // Rozpoznanie konkretnego ciała — osobna logika
    if (isSpecificTarget) {
      this._launchReconTarget(scope, vesselId);
      return;
    }

    // Pobierz koszt
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(RECON_COST)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców startowych' });
        return;
      }
      this.resourceSystem.spend(RECON_COST);
    }

    // Zablokuj POPy
    EventBus.emit('civ:lockPops', { amount: RECON_CREW_COST });

    const departYear = this._gameYear;
    const vMgr = window.KOSMOS?.vesselManager;

    if (scope === 'full_system') {
      // Sekwencyjny recon: pierwszy cel = najbliższy niezbadany od homePlanet
      // Pomija ciała będące celami innych aktywnych recon ekspedycji
      const firstTarget = this._findNearestUnexplored(null);
      if (!firstTarget) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak niezbadanych ciał' });
        return;
      }
      const distance = this._calcDistance(firstTarget);
      const shipSpeed = this._getShipSpeed(vesselId);
      const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));

      const expedition = {
        id:               `exp_${this._nextId++}`,
        type:             'recon',
        scope:            'full_system',
        targetId:         firstTarget.id,
        targetName:       'Cały układ',
        targetType:       'recon',
        departYear,
        arrivalYear:      departYear + travelTime,
        returnYear:       null, // obliczone dynamicznie przy powrocie
        distance:         parseFloat(distance.toFixed(4)),
        travelTime,
        crewCost:         RECON_CREW_COST,
        vesselId:         vesselId ?? null,
        status:           'en_route',
        gained:           null,
        eventRoll:        null,
        bodiesDiscovered: [], // ciała odkryte sekwencyjnie
      };

      this._expeditions.push(expedition);

      // Wyślij vessel — paliwo za pierwszy odcinek
      if (vMgr && vesselId) {
        const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
        vMgr.dispatchOnMission(vesselId, {
          type: 'recon', targetId: firstTarget.id,
          targetName: firstTarget.name,
          departYear, arrivalYear: expedition.arrivalYear, returnYear: null,
          fuelCost,
        });
      }

      EventBus.emit('expedition:launched', { expedition });
      return;
    }

    // scope === 'nearest' — pojedynczy lot do najbliższego ciała
    // Pomija ciała będące celami innych aktywnych recon ekspedycji
    const nearest = this._findNearestUnexplored(null);
    const distance = nearest ? this._calcDistance(nearest) : 0.1;
    const shipSpeed = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type:        'recon',
      scope:       'nearest',
      targetId:    nearest?.id ?? 'nearest',
      targetName:  nearest?.name ?? 'Najbliższe ciało',
      targetType:  'recon',
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    RECON_CREW_COST,
      vesselId:    vesselId ?? null,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);

    // Wyślij vessel na misję
    if (vMgr && vesselId) {
      const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
      vMgr.dispatchOnMission(vesselId, {
        type: 'recon', targetId: nearest?.id ?? 'nearest',
        targetName: expedition.targetName,
        departYear, arrivalYear: expedition.arrivalYear, returnYear: expedition.returnYear,
        fuelCost,
      });
    }

    EventBus.emit('expedition:launched', { expedition });
  }

  // Wyślij recon na konkretne ciało niebieskie (po id)
  _launchReconTarget(targetId, vesselId) {
    const target = this._findTarget(targetId);
    if (!target) {
      EventBus.emit('expedition:launchFailed', { reason: 'Nieznany cel rozpoznania' });
      return;
    }
    if (target.explored) {
      EventBus.emit('expedition:launchFailed', { reason: 'Ciało już zbadane' });
      return;
    }

    const distance = this._calcDistance(target);
    const vMgr = window.KOSMOS?.vesselManager;

    // Sprawdź paliwo na lot + powrót
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (!vessel || vessel.status !== 'idle') {
        EventBus.emit('expedition:launchFailed', { reason: 'Statek niedostępny' });
        return;
      }
      const fuelNeeded = distance * 2 * vessel.fuel.consumption;
      if (vessel.fuel.current < fuelNeeded) {
        EventBus.emit('expedition:launchFailed', {
          reason: `Brak paliwa na lot i powrót (potrzeba ${fuelNeeded.toFixed(1)} pc)`
        });
        return;
      }
    }

    // Pobierz koszt
    if (this.resourceSystem) {
      if (!this.resourceSystem.canAfford(RECON_COST)) {
        EventBus.emit('expedition:launchFailed', { reason: 'Brak surowców startowych' });
        return;
      }
      this.resourceSystem.spend(RECON_COST);
    }

    // Zablokuj POPy
    EventBus.emit('civ:lockPops', { amount: RECON_CREW_COST });

    const shipSpeed = this._getShipSpeed(vesselId);
    const travelTime = parseFloat(Math.max(MIN_TRAVEL_YEARS, distance / shipSpeed).toFixed(3));
    const departYear = this._gameYear;

    const expedition = {
      id:          `exp_${this._nextId++}`,
      type:        'recon',
      scope:       'target',
      targetId,
      targetName:  target.name ?? '???',
      targetType:  target.type,
      departYear,
      arrivalYear: departYear + travelTime,
      returnYear:  departYear + travelTime * 2,
      distance:    parseFloat(distance.toFixed(4)),
      travelTime,
      crewCost:    RECON_CREW_COST,
      vesselId:    vesselId ?? null,
      status:      'en_route',
      gained:      null,
      eventRoll:   null,
    };

    this._expeditions.push(expedition);

    // Wyślij vessel
    if (vMgr && vesselId) {
      const fuelCost = distance * (vMgr.getVessel(vesselId)?.fuel?.consumption ?? 0);
      vMgr.dispatchOnMission(vesselId, {
        type: 'recon', targetId,
        targetName: expedition.targetName,
        departYear, arrivalYear: expedition.arrivalYear, returnYear: expedition.returnYear,
        fuelCost,
      });
    }

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
        // Vessel wraca do hangaru
        if (exp.vesselId) {
          const vMgr = window.KOSMOS?.vesselManager;
          if (vMgr) vMgr.dockAtColony(exp.vesselId);
        }
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
    // Inkrementuj licznik wizyt
    if (exp.targetId) {
      this._visitCounts.set(exp.targetId, (this._visitCounts.get(exp.targetId) ?? 0) + 1);
    }

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

    const vMgr = window.KOSMOS?.vesselManager;

    if (roll < 5) {
      // KATASTROFA (5%) — brak zarobku, załoga zaginiona → odblokuj POPy
      exp.status = 'completed';
      exp.gained = {};
      EventBus.emit('civ:unlockPops', { amount: exp.crewCost ?? EXPEDITION_CREW_COST });
      // Statek utracony
      if (exp.vesselId && vMgr) vMgr.destroyVessel(exp.vesselId);
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
    exp.status = 'orbiting';  // statek zostaje na orbicie — czeka na rozkaz powrotu

    // Vessel dociera do celu (bez auto-return)
    if (exp.vesselId && vMgr) {
      vMgr.arriveAtTarget(exp.vesselId);
    }

    // Dostarcz zasoby przy przybyciu
    if (this.resourceSystem && Object.keys(gained).length > 0) {
      this.resourceSystem.receive(gained);
    }

    // Raport z misji w EventLog
    const targetName = exp.targetName ?? '?';
    const icon = exp.type === 'scientific' ? '🔬' : '⛏';
    const gainParts = Object.entries(gained).map(([k, v]) => `${k}:${v}`).join(', ');
    const multStr = multiplier !== 1.0 ? ` (×${multiplier.toFixed(1)})` : '';
    EventBus.emit('expedition:missionReport', {
      expedition: exp, gained, multiplier,
      text: `${icon} ${targetName}: ${gainParts}${multStr}`,
    });

    EventBus.emit('expedition:arrived', { expedition: exp, gained, multiplier });
  }

  // Przetwórz przybycie ekspedycji kolonizacyjnej
  _processColonyArrival(exp) {
    const colMgr = window.KOSMOS?.colonyManager;
    const vMgr   = window.KOSMOS?.vesselManager;

    // ── Upgrade outpost → pełna kolonia ──────────────────────────
    const existingCol = colMgr?.getColony(exp.targetId);
    if (existingCol?.isOutpost) {
      // Oblicz mnożnik zasobów startowych (uproszczony — bez katastrofy)
      const roll = Math.random() * 100;
      let resourceMult;
      if      (roll < 15) resourceMult = 0.5;
      else if (roll < 85) resourceMult = 1.0;
      else                resourceMult = 1.5;

      const startResources = {};
      for (const [key, val] of Object.entries(COLONY_START_RESOURCES)) {
        startResources[key] = Math.floor(val * resourceMult);
      }
      existingCol.resourceSystem.receive(startResources);
      colMgr.upgradeOutpostToColony(exp.targetId, exp.crewCost);

      EventBus.emit('civ:unlockPops', { amount: exp.crewCost });
      if (exp.vesselId && vMgr) vMgr.destroyVessel(exp.vesselId);

      exp.status = 'completed';
      exp.gained = startResources;

      EventBus.emit('expedition:missionReport', {
        expedition: exp,
        gained: startResources,
        multiplier: resourceMult,
        text: 'Placówka rozbudowana do pełnej kolonii!',
      });
      return;
    }

    const roll = Math.random() * 100;
    exp.eventRoll = roll;

    // Zniszcz vessel (colony_ship nie wraca — zużyty przy kolonizacji)
    if (exp.vesselId && vMgr) {
      vMgr.destroyVessel(exp.vesselId);
    }

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
    const vMgr   = window.KOSMOS?.vesselManager;
    const targetCol = colMgr?.getColony(exp.targetId);

    if (targetCol) {
      // Cel ma kolonię/outpost — dostarczenie ładunku
      if (exp.cargo) {
        targetCol.resourceSystem.receive(exp.cargo);
      }
      exp.gained = exp.cargo || {};
      exp.status = 'orbiting';
      if (exp.vesselId && vMgr) vMgr.arriveAtTarget(exp.vesselId);
    } else if (colMgr) {
      // Cel BEZ kolonii — utwórz outpost
      const vessel = exp.vesselId ? vMgr?.getVessel(exp.vesselId) : null;

      // Rozdziel cargo: prefaby zostają na statku, reszta → zasoby outpost
      const outpostResources = {};
      const prefabsOnShip = {};

      if (vessel?.cargo) {
        for (const [comId, qty] of Object.entries(vessel.cargo)) {
          if (qty <= 0) continue;
          const com = COMMODITIES[comId];
          if (com?.isPrefab) {
            prefabsOnShip[comId] = qty;
          } else {
            outpostResources[comId] = (outpostResources[comId] ?? 0) + qty;
          }
        }
      }

      // Dodaj cargo z ekspedycji (zasoby transportowe)
      if (exp.cargo) {
        for (const [key, val] of Object.entries(exp.cargo)) {
          if (val > 0) outpostResources[key] = (outpostResources[key] ?? 0) + val;
        }
      }

      const gameYear = Math.floor(this._gameYear);
      colMgr.createOutpost(exp.targetId, outpostResources, gameYear);

      // Przenieś statek z floty macierzystej kolonii do outpost
      if (exp.vesselId && vMgr) {
        // Usuń z floty starej kolonii
        const oldColonyId = vessel?.colonyId;
        const oldCol = oldColonyId ? colMgr.getColony(oldColonyId) : null;
        if (oldCol) {
          const idx = oldCol.fleet.indexOf(exp.vesselId);
          if (idx !== -1) oldCol.fleet.splice(idx, 1);
        }

        // Dock statek w outpost
        vMgr.dockAtColony(exp.vesselId, exp.targetId);

        // Zaktualizuj cargo statku — tylko prefaby
        if (vessel) {
          vessel.cargo = prefabsOnShip;
          let used = 0;
          for (const qty of Object.values(prefabsOnShip)) used += qty;
          vessel.cargoUsed = used;
        }

        // Dodaj do floty outpost
        const outpostCol = colMgr.getColony(exp.targetId);
        if (outpostCol && !outpostCol.fleet.includes(exp.vesselId)) {
          outpostCol.fleet.push(exp.vesselId);
        }
      }

      exp.gained = outpostResources;
      exp.status = 'orbiting';
    }

    EventBus.emit('expedition:arrived', {
      expedition: exp,
      gained: exp.gained ?? exp.cargo,
      multiplier: 1.0,
    });
  }

  // Przetwórz przybycie misji rozpoznawczej
  _processReconArrival(exp) {
    const roll = Math.random() * 100;
    exp.eventRoll = roll;
    const vMgr = window.KOSMOS?.vesselManager;

    if (roll < 5) {
      // KATASTROFA (5%) — statek utracony, załoga zaginiona
      exp.status = 'completed';
      exp.gained = {};
      EventBus.emit('civ:unlockPops', { amount: exp.crewCost ?? RECON_CREW_COST });
      if (exp.vesselId && vMgr) {
        vMgr.destroyVessel(exp.vesselId);
      } else {
        const colMgr = window.KOSMOS?.colonyManager;
        const activePid = colMgr?.activePlanetId;
        if (colMgr) colMgr.consumeShip(activePid, 'science_vessel');
      }
      EventBus.emit('expedition:disaster', { expedition: exp });
      return;
    }

    // ── Rozpoznanie konkretnego ciała (scope='target' lub 'nearest') ──
    if (exp.scope === 'target' || exp.scope === 'nearest') {
      const discovered = [];
      const target = this._findTarget(exp.targetId);
      if (target && !target.explored) {
        target.explored = true;
        discovered.push(target.id);
        // Jeśli to planeta — odkryj też jej księżyce
        if (target.type === 'planet') {
          for (const m of EntityManager.getByType('moon')) {
            if (m.parentPlanetId === target.id && !m.explored) {
              m.explored = true;
              discovered.push(m.id);
            }
          }
        }
      }

      exp.gained = { discovered: discovered.length };
      exp.status = 'orbiting';

      // Statek zostaje na orbicie — czeka na rozkaz gracza
      if (exp.vesselId && vMgr) {
        vMgr.arriveAtTarget(exp.vesselId);
      }

      EventBus.emit('expedition:reconComplete', {
        expedition: exp, scope: exp.scope, discovered,
      });
      EventBus.emit('expedition:arrived', { expedition: exp, gained: exp.gained, multiplier: 1.0 });
      return;
    }

    // ── Sekwencyjny full_system recon ──
    if (exp.scope === 'full_system') {
      const target = this._findTarget(exp.targetId);
      if (target && !target.explored) {
        target.explored = true;
        if (!exp.bodiesDiscovered) exp.bodiesDiscovered = [];
        exp.bodiesDiscovered.push(target.id);
        // Odkryj księżyce planety
        if (target.type === 'planet') {
          for (const m of EntityManager.getByType('moon')) {
            if (m.parentPlanetId === target.id && !m.explored) {
              m.explored = true;
              exp.bodiesDiscovered.push(m.id);
            }
          }
        }
      }

      // Emituj postęp rozpoznania
      EventBus.emit('expedition:reconProgress', {
        expedition: exp,
        body: target,
        discovered: exp.bodiesDiscovered?.length ?? 0,
      });

      // Znajdź następny cel (greedy nearest od bieżącej pozycji)
      // Pomija ciała zbadane + cele innych aktywnych recon ekspedycji
      const nextTarget = this._findNearestUnexploredFrom(target, exp.id);

      if (nextTarget) {
        // Sprawdź czy statek ma paliwo na lot do następnego + powrót do bazy
        const vessel = vMgr?.getVessel(exp.vesselId);
        const homePl = window.KOSMOS?.homePlanet;
        if (vessel && homePl) {
          const distNext = DistanceUtils.euclideanAU(target, nextTarget);
          const distReturn = DistanceUtils.euclideanAU(nextTarget, homePl);
          const fuelNeeded = (distNext + distReturn) * vessel.fuel.consumption;

          if (vessel.fuel.current >= fuelNeeded) {
            // Kontynuuj trasę — przekieruj statek
            const shipSpeed = this._getShipSpeed(exp.vesselId);
            const travelNext = parseFloat(Math.max(MIN_TRAVEL_YEARS, distNext / shipSpeed).toFixed(3));

            exp.targetId = nextTarget.id;
            exp.arrivalYear = this._gameYear + travelNext;
            exp.status = 'en_route';

            // Przekieruj vessel
            if (vMgr && exp.vesselId) {
              vMgr.redirectToTarget(exp.vesselId, nextTarget.id, exp.arrivalYear);
            }
            return; // nie zakończ misji — kontynuuj
          }
        }
      }

      // Brak kolejnych celów lub brak paliwa → statek zostaje na orbicie ostatniego celu
      exp.gained = { discovered: exp.bodiesDiscovered?.length ?? 0 };
      exp.status = 'orbiting';

      // Statek czeka na rozkaz gracza
      if (exp.vesselId && vMgr) {
        vMgr.arriveAtTarget(exp.vesselId);
      }

      EventBus.emit('expedition:reconComplete', {
        expedition: exp, scope: 'full_system',
        discovered: exp.bodiesDiscovered ?? [],
      });
      EventBus.emit('expedition:arrived', { expedition: exp, gained: exp.gained, multiplier: 1.0 });
      return;
    }

    // Fallback (nie powinno się zdarzyć)
    exp.status = 'returning';
    if (exp.vesselId && vMgr) vMgr.startReturn(exp.vesselId);
  }

  // Zbierz ID ciał będących aktywnymi celami innych recon ekspedycji (en_route)
  // Wyklucza ekspedycję o podanym id (bieżąca) — nie chcemy filtrować siebie
  _getActiveReconTargets(excludeExpId = null) {
    const targets = new Set();
    for (const exp of this._expeditions) {
      if (exp.id === excludeExpId) continue;
      if (exp.type !== 'recon') continue;
      if (exp.status !== 'en_route') continue;
      targets.add(exp.targetId);
    }
    return targets;
  }

  // Znajdź najbliższe niezbadane ciało — planetę lub księżyc (wg odległości od homePlanet)
  // Księżyce planety domowej są dosłownie najbliższe — odkrywane jako pierwsze.
  // excludeExpId — pomija cele innych aktywnych recon ekspedycji
  _findNearestUnexplored(excludeExpId = null) {
    const homePl = window.KOSMOS?.homePlanet;
    const activeTargets = this._getActiveReconTargets(excludeExpId);
    const candidates = [];

    // Planety (nie homePlanet — ta jest already explored)
    for (const p of EntityManager.getByType('planet')) {
      if (p === homePl || p.explored || activeTargets.has(p.id)) continue;
      candidates.push(p);
    }
    // Księżyce (w tym księżyce homePlanet — wymagają recon)
    for (const m of EntityManager.getByType('moon')) {
      if (m.explored || activeTargets.has(m.id)) continue;
      candidates.push(m);
    }
    // Planetoidy
    for (const pl of EntityManager.getByType('planetoid')) {
      if (pl.explored || activeTargets.has(pl.id)) continue;
      candidates.push(pl);
    }

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => this._calcDistance(a) - this._calcDistance(b));
    return candidates[0];
  }

  // Znajdź najbliższe niezbadane ciało od podanej pozycji (nie od homePlanet)
  // Używane przez sekwencyjny full_system recon (greedy nearest neighbor)
  // Pomija ciała zbadane LUB będące celami innych aktywnych recon ekspedycji
  _findNearestUnexploredFrom(fromEntity, excludeExpId = null) {
    if (!fromEntity) return this._findNearestUnexplored(excludeExpId);
    const homePl = window.KOSMOS?.homePlanet;
    const activeTargets = this._getActiveReconTargets(excludeExpId);
    const candidates = [];

    for (const p of EntityManager.getByType('planet')) {
      if (p === homePl || p.explored || activeTargets.has(p.id)) continue;
      candidates.push(p);
    }
    for (const m of EntityManager.getByType('moon')) {
      if (m.explored || activeTargets.has(m.id)) continue;
      candidates.push(m);
    }
    for (const pl of EntityManager.getByType('planetoid')) {
      if (pl.explored || activeTargets.has(pl.id)) continue;
      candidates.push(pl);
    }

    if (candidates.length === 0) return null;
    // Sortuj wg odległości euklidesowej od fromEntity
    candidates.sort((a, b) =>
      DistanceUtils.euclideanAU(fromEntity, a) - DistanceUtils.euclideanAU(fromEntity, b)
    );
    return candidates[0];
  }

  // Bazowy zarobek bez mnożnika zdarzenia
  // Używany zarówno do szacunków (modal) jak i do obliczeń przy przybyciu
  // Nowy system: yield z deposits na ciele niebieskim (jeśli dostępne)
  _baseYield(type, target) {
    if (!target) return { Fe: 30 };

    const gained = {};
    const deposits = target.deposits ?? [];

    // Jeśli cel ma złoża — mining yield proporcjonalny do pozostałych zasobów
    if (type === 'mining' && deposits.length > 0) {
      for (const d of deposits) {
        if (d.remaining <= 0) continue;
        // Yield = richness × 30, max 150 per surowiec
        const amt = Math.min(150, Math.max(5, Math.floor(d.richness * 30)));
        gained[d.resourceId] = (gained[d.resourceId] ?? 0) + amt;
      }
      // Brak złóż z remaining > 0 → fallback
      if (Object.keys(gained).length === 0) gained.Fe = 20;
      return gained;
    }

    if (target.type === 'asteroid' || target.type === 'planetoid') {
      // Asteroidy i planetoidy — surowce wg składu chemicznego
      const comp = target.composition ?? {};
      gained.Fe = Math.max(10, Math.min(200, Math.floor((comp.Fe ?? 15) * 1.5)));
      if ((comp.Si ?? 0) > 5) gained.Si = Math.floor((comp.Si ?? 0) * 0.8);
      if ((comp.C  ?? 0) > 5) gained.C  = Math.floor((comp.C  ?? 0) * 0.8);
      if (type === 'scientific') {
        gained.research = 30;
      }

    } else if (target.type === 'comet') {
      // Komety — bogate w lód wodny
      gained.water    = 200;
      gained.C        = 40;
      gained.research = 50;

    } else if (target.type === 'moon') {
      // Księżyc — yield z composition (jeśli dostępny)
      const comp = target.composition ?? {};
      const massMult = (target.physics?.mass ?? 0) > 0.01 ? 1.0 : 0.5;
      gained.Fe = Math.max(10, Math.floor((comp.Fe ?? 10) * massMult));
      gained.Si = Math.max(5,  Math.floor((comp.Si ?? 5)  * massMult * 0.5));
      if ((comp.H2O ?? 0) > 5)  gained.water = Math.floor((comp.H2O ?? 0) * massMult * 2);
      if ((comp.Cu  ?? 0) > 0.5) gained.Cu   = Math.floor((comp.Cu ?? 0) * massMult * 3);
      if ((comp.Ti  ?? 0) > 0.1) gained.Ti   = Math.floor((comp.Ti ?? 0) * massMult * 2);
      if (type === 'scientific') {
        gained.research = target.atmosphere !== 'none' ? 60 : 30;
      }

    } else if (target.type === 'planet') {
      // Inna planeta — surowce wg składu chemicznego
      const comp = target.composition ?? {};
      gained.Fe    = Math.max(20, Math.floor((comp.Fe  ?? 15) * 0.8));
      gained.Si    = Math.max(5,  Math.floor((comp.Si  ?? 10) * 0.5));
      gained.water = Math.max(10, Math.floor((comp.H2O ?? 5)  * 0.8));
      if (target.surface?.hasWater) {
        gained.food = 30;
      }
      if (type === 'scientific') {
        gained.research = (target.lifeScore ?? 0) > 30 ? 80 : 30;
      }

    } else {
      // Fallback
      gained.Fe = 30;
    }

    return gained;
  }

  // Oblicz odległość od planety domowej do celu w AU (euklidesowa, dynamiczna)
  _calcDistance(target) {
    const home = window.KOSMOS?.homePlanet;
    if (!home || !target) return 0.1;
    const dist = DistanceUtils.euclideanAU(home, target);
    // Minimum 0.001 AU — księżyce mogą być bardzo blisko
    return Math.max(0.001, dist);
  }

  // Pobierz prędkość statku w AU/rok (z ShipsData lub domyślna)
  _getShipSpeed(vesselId) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (vMgr && vesselId) {
      const vessel = vMgr.getVessel(vesselId);
      if (vessel) {
        const shipDef = SHIPS[vessel.shipId];
        return shipDef?.speedAU ?? 1.0;
      }
    }
    return 1.0; // domyślna prędkość
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
