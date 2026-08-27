// EnemyAttackHandler — obsługa wrogiego vessela z misją 'attack'.
//
// Wrogi vessel (isEnemy=true) z mission.type='attack' leci na zadeklarowaną planetę
// gracza. Po dotarciu (event vessel:arrived) odpala realną bitwę:
//   • stats wroga z modułów (vesselToBattleUnit)
//   • stats gracza z jego vesseli w tym samym systemie + obrona kolonii
//   • BattleSystem.resolveBattle deterministyczny
// Emituje battle:resolved zgodny z WarSystem (EventLog + cinematic odpalają się
// przez istniejące handlery w GameScene).
//
// Ścieżka ta przygotowuje grunt pod AI: gdy AI wroga zbuduje statek i wyśle na
// gracza, użyje dokładnie tego samego flow (createVessel → mission 'attack' → arrive).

import EventBus from '../core/EventBus.js';
import { t } from '../i18n/i18n.js';
import EntityManager from '../core/EntityManager.js';
// ⚠ Import `gameState` USUNIĘTY w W1-4: po przepięciu na `recordBattle` ten plik nie pisze
// już nic do stanu gry bezpośrednio — całe księgowanie należy do WarSystem (P3).
import { resolveBattle, playerVesselsToBattleUnit } from './BattleSystem.js';
import { HULLS } from '../data/HullsData.js';
import { SHIP_MODULES } from '../data/ShipModulesData.js';
import { isEnemyVessel, isInService } from '../entities/Vessel.js';

// Okno czasu (ms realnych) na dołączenie kolejnych wrogów do tej samej bitwy.
// Jeśli wrogi vessel #A przyleci, a w ciągu BATTLE_BATCH_WINDOW_MS dotrze #B
// do tej samej planety, walczą razem (zagregowani). Bez tego każdy vessel
// odpalał osobną sekwencyjną bitwę.
const BATTLE_BATCH_WINDOW_MS = 500;

export class EnemyAttackHandler {
  constructor() {
    // Map<planetId, { arrivedVesselIds: Set, timerId, firstVesselYear }>
    this._pendingBattles = new Map();

    EventBus.on('vessel:arrived', ({ vessel, mission }) => {
      this._onVesselArrived(vessel, mission);
    });
  }

  _onVesselArrived(vessel, mission) {
    if (!vessel || !mission) return;
    if (mission.type !== 'attack') return;
    if (!isEnemyVessel(vessel)) return;

    const K = window.KOSMOS;
    if (!K?.civMode) return;

    const targetPlanetId = mission.targetId;
    if (!targetPlanetId) return;

    // Zaplanuj zbiorową bitwę na tej planecie. Kolejni wrogowie dołączają
    // do tej samej, bez resetowania timer'a.
    const pending = this._pendingBattles.get(targetPlanetId);
    if (pending) {
      pending.arrivedVesselIds.add(vessel.id);
      return;
    }

    const firstYear = K.timeSystem?.gameTime ?? 0;
    const rec = {
      arrivedVesselIds: new Set([vessel.id]),
      firstVesselYear:  firstYear,
      timerId: null,
    };
    this._pendingBattles.set(targetPlanetId, rec);

    rec.timerId = setTimeout(() => {
      this._resolveBatchedBattle(targetPlanetId);
    }, BATTLE_BATCH_WINDOW_MS);
  }

  // Zbiera wszystkich wrogów orbitujących daną planetę (nowo-przybyłych +
  // zwycięzców poprzednich bitew, którzy tam stoją), agreguje ich stats
  // przez playerVesselsToBattleUnit (helper do sumowania vesseli wielu).
  // Jedna bitwa, wspólny wynik dla wszystkich.
  _resolveBatchedBattle(planetId) {
    const K = window.KOSMOS;
    const pending = this._pendingBattles.get(planetId);
    this._pendingBattles.delete(planetId);
    if (!K?.civMode || !pending) return;

    const warSys = K.warSystem;
    const evtLog = K.eventLogSystem;
    const vMgr   = K.vesselManager;
    const reg    = K.empireRegistry;
    const dipl   = K.diplomacySystem;

    if (!vMgr?._vessels) return;

    // Zbierz obecnych wrogów orbitujących tę planetę (w tym nowo-przybyłych
    // których VesselManager już zrobił state='orbiting'). Nie tylko arrivedVesselIds —
    // również wcześniejsi zwycięzcy którzy już stoją na orbicie.
    const allEnemies = [];
    for (const v of vMgr._vessels.values()) {
      if (!isEnemyVessel(v) || v.isWreck) continue;
      if (v.position?.state !== 'orbiting') continue;
      if (v.position.dockedAt !== planetId) continue;
      allEnemies.push(v);
    }

    if (allEnemies.length === 0) return;

    // Podstawowe dane — imperium pierwszego wroga (z arrivedVesselIds).
    const firstArrivedId = Array.from(pending.arrivedVesselIds)[0];
    const firstVessel    = vMgr.getVessel(firstArrivedId) ?? allEnemies[0];
    const empireId       = firstVessel.ownerEmpireId ?? firstVessel.owner;
    const empire         = empireId ? reg?.get?.(empireId) : null;
    // ⚠ W3-4b — UKŁAD BIERZEMY Z CELU, NIE Z NAPASTNIKA. Bitwa toczy się nad ATAKOWANYM
    // ciałem, więc to ono wyznacza układ dla: obrońcy (`_buildPlayerBattleUnit`), zapisu
    // `location`, wraków (`_wreckPlayerVesselsInSystem`) i dominacji orbitalnej. Wcześniej
    // brany był `systemId` NAPASTNIKA, co przy uderzeniu międzygwiezdnym dawało rekord
    // wewnętrznie sprzeczny (planeta z `sys_home` „położona" w `sys_061`) i księgowało
    // dominację w układzie, w którym nikt nie walczył. Fallback na statek zostaje dla
    // ciał bez stempla układu.
    const systemId       = EntityManager.get(planetId)?.systemId
                          ?? firstVessel.systemId ?? K.activeSystemId ?? 'sys_home';
    const year           = K.timeSystem?.gameTime ?? pending.firstVesselYear;

    // ⚠ W3-4b — CZY JEST Z KIM WALCZYĆ. Bez tej bramki `_buildPlayerBattleUnit` fabrykował
    // obrońcę-widmo (`{ hp: 100, weapons: [] }` — sto wytrzymałości, zero broni) dla układu,
    // w którym gracz nie ma NICZEGO, AI „wygrywało" z workiem treningowym, a księga wojny
    // obciążała gracza udziałem przegranego. Zmierzone na GATE 2. Brak `warSystem` (harness)
    // NIE blokuje — wtedy jedziemy starą ścieżką z jawnym fallbackiem niżej.
    if (warSys?.hasPlayerPresenceInSystem && !warSys.hasPlayerPresenceInSystem(systemId)) {
      console.warn('[EnemyAttackHandler] uderzenie w układ BEZ obecności gracza — bitwy nie ma ' +
        '(nie fabrykujemy obrońcy, nie księgujemy strat)', { planetId, systemId, empireId });
      return;
    }

    // Wojna — zadeklaruj jeśli brak
    let war = warSys?.getWarWith?.(empireId);
    if (!war?.active) {
      if (dipl?.declareWar) {
        dipl.declareWar(empireId, 'enemy_attack_arrived');
        war = warSys?.getWarWith?.(empireId);
      } else if (warSys?.createWar) {
        warSys.createWar(empireId, 'player', 'debug_attack');
        war = warSys.getWarWith(empireId);
      }
    }

    // Zagreguj stats wrogów — tę funkcję reużywamy (nazwa zawodząca, ale
    // faktycznie agreguje DOWOLNE vessele z modułami; oryginalnie player).
    const enemyUnit = playerVesselsToBattleUnit(
      allEnemies, HULLS, SHIP_MODULES,
      // ⚠ Ta etykieta WCHODZI do przetlumaczonej `log.battleLine` przez `participantName`
      // (`BattleSides:46` — szczebel `p.label`), wiec zaszyta po polsku dawala „Battle in …:
      // Flota wroga (3 statków) vs Player" u gracza z angielskim Dziennikiem (Finding 171).
      // Strona GRACZA jest maskowana przez `playerLabel`, strona WROGA nie — i dlatego to
      // umykalo.
      allEnemies.length > 1
        ? (empire?.name
            ? `${empire.name} (${allEnemies.length})`
            : t('battle.label.enemyFleet', allEnemies.length))
        : `${empire?.name ?? t('battle.label.enemyUnnamed')} — ${firstVessel.name ?? firstVessel.shipId}`
    );

    const playerUnit = warSys?._buildPlayerBattleUnit?.(systemId) ?? {
      label: t('battle.label.playerUnit'),
      hp: 30, shieldHP: 0, armor: 0, evasion: 0.02,
      techMult: 1.0, morale: 1.0,
      weapons: [{ damage: 2, tracking: 0.5 }],
    };

    // Seed deterministyczny — rok + suma hash wrogów
    let seedSum = 0;
    for (const v of allEnemies) seedSum += this._hashStr(v.id);
    const seed = (year * 7919 + seedSum) & 0x7FFFFFFF;
    // M2a schema: location jako object (nie string). planetId ustawione — bitwa
    // orbitalna nad atakowaną planetą; point=null (nie deep-space).
    const location = { systemId, planetId, point: null };
    const result = resolveBattle(enemyUnit, playerUnit, {
      casusBelli: war?.casusBelli ?? 'border_incident',
      location,
      seed,
    });

    const battleRec = {
      ...result,
      participantA: {
        type: 'vessel_group',
        empireId,
        vesselIds: allEnemies.map(v => v.id),
        count:     allEnemies.length,
        hp:        enemyUnit.hp,
        label:     enemyUnit.label,
      },
      participantB: {
        type: 'player',
        // ⚠ W3-7 — STEMPEL WŁAŚCICIELA. Bez niego trzej konsumenci filtrujący po
        // `p.empireId === 'player'` (UIManager `battle:resolved` i obie gałęzie GameScene)
        // po cichu POMIJALI bitwy z tej ścieżki: brak auto-slow, brak wpisu w Dzienniku,
        // a przy przegranej gracza — brak JAKIEJKOLWIEK informacji, że stracił flotę (S25).
        empireId: 'player',
        systemId,
      },
    };

    if (war) {
      // ⚠ W1-4 (K-3, podpisane) — ZMIANA ZACHOWANIA, świadoma i widoczna.
      // Do W1-3 ta gałąź omijała `recordBattle`: pisała `gameState.battles` wprost, sama
      // ustawiała dominację orbitalną i sama emitowała `battle:resolved` — z PRAWDZIWYM
      // `warId`. Skutek: atak orbitalny w trakcie ZADEKLAROWANEJ wojny naliczał ZERO
      // exhaustion i nie dopisywał się do `war.battles[]`, więc był niewidoczny nawet
      // w WarOverlay, który tę tablicę czyta. A exhaustion jest NOŚNYM wejściem akceptacji
      // pokoju (waga 55 na `offer_peace`), więc D2 systematycznie ZANIŻAŁO cenę pokoju
      // dokładnie w tych wojnach, które realnie się toczyły.
      // Teraz `recordBattle` jest JEDYNYM wejściem księgowania: nadaje id, dopisuje do
      // `war.battles[]`, nalicza exhaustion obu stronom (skalowane `casusBelli.exhaustionRate`),
      // emituje `battle:resolved` i ustawia dominację orbitalną przez `_updateOrbitalDominance`.
      // KONSEKWENCJA DO ZOBACZENIA NA GATE 2: wojny zaczynają się wyczerpywać od ataków
      // orbitalnych, więc auto-pokój i akceptacja pokoju mogą przychodzić WCZEŚNIEJ.
      const rec = warSys?.recordBattle?.(war.id, battleRec);
      if (!rec) {
        // Głośno (R12): wojna istnieje, a księgowanie nie przyjęło bitwy — to błąd wpięcia,
        // nie stan gry. Nie emitujemy nic po cichu, bo cichy brak wpisu jest właśnie tym
        // defektem, który ten commit likwiduje.
        console.error('[EnemyAttackHandler] recordBattle ODRZUCIŁ bitwę mimo aktywnej wojny',
          { warId: war.id, empireId, systemId });
      }
    } else {
      // ⚠ Wlasny wpis USUNIETY (Finding 166): ta galaz emituje nizej `battle:resolved`,
      // ktore lapie KANONICZNY narrator w `GameScene` (`log.battleLine` — przetlumaczony,
      // z nazwa ukladu przez `systemDisplayName` i nazwami stron przez `BattleSides`).
      // Ten push dawal DRUGI wpis o tej samej potyczce: zaszyty po polsku, z surowym
      // `systemId` i z tozsamoscia stron liczona osobno. Narrator ma byc jeden (Finding 155).

      // ⚠ W1-4 — domknięcie widelca. Ta gałąź (wojny NIE udało się zadeklarować) do tej pory
      // NIE emitowała nic i NIE zapisywała nic: bitwa nie była ani zaksięgowana na wojnę, ani
      // potyczką — czyli była właśnie tą TRZECIĄ, CICHĄ ścieżką, której P3 zabrania. Teraz
      // emitujemy BEZ `warId`, więc klasyfikator WarSystem policzy ją jako POTYCZKĘ
      // (napięcie + pamięć, zero exhaustion).
      battleRec.id = `skirmish_${year.toFixed(2)}_${empireId}_${firstArrivedId}`.replace(/\./g, '_');
      battleRec.year = year;
      EventBus.emit('battle:resolved', { warId: null, battleId: battleRec.id, result: battleRec });
    }

    // Skutki — dotyczą wszystkich wrogów biorących udział
    if (result.winner === 'A') {
      // Wrogowie wygrali — zostają na orbicie, flota gracza w systemie → wraki
      for (const v of allEnemies) {
        v.position.state = 'orbiting';
        v.position.dockedAt = planetId;
        v.status = 'idle';
        v.mission = null;
      }
      this._wreckPlayerVesselsInSystem(systemId, year);
    } else if (result.winner === 'B') {
      // Gracz wygrał — wszyscy wrogowie stają się wrakami
      for (const v of allEnemies) {
        this._turnIntoWreck(v, planetId, year);
      }
      const count = allEnemies.length;
      evtLog?.push({
        text: count > 1
          ? t('log.el.orbitalShotDown', count, this._systemLabel(systemId))
          : t('log.el.orbitalShotDown1', firstVessel.name ?? '?', this._systemLabel(systemId)),
        channel: 'combat',
        severity: 'info',
        entityRef: systemId,
      });
    } else {
      // Draw — oboje tracą
      for (const v of allEnemies) this._turnIntoWreck(v, planetId, year);
      this._wreckPlayerVesselsInSystem(systemId, year);
      evtLog?.push({
        text: t('log.el.orbitalDraw', this._systemLabel(systemId), allEnemies.length),
        channel: 'combat',
        severity: 'warn',
        entityRef: systemId,
      });
    }
  }

  // Nazwa WYSWIETLANA ukladu — kanon `systemDisplayName` (rejestr → nazwa GWIAZDY → id).
  // ⚠ Bez tego wpisy tej klasy meldowaly „zestrzelony nad sys_024" (Finding 167).
  _systemLabel(systemId) {
    if (!systemId) return '?';
    const K = window.KOSMOS;
    const sys = K?.galaxyData?.systems?.find?.(s => s.id === systemId);
    if (sys?.name) return sys.name;
    const star = K?.entityManager?.getByTypeInSystem?.('star', systemId)?.[0]?.name;
    return star ?? systemId;
  }

  // Konwertuje vessel na wrak — zachowuje go w VesselManager z nowym stanem.
  //
  // `dockedAtOrPoint` (v66, M2a):
  //   string   → planetId; vessel trafia do orbital graveyard (stary path M1)
  //   {x, y}   → deep-space point; wrak zamrożony w tej pozycji, wreckLocation
  //              serializowane, renderowane statycznie przez ThreeRenderer
  //   null     → fallback: gdy vessel.position.dockedAt istnieje → orbital path;
  //              inaczej zamrażamy pozycję w miejscu (wreckLocation = position.x/y).
  //              To rozwiązuje BUG#P8 z m2-reconnaissance.md — vessel w tranzycie
  //              wreckowany przez _wreckPlayerVesselsInSystem pozostaje
  //              widoczny w miejscu zniszczenia (nie teleportuje do planety).
  _turnIntoWreck(vessel, dockedAtOrPoint, year) {
    if (!vessel || vessel.isWreck) return;

    const isDeepSpace = (
      dockedAtOrPoint && typeof dockedAtOrPoint === 'object' &&
      typeof dockedAtOrPoint.x === 'number' && typeof dockedAtOrPoint.y === 'number'
    );

    vessel.isWreck          = true;
    vessel.status           = 'destroyed';
    vessel.mission          = null;
    vessel.wreckedAt        = year;
    vessel.position.state   = 'orbiting';
    vessel.fuel && (vessel.fuel.current = 0);

    if (isDeepSpace) {
      // Deep-space wrak: zamrażamy pozycję + zapisujemy do wreckLocation.
      // NIE wywołujemy orbitalSpaceSystem — wrak nie orbituje ciała.
      vessel.position.dockedAt = null;
      vessel.position.x        = dockedAtOrPoint.x;
      vessel.position.y        = dockedAtOrPoint.y;
      vessel.wreckLocation     = { x: dockedAtOrPoint.x, y: dockedAtOrPoint.y };
      EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
      return;
    }

    // Planet-based path (M1 legacy) — dockedAtOrPoint to string (planetId) albo null.
    vessel.position.dockedAt = (typeof dockedAtOrPoint === 'string')
      ? dockedAtOrPoint
      : (vessel.position.dockedAt ?? null);

    // Brak dockedAt (null z null-fallback i brak istniejącej orbit) — zamrażamy
    // vessel w miejscu zniszczenia (deep-space wrak bez explicit midpointu).
    if (!vessel.position.dockedAt) {
      const px = vessel.position.x ?? 0;
      const py = vessel.position.y ?? 0;
      vessel.wreckLocation = { x: px, y: py };
      EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
      return;
    }

    // Orbital graveyard path — OrbitalSpaceSystem emituje 'orbit:assigned' które
    // słucha ThreeRenderer i aktualizuje wizualnie.
    const orbital = window.KOSMOS?.orbitalSpaceSystem;
    if (orbital) {
      if (orbital.hasOrbit(vessel.id)) {
        orbital.transitionToWreck(vessel.id, year);
      } else {
        orbital.assignOrbit(vessel.position.dockedAt, vessel.id, 'wreck');
      }
      // Pierwsza synchronizacja pozycji 2D dla tactical map — inaczej wrak
      // stoi w pozycji planety aż do pierwszego _updatePositions tick'a.
      const body = EntityManager.get(vessel.position.dockedAt);
      if (body) {
        const tSec = performance.now() * 0.001;
        const pos = orbital.getPosition(
          vessel.id,
          { x: body.x / 10, z: body.y / 10 },
          tSec
        );
        if (pos) {
          vessel.position.x = pos.x * 10;
          vessel.position.y = pos.z * 10;
        }
      }
    }

    EventBus.emit('vessel:wrecked', { vesselId: vessel.id, vessel });
  }

  _wreckPlayerVesselsInSystem(systemId, year) {
    const vMgr = window.KOSMOS?.vesselManager;
    if (!vMgr?._vessels) return;
    for (const v of vMgr._vessels.values()) {
      if (isEnemyVessel(v)) continue;
      if (v.isWreck)         continue;
      // W2 — okręt w REZERWIE nie ginie razem z flotą operacyjną. Pod R-C (załoga ginie
      // ze statkiem) brak tego filtra zamieniłby upadek układu w masową śmierć załóg,
      // których tam nie było — magazyn z definicji nie jest obsadzony.
      if (!isInService(v)) continue;
      if ((v.systemId ?? 'sys_home') !== systemId) continue;
      this._turnIntoWreck(v, v.position?.dockedAt ?? null, year);
    }
  }

  _hashStr(s) {
    let h = 0;
    for (let i = 0; i < (s?.length ?? 0); i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }
}
