# M2 Reconnaissance — mechanizm bitew vessel↔vessel w KOSMOS

**Data:** 2026-04-23
**Stan kodu:** save v65, M1 Targeting Foundation ukończony (tag `m1-complete`).
**Tryb:** read-only rekonesans. Żaden plik kodu nie został zmodyfikowany.
**Plik planu:** `C:\Users\Komputer\.claude\plans\zadanie-rekonesans-techniczny-mechanizmu-proud-origami.md`

---

## 1. Executive summary

Dokumentacja M1 twierdziła że pursue/intercept "nie strzela" — i to jest prawda na
poziomie `MovementOrderSystem`. Ale bitwy vessel↔vessel **dzieją się**, bo są
triggerowane przez **osobne, niezależne systemy**: przede wszystkim
`EnemyAttackHandler` (reaguje na `vessel:arrived` dla wrogich vesseli z
`mission.type='attack'`) oraz `WarSystem._fleetArrived` (reaguje na dotarcie
*abstract fleet* z `EmpireRegistry.fleets`). Playtest został odpalony przez
`EnemyAttackHandler` — Bellator ścigał wrogiego "Najeźdźcę" wytworzonego przez
`spawnEnemyAttack` (nie przez `spawnEnemyCiv`, jak sugerowało pierwsze czytanie
zadania — patrz §2), a bitwa nastąpiła *niezależnie od pursue'a* gdy Najeźdźca
dotarł do planety gracza. `MovementOrderSystem._onVesselWrecked` (linia 670) ma
zaimplementowany proper handling śmierci targetu — to on ustawił
`blockReason='target_lost'`. **Wniosek kluczowy dla M2:** nie potrzebujemy
budować "proximity combat od zera"; istniejący system już dostarcza
`battle:resolved` dla encounterów vessel↔planeta. M2 powinien raczej zamknąć
braki: (a) proximity combat w deep-space (pursue completion nadal kończy się
`deep-space drift`, nie strzelaniem), (b) interakcja materialized fleet z
combatem, (c) unified combat resolution (obecnie dwie ścieżki — abstract fleet
vs vessel instances — używają różnych agregatorów).

---

## 2. CZĘŚĆ 1 — Combat triggery w repozytorium

Istnieją **3 miejsca w kodzie** które wywołują `resolveBattle()` z
`BattleSystem.js`. Każde ma inne warunki wstępne, inny format payloadu, inny
skutek dla vesseli. Poniżej tabela + opis każdej ścieżki.

| # | Trigger | Plik:linia | Wejście do battle | Mission vessela | Wrecks vessele? |
|---|---------|-----------|-------------------|-----------------|-----------------|
| A | `EnemyAttackHandler._resolveBatchedBattle` | `src/systems/EnemyAttackHandler.js:141` | `playerVesselsToBattleUnit(allEnemies, ...)` vs `warSys._buildPlayerBattleUnit(systemId)` | **wymagana** `mission.type='attack'` + `isEnemy=true` | TAK — `_turnIntoWreck(v, planetId, year)` na wszystkie wrogie vessele orbitujące cel (linia 186-220); przy wygranej wroga — dodatkowo `_wreckPlayerVesselsInSystem(systemId, year)` (linia 266-275) |
| B | `WarSystem._fleetArrived` | `src/systems/WarSystem.js:322` | `empireFleetToBattleUnit(fleet, empire, fleet.id)` vs `_buildPlayerBattleUnit(destSystemId)` | **bez mission** — operuje na `empire.fleets[]` (abstract strength) | NIE — tylko `updateFleetStrength(newStrength, 'battle_damage')` (linia 330); przy strength≤0 → `destroyFleet` |
| C | `WarSystem.forceBattle` | `src/systems/WarSystem.js:212` | jak B, ale teleport + natychmiastowe rozwiązanie | bez mission | NIE, jak B |

Wszystkie trzy na końcu emitują `battle:resolved`:
- **A**: `src/systems/EnemyAttackHandler.js:176` z `participantA.type='vessel_group'`
- **B** (przez `WarSystem.recordBattle`): `src/systems/WarSystem.js:155` z `participantA.type='empire'`
- **C**: przez `WarSystem.recordBattle` (linia 229 → 155)

### 1.1. A — `EnemyAttackHandler` (vessel-based)

**Trigger chain:** `EventBus.on('vessel:arrived')` (linia 33) → `_onVesselArrived()` → filtry:
- `mission.type === 'attack'` (linia 40)
- `isEnemyVessel(vessel)` (linia 41, używa `Vessel.js:313-324` tolerancyjnego helpera: `isEnemy===true` lub `owner!=='player'` lub `ownerEmpireId!=='player'`)
- `window.KOSMOS.civMode` (linia 44)
- `mission.targetId` nie-null (linia 47)

**Batching window (500 ms):** linia 26 `BATTLE_BATCH_WINDOW_MS = 500`. Po przybyciu pierwszego wrogiego vessela do planety, przez 500 ms real-time zbierają się nowe arrivals do tej samej "zbiorowej bitwy" (linia 49-68).

**Kto kwalifikuje się do `allEnemies`:** linia 91-97. Warunek:
```
!isEnemyVessel(v) || v.isWreck → skip
position.state !== 'orbiting' → skip
position.dockedAt !== targetPlanetId → skip
```
Czyli tylko wrogie, nie-wraki, orbitujące dokładnie cel-planetę z mission.

**Agregacja:** `playerVesselsToBattleUnit` (nazwa myląca — funkcja sumuje hulle + moduły dowolnej grupy, nie tylko gracza). `BattleSystem.js:219` — HP z `hull.baseHP`, armor z `hull.baseArmor`, evasion z `baseEvasion`, broń/tarcze z modułów.

**Skutek:**
- winner='A' (wróg) → wszyscy wrogowie `state='orbiting', dockedAt=planetId, status='idle', mission=null`; wszystkie player vessele w systemie → wraki (linia 189-195)
- winner='B' (gracz) → wszyscy wrogowie → wraki przez `_turnIntoWreck` (linia 198-201), emituje `vessel:wrecked`
- draw → oboje tracą (linia 211-213)

**NIE bierze pod uwagę `MovementOrder` z M1.** MOS reaguje pośrednio przez `vessel:wrecked` handler (patrz §3).

### 1.2. B — `WarSystem._fleetArrived` (abstract fleet)

**Trigger chain:** `WarSystem` tick co 1 civYear (linia 48, akumulator `_tickAccum`) → `_tickAll(steps)` → `_fleetArrived(war, empire, fleet)` gdy `fleet.destSystemId` != null i `gameYear >= fleet.etaYear` (linia 283-288).

**Warunki pośrednie:**
- Musi istnieć aktywna wojna z empire (`listActive` filtruje po `active===true`)
- `_isPlayerInSystem(destSystemId)` (linia 317, 342) — **sprawdza TYLKO czy gracz ma KOLONIĘ w systemie**; NIE uwzględnia wyłącznie obecności player vesseli

**Agregacja:**
- enemy: `empireFleetToBattleUnit(fleet, empire, fleet.id)` (`BattleSystem.js:177`) — HP ≈ strength, evasion zależne od archetypu, jeden wirtualny weapon z damage=strength/10
- player: `_buildPlayerBattleUnit(systemId)` (`WarSystem.js:357`) — agreguje WSZYSTKIE nie-wrogie, nie-wrak vessele w `systemId` + bonusy z `defense_tower` / `defense_grid` w koloniach gracza w tym systemie + fallback "symboliczna obrona" 30 HP gdy brak floty i obrony

**Skutek bitwy:**
- `updateFleetStrength(empireId, fleetId, newStrength, 'battle_damage')` (linia 330) → gdy strength<=0 → `destroyFleet` → `empire:fleetDestroyed`
- `recordBattle` → `gameState.set('battles.{battleId}')` + `emit battle:resolved` (linia 155) + `_updateOrbitalDominance` (linia 158 → 179)
- **Żaden konkretny vessel nie jest tu wreckowany.** Tylko abstract strength spada.

**NIE bierze pod uwagę `MovementOrder` z M1.**

### 1.3. C — `WarSystem.forceBattle` (debug)

Debug trigger wywoływany z UI "Force Battle" (linia 188). Identyczny flow jak B,
ale teleportuje flotę do systemu gracza i od razu odpala `recordBattle`. Pomijalny
dla naszego playtestu scenariusza.

### 1.4. Co NIE jest combat triggerem (ku pamięci)

- `MovementOrderSystem._completeOrder` (`src/systems/MovementOrderSystem.js:478-518`) — linia 516-517 to TODO M2; emituje tylko `vessel:orderCompleted`, żadnego combat.
- `MovementOrderSystem._onVesselWrecked` (linia 670) — REAGUJE na wreck, nie wywołuje go.
- `EmpireFleetMaterializer` (`src/systems/EmpireFleetMaterializer.js`) — tylko tworzy/niszczy vessele, combat nigdy.
- `InvasionSystem`, `MilitaryAI.attack_player` — pośrednio wywołują moveFleet, prowadząc do B, ale same `resolveBattle` nie wywołują.

---

## 3. CZĘŚĆ 2 — Timeline scenariusza playtestu

### 3.1. Weryfikacja danych wejściowych

Użytkownik podał: Bellator goni "Łowcę Testowego" (v_3) spawnowanego przez
`spawnEnemyCiv`. Ale zacytowany **Dziennik UI dla Bellatora pokazywał "Pursue:
Najeźdźca"**. Nazwa "Najeźdźca" w kodzie pojawia się WYŁĄCZNIE w
`src/debug/SpawnTestEnemy.js:584` (`spawnEnemyAttack`, defaultowa nazwa
`Najeźdźca ${hullId.toUpperCase()}`). `spawnEnemyCiv` używa `'Łowca Testowy'`
(linia 449).

**Wniosek:** Scenariusz playtestu to najprawdopodobniej **`spawnEnemyCiv` +
`spawnEnemyAttack` wywołane razem** (lub sam `spawnEnemyAttack`, który
wewnętrznie wywołuje `spawnTestEnemy` jeśli wroga jeszcze nie ma — linia 531-537
w SpawnTestEnemy.js). Pursue targetem był wrogi vessel *z mission.type='attack'*,
nie `v_3`.

**NIEPEWNE:** czy użytkownik świadomie wywołał `spawnEnemyAttack`, czy UI skrót
w dev console łączy oba w jedno. Do potwierdzenia: sprawdzenie log DebugLog
(`src/core/DebugLog.js:34` ma `battle:resolved` w liście monitored eventów) lub
ponowny playtest z włączonym `KOSMOS.debug.enableTargetingTrace`
(`MovementOrderSystem.js:42`) i grep `vessel:launched` w konsoli.

### 3.2. Timeline (najbardziej prawdopodobna hipoteza — **H2'**)

Zakładając że gracz wywołał obie debug komendy:

```
t=0:  gracz wywołuje spawnEnemyCiv()
      → reg.createEmpire('emp_test_enemy', archetype='xenophage', military.power=200)
      → colMgr.createColony(enemyColonyId) — kolonia wroga w sys_home
      → createVessel v_3 "Łowca Testowy" z isEnemy=true, state='orbiting',
        dockedAt=enemyColonyId, mission=null, ownerEmpireId='emp_test_enemy'
      → gameState.orbitalDominance.sys_home = { controllerId: 'player' }
      (SpawnTestEnemy.js:52-179, 406-496)

t=1:  gracz wywołuje spawnEnemyAttack({ strength: 500 })
      → createVessel NAJEZDZCA ("Najeźdźca MEDIUM") z hull_medium + 2×engine +
        1×armor + 2×weapon_kinetic, isEnemy=true, ownerEmpireId='emp_test_enemy'
      → pozycja start: ~15 AU od gwiazdy, losowy kąt
      → vessel.mission = { type:'attack', targetId=home.id, arrivalYear=gameYear+0.5 }
      → state='in_transit', status='on_mission'
      → emit vessel:created + vessel:launched + vessel:positionUpdate
      (SpawnTestEnemy.js:518-642)

t=2:  gracz wydaje: KOSMOS.debug.issueOrder('v_1', {type:'pursue',
      targetEntityId:NAJEZDZCA.id})
      → MovementOrderSystem._issuePursueOrIntercept (linia 262)
      → initDist = Math.hypot(target.pos - Bellator.pos) — >THREAT_RADIUS_PX
        (Najeźdźca w ~15 AU, Bellator pewnie przy home planet) → order accepted
      → order.status='active', targetEntityId=NAJEZDZCA.id
      → vessel.movementOrder = order
      → emit vessel:orderIssued
      → addMissionLog(Bellator, ..., "Pursue: Najeźdźca") ← ŹRÓDŁO DZIENNIKA UI
      (MovementOrderSystem.js:262-322)

t=3..N: co tick:
      → MOS._tickPursueOrder(Bellator, ...) — Bellator przesuwa się w kierunku NAJEZDZCA
        (MOS bezpośrednio modyfikuje vessel.position.x/y, MovementOrderSystem.js:395-408)
      → NAJEZDZCA w swoim _updatePositions interpoluje wzdłuż mission.waypoints
        do home.id (VesselManager.js:1378-1476). VESSELE JADĄ KU SOBIE —
        ale Najeźdźca leci do home planet, Bellator leci do Najeźdźcy.
      → proximity check MOS (THREAT_RADIUS_PX = 16.5 px) — nie zachodzi jeszcze
      → endurance drain w VesselManager._tickEndurance (×3-4 za pursue)

t=M:  gameYear >= NAJEZDZCA.mission.arrivalYear (~0.5 civYear po spawnie)
      → VesselManager._updatePositions linia 1454:
        if (!m.phase?.startsWith('return') && gameYear >= m.arrivalYear):
          vessel.position.state = 'orbiting'
          vessel.position.dockedAt = m.targetId (homePlanet.id)
          emit vessel:arrived { vessel=NAJEZDZCA, mission=m }
      (VesselManager.js:1453-1470)

t=M+:  EnemyAttackHandler._onVesselArrived(NAJEZDZCA, m):
      ✓ mission.type === 'attack'
      ✓ isEnemyVessel(NAJEZDZCA) === true
      ✓ civMode === true
      ✓ mission.targetId === homePlanet.id
      → _pendingBattles.set(homePlanet.id, { arrivedVesselIds: [NAJEZDZCA.id], ... })
      → setTimeout(500ms) → _resolveBatchedBattle(homePlanet.id)
      (EnemyAttackHandler.js:38-68)

t=M+500ms: _resolveBatchedBattle(homePlanet.id):
      allEnemies = [NAJEZDZCA]  (v_3 orbituje enemy colony, nie home — skip)
      empireId = 'emp_test_enemy'
      war = warSys.getWarWith('emp_test_enemy')
        → brak aktywnej wojny
        → dipl.declareWar('emp_test_enemy', 'enemy_attack_arrived')
        → war = { id, aggressor='player', ..., active: true }
      enemyUnit = playerVesselsToBattleUnit([NAJEZDZCA], HULLS, SHIP_MODULES,
                                            'Rój Testowy — Najeźdźca MEDIUM')
      playerUnit = warSys._buildPlayerBattleUnit('sys_home')
        — zbiera Bellatora + ewentualne inne player vessele w sys_home + defense_tower/grid
      result = resolveBattle(enemyUnit, playerUnit, {seed, location='sys_home', ...})
        → 4 tur (MAX_TURNS=30, retreat <20% HP)
        → lossesA=64, lossesB=22 (approx.)
        → winner='B' (gracz)
      gameState.set('battles.{battleId}', battleRec, 'enemy_attack_arrived')
      gameState.set('orbitalDominance.sys_home', { controllerId:'player', year })
      emit battle:resolved
      → for NAJEZDZCA: _turnIntoWreck(NAJEZDZCA, homePlanet.id, year)
        ↳ vessel.isWreck = true
        ↳ vessel.position.state = 'orbiting', dockedAt=homePlanet.id
        ↳ orbitalSpaceSystem.transitionToWreck
        ↳ emit vessel:wrecked { vesselId=NAJEZDZCA.id, vessel }
      (EnemyAttackHandler.js:74-220, _turnIntoWreck linia 227-264)

t=M+501ms: handlery vessel:wrecked:
      → MovementOrderSystem._onVesselWrecked(NAJEZDZCA):
        • Najeźdźca nie ma movementOrder (był targetem, nie pursuerem)
        • pętla po _byVessel.entries(): dla Bellatora order.targetEntityId === NAJEZDZCA.id
          → _blockAndCancel(Bellator, order, 'target_lost')
          → order.status='blocked', blockReason='target_lost'
          → emit vessel:orderBlocked
        (MovementOrderSystem.js:670-691)
      → ThreeRenderer._onVesselWrecked — sprite zamienia na wrak
      → EmpireFleetMaterializer._onVesselWreckedHandler — szuka fleet.materializedVesselIds;
        NAJEZDZCA nie był materialized, skip
      → OrbitalSpaceSystem — już obsłużone w _turnIntoWreck

t=M+~600ms: GameScene.battle:resolved handler (GameScene.js:684, 710) →
      BattleIntroModal otwiera ekran "ZWYCIĘSTWO", pokazuje Tur=4, Straty 64/22,
      label "Rój Testowy vs Gracz"
```

### 3.3. Hipotezy odrzucone

**H1** — *Bellator po `_completeOrder` trafia na orbit enemy colony i EnemyAttackHandler batchuje go jako "wroga"*:
**ODRZUCONA.** `_completeOrder` ustawia `dockedAt=null` dla targetu vessel (linia 500-501 MovementOrderSystem), nie dockedAt=enemyColony. Dodatkowo `isEnemyVessel(Bellator)===false` — filtr w `allEnemies` by go odrzucił (EnemyAttackHandler.js:93). Nie ten trigger.

**H2** — *`v_3` (Łowca Testowy) miał mission attack ustawioną przez `spawnEnemyCiv`*:
**ODRZUCONA.** `spawnEnemyCiv` (SpawnTestEnemy.js:406-496) nie ustawia żadnej mission na vesselu; linia 461-464 to tylko `state='orbiting'`, `dockedAt=enemyColonyId`, `status='idle'`. Vessel bez mission → `_updatePositions` nie emituje `vessel:arrived` dla niego.

**H3** — *`orbitalDominance` handler inicjuje bitwę gdy player vessel wjeżdża w hostile system*:
**ODRZUCONA.** `orbitalDominance` jest tylko zmienną stanu w `gameState` — czytana przez `WarSystem.playerHasOrbitalDominance` i `InvasionSystem`; żaden handler/tick nie porównuje jej z pozycją vesseli, żeby odpalić combat. To pasywny flag.

**H2'** (opisana w §3.2) — *`spawnEnemyAttack` stworzył "Najeźdźcę" z mission.type='attack', vessel dotarł do home planet, EnemyAttackHandler odpalił bitwę*:
**POTWIERDZONA POŚREDNIO** przez fragmentyczne dane (nazwa "Najeźdźca" w dzienniku + `blockReason='target_lost'` pasuje do `_onVesselWrecked` path). Wszystkie elementy są w kodzie, wszystkie warunki filtrów są spełnione, losses 64/22 pasują do hull_medium + moduły.

**Alternatywa H-ALT** (nieodrzucona, ale mniej prawdopodobna) — *MilitaryAI.build_fleet + attack_player spawnuje abstract fleet → WarSystem._fleetArrived*:
Możliwe jeśli minęły ≥3 civYears (etaYears=max(3, distLY×2), a distLY=0 bo emp_test_enemy ma `homeSystemId=sys_home`). Ale bitwa w tym flow NIE wrecks konkretnych vesseli (`updateFleetStrength` tylko), więc `vessel:wrecked` nigdy nie odpala i `MovementOrderSystem._onVesselWrecked` nie może ustawić `target_lost`. Sprzeczne z playtestowym `blockReason='target_lost'`. Odrzucam jako główną ścieżkę dla tego scenariusza.

**NIEPEWNE w H2':** dokładny moment `declareWar` (przed czy w trakcie
`_resolveBatchedBattle`) i czy `v_3` pozostał nietknięty (orbituje enemy colony,
nie pojawia się w `allEnemies`). Do potwierdzenia: runtime trace.

---

## 4. CZĘŚĆ 3 — Interakcja z MovementOrderSystem (M1)

| Pytanie | Odpowiedź | Dowód |
|---------|-----------|-------|
| Czy proximity check dla combat jest ten sam co w MOS (`THREAT_RADIUS_AU=0.15`)? | **NIE.** Combat trigger nie używa distance-based proximity. Używa *state-based arrival* (`gameYear >= mission.arrivalYear`) dla `vessel:arrived`. THREAT_RADIUS_AU jest używane TYLKO przez MOS do completion pursue/intercept. | `MovementOrderSystem.js:33-34` vs `VesselManager.js:1453-1470`, `EnemyAttackHandler.js:38-67` |
| Czy combat może odpalić *przed* completion MOS pursue, w trakcie tego samego ticka? | **TAK.** MOS `_tick` idzie w VesselManager._tick order: `_tickEndurance → MovementOrderSystem._tick → _updatePositions`. Arrival detection jest w `_updatePositions` (VesselManager.js:1454). Jeśli target vessel dotrze do planety W TYM SAMYM TICKU, emit `vessel:arrived` → (setTimeout 500 ms batch) → bitwa. Bellator jeszcze może być w stanie `in_transit` w trakcie pursue. W momencie wreck targetu, MOS `_onVesselWrecked` (async po battle) zablokuje jego order. | `MovementOrderSystem.js:7-12` (kolejność tick), `EnemyAttackHandler.js:65-67` (setTimeout), `MovementOrderSystem.js:670-691` (onVesselWrecked) |
| Co się dzieje z active MovementOrder gdy target zostanie zniszczony? | MOS `_onVesselWrecked` iteruje `_byVessel.entries()`, znajduje ordery z `targetEntityId === vessel.id`, wywołuje `_blockAndCancel(pursuer, order, 'target_lost')`. Status='blocked', blockReason='target_lost', emit `vessel:orderBlocked`. Order znika z `_byVessel`. | `MovementOrderSystem.js:684-690` |
| Czy combat trigger respektuje stan `in_transit` pod kontrolą MOS? | **PRAKTYCZNIE TAK, ale pasywnie.** MOS przesuwa Bellatora bezpośrednio (linia 458-459 `vessel.position.x += …`). Bellator NIE jest targetem tej bitwy (jest pursuerem). Najeźdźca (cel) ma własną mission i leci samodzielnie przez `_updatePositions`. `vessel:arrived` dotyczy Najeźdźcy, nie Bellatora. MOS nie "przerywa" pursue — po prostu target znika (wreck), MOS reaguje przez `_onVesselWrecked`. | `MovementOrderSystem.js:458-459`, `EnemyAttackHandler.js:227-264` |
| Jak BattleSystem agreguje Bellatora (gracza, nie w `EmpireRegistry.fleet`)? | Przez `WarSystem._buildPlayerBattleUnit(systemId)` (linia 357). Filtr: `v.systemId === systemId && !isEnemyVessel(v) && !v.isWreck`. Bellator spełnia wszystkie (systemId='sys_home', nie enemy, nie wreck). Wchodzi do `playerVesselsToBattleUnit` z `HULLS` + `SHIP_MODULES`. **Nie ma weryfikacji stanu `in_transit` vs `orbiting`** — Bellator w tranzycie w sys_home jest liczony jako część "player battle unit". | `WarSystem.js:357-437`, `EnemyAttackHandler.js:130-135` |
| Czy MOS emituje event że pursue jest w trakcie, aby combat był "opóźniony" do completion? | **NIE.** MOS nie emituje nic co mogłoby zablokować combat. Żadnego `combat:suppressed` ani analogii. | brak w repo |

### 4.1. Konsekwencja "pasywnego" pattern

MOS obsługuje case "target wrecked" poprawnie przez `_onVesselWrecked`, ale NIE
obsługuje case "pursuer wrecked w trakcie innego combat":
- Jeśli Bellator był ścigany przez innego vessela (np. w M2 auto-engage) i jego
  vessel dostanie wreck w trakcie pursue'a WŁASNEGO — MOS linia 673-682 anuluje
  jego order z reason='vessel_wrecked'. To działa.
- Jeśli Bellator jest agregowany w `_buildPlayerBattleUnit` i wreckowany jako
  część player group przy winner='A' (enemy) — emit `vessel:wrecked` →
  MOS._onVesselWrecked → jego order cancelled. To również działa.

**Zaskakujący edge case:** `_wreckPlayerVesselsInSystem` (EnemyAttackHandler.js:266)
wrecks WSZYSTKIE player vessele w systemie, nie tylko te w bitwie. Bellator w
tranzycie przez pursue (który może być daleko od homePlanet) **i tak** zostanie
wreckowany jeśli wróg wygrał na homePlanet. Z perspektywy pursue'a to może być
mylące UX.

---

## 5. CZĘŚĆ 4 — Problemy i edge cases

### 5.1. Krytyczne (mogą łamać flow)

**P1. Dwa vessele gracza w pobliżu home — edge case w `_buildPlayerBattleUnit`.** [SIGNIFICANT]
Jeśli user ma 2 statki player w `sys_home` i trwa pursue między nimi (np. bug /
debug), agregator weźmie oba jako "player unit". Gdy bitwa odpali się przez
EnemyAttackHandler (czyli wrogi atak), oba statki są liczone. Wynik: nic nie
rozróżnia "Bellator atakuje Kowadło" vs "Bellator i Kowadło bronią home". To
problem dla przyszłego friendly-fire / player-vs-player. Severity: **significant**
(projektowy, nie breaking).

**P2. Materialized fleet + bitwa przez _fleetArrived = double-hit.** [SIGNIFICANT]
Scenariusz: MilitaryAI wysyła abstract fleet (strength=100) z etaYear=3, za 2
civYears (ETA-gameYear ≤ 2) EmpireFleetMaterializer zmaterializuje flotę na
konkretne vessele (strength=0, materializationState='full'). Abstract fleet
jednocześnie ma `destSystemId='sys_home'` i `etaYear=year+3`. Po 1 civYear od
materializacji WarSystem._tickAll zobaczy: `fleet.etaYear` wciąż dodatkowo
istnieje (nie zerowany przy materializacji — patrz EmpireFleetMaterializer.js:137-143
linie ustawiają `strength=0, materializationState='full', materializedVesselIds=[...]`,
ale NIE zerują `destSystemId` ani `etaYear`) → `_fleetArrived` odpali z
strength=0, `empireFleetToBattleUnit` z strength=1 (min guard
`BattleSystem.js:178`) → minimalna bitwa. Emituje `battle:resolved` z
`participantA.type='empire', strength=0`. UX: jeden e-mail bitwy bez powodu;
battleRec zapisana. **Severity: significant** — nie breakuje gry, ale rozjeżdża
logikę (dwie bitwy dla jednej intencji).

**P3. `MAX_MATERIALIZED_VESSELS_PER_FLEET=8` + jedna bitwa → cała flota wymazana.** [SIGNIFICANT]
Full `_turnIntoWreck` na wszystkie 8 vesseli w materialized fleet po winner='B'
(gracz). `EmpireFleetMaterializer._onVesselWreckedHandler` odpala 8 razy, za
każdym razem usuwa jeden ID z `fleet.materializedVesselIds`. Po 8 wreckach ostatni
hit wywołuje `dematerializeFleet` z `reason='all_vessels_lost'` →
`destroyFleet` → abstract strength nigdy nie wraca. To jest by design (§7 design
doc), ale w połączeniu z P2 (double-hit) daje asymetryczny payoff:
materializowana flota może zostać zniszczona jednym bitwą, podczas gdy
niezmaterializowana strength>0 utrzymuje się po stracie większości HP.
**Severity: significant** dla balansu M2.

### 5.2. Znaczące (projektowe niedociągnięcia)

**P4. Ścieżka A (EnemyAttackHandler) wymaga mission.type='attack'.** [SIGNIFICANT]
**Pursue + intercept w MOS nigdy nie skończą się wreckiem targetu.** Nawet gdy
Bellator dogoni wrogiego vessela w deep-space (bez żadnej mission.type='attack'),
`_completeOrder` tylko zmienia state na `orbiting` bez `dockedAt` ("deep-space
drift state", MovementOrderSystem.js:493-502). Brak emit `battle:resolved`. To
jest potwierdzenie TODO M2 z linii 516-517. **Severity: to jest definiująca luka
M2.**

**P5. `WarSystem._isPlayerInSystem` sprawdza tylko kolonie.** [MINOR/SIGNIFICANT]
`WarSystem.js:342-349` — `playerPresent = colMgr.getAllColonies().some(c =>
system_of(c.planetId) === systemId)`. Flota gracza obecna bez kolonii → flota
wroga przelatuje przez pusty system bez bitwy. Dla gracza mającego tylko kolonię
w sys_home to nieistotne (always true), ale w późniejszej grze z wieloma
systemami tworzy dziurę. **Severity: minor dla M2**, significant długoterminowo.

**P6. Proximity metric niespójna między warstwami.** [MINOR]
- MOS: `Math.hypot(dx, dy)` w pikselach world-coords (THREAT_RADIUS_PX = 16.5)
- `vessel:arrived` (ścieżka A): nic o dystansie, tylko time-based (`gameYear >=
  arrivalYear`)
- `_fleetArrived` (ścieżka B): tylko time-based na `etaYear`, nic o pozycji vessela
- `playerHasOrbitalDominance` / `_hasHostileFleetInSystem`: na poziomie systemu
  (binary per-system), nie world-coords

Efekt: "dotarcie" do planety w ścieżce A to moment `arrivalYear`, nie fizyczna
odległość od planety. Jeśli vessel leci szybko i minie planetę, nadal
zarejestruje arrival. OK dla obecnego design (abstract), ale będzie mylące w M2
jeśli wprowadzimy "proximity engage" bazujący na world-coords. **Severity: minor.**

### 5.3. Drobne

**P7. `BATTLE_BATCH_WINDOW_MS = 500 ms real-time` vs game-time variable.** [MINOR]
Przy prędkości `10kr/s` (10 000 lat/sek), 500ms real-time = 5 000 lat game-time.
W tym czasie inne vessele mogą przybyć i zbatchować się w "tej samej bitwie",
mimo że w game-time dzieli je tysiące lat. To by design (§ batching w
EnemyAttackHandler.js:22-26), ale scena player'a przy max speed prowadzi do
"dziwnych" raportów bitew. **Severity: minor.**

**P8. Bellator w tranzycie przy `_wreckPlayerVesselsInSystem` — UX.** [MINOR]
Jeśli enemy wygra na home planet, wszystkie player vessele w `sys_home` (w tym
Bellator w pursue kilka AU od home) stają się wrakami. Gracz może nie
spodziewać się że jego ścigający Bellator zginął przy obronie home. UX problem,
nie breaking. **Severity: minor.**

---

## 6. CZĘŚĆ 5 — Gaps vs pierwotny plan M2

| Aspekt planowany dla M2 | De facto już dostarczone | Brakuje |
|-------------------------|-------------------------|---------|
| Proximity detection vessel↔vessel | Brak w M1. Obecnie tylko EnemyAttackHandler (arrival-based, nie proximity-based). | TAK — continuous "kiedy dwa vessele spotkają się w deep-space, odpal combat" |
| VesselDuelSystem (1v1 mini-battle) | **Częściowo** — `BattleSystem.vesselToBattleUnit` (BattleSystem.js:270) istnieje i obsługuje pojedynczy vessel. Brak wrappera "duel": full pipeline `resolveBattle(vesselA, vesselB)` musi być zbudowany — nie ma miejsca w kodzie gdzie tylko 2 vessele są input (EnemyAttackHandler zawsze agreguje z `_buildPlayerBattleUnit`). | TAK — dedicated caller dla 1v1 / small-engagement bez `_buildPlayerBattleUnit` coupling |
| `vessel:engageRequested` event (z M1 TODO) | **NIE** — event nie jest emitowany nigdzie. | Cała ścieżka "pursue completion → engage decision → combat" |
| Proper integration pursue completion → combat | Brak. `_completeOrder` (linia 478-518) ma komentarz TODO M2 (linia 516-517). | TAK — decyzja czy `_completeOrder` przy wrogim targecie emit-uje `vessel:engageRequested` lub bezpośrednio wywoła combat resolver |
| Cinematic playback dla vessel↔vessel | **Częściowo** — `battle:resolved` uruchamia BattleIntroModal + BattleView3D niezależnie od trigger type. Działa także dla ścieżki A. | Może — "mini cinematic" dla 1v1 vs "full cinematic" dla fleet battles (stylistyka) |
| Deep-space battle location (nie nad planetą) | **NIE** — wszystkie 3 ścieżki zakładają `location=systemId` lub `location=planetId`. Nie ma "location = (x,y) w przestrzeni". | TAK — reprezentacja bitwy w otwartej przestrzeni (UI, wrak placement) |
| Materialized fleet + retreat back to abstract | Brak. MilitaryAI.reinforce_home ma stub komentarz (MilitaryAI.js:104-110): "TODO M2: bidirectional reconciliation". | TAK — kiedy materialized vessels retreatuje, jak konwertować do abstract strength |
| Endurance reforma | M1 dostarczył per-tick drain + events. | Decyzje projektowe M2: czy endurance jest "fuel nowy"; interakcja z proximity combat |

### 6.1. Kluczowa konkluzja

**Combat vessel-vs-vessel NIE działa w deep-space** — istniejący flow (ścieżka A)
wymaga aby wrogi vessel dotarł do planety gracza. Jeśli Bellator złapie enemy
vessela w połowie drogi, `_completeOrder` tylko zatrzyma się w pustce bez
odpalenia combat. **To JEST luka którą M2 musi rozwiązać.**

Z drugiej strony, scenariusz "wrogi vessel dociera do home → bitwa" DZIAŁA i
produktywnie łączy się z MOS (przez `_onVesselWrecked`). M2 może zbudować na tym
fundamencie, zamiast tworzyć konkurencyjny system.

---

## 7. CZĘŚĆ 6 — Pytania projektowe dla iteracji M2

### Q1. Gdzie "strzela" pursue completion?

Alternatywy:
- **A.** `_completeOrder` przy wrogim targecie emituje `vessel:engageRequested`,
  którego nasłuchuje nowy `VesselDuelSystem` lub istniejący EnemyAttackHandler
  (ale EAH wymagałby przeprojektowania filtrów — obecnie zakłada targetPlanetId).
- **B.** `_completeOrder` bezpośrednio wywołuje `resolveBattle(vesselToBattleUnit(
  pursuer), vesselToBattleUnit(target), { location: ... })`, emituje
  `battle:resolved` natychmiast. Minimalna zmiana, duża kompatybilność z
  istniejącym cinematic.
- **C.** Proximity-based detection w tle (`ProximitySystem`) — `_completeOrder`
  nie odpala combat; osobny system per-tick sprawdza pary vesseli z
  `ownerEmpireId !== ownerEmpireId` w zasięgu i emituje combat. Większe zmiany,
  ale uogólnione (działa też dla nieordered encounters, np. vessel gracza vs
  patrolujący enemy z M2 patrol order).

**Rekomendacja:** B na MVP (szybki, minimalnie inwazyjny, reużywa BattleSystem),
potem rozszerzyć do C gdy M2 patrol/escort orders będą miały zasięg. A ma sens
tylko jeśli chcemy oddzielnego VesselDuelSystem z własną logiką (inne tuning
damage niż BattleSystem) — mało wartości na ten moment.

### Q2. Gdzie odbywa się bitwa vessel↔vessel — lokacja?

- **A.** `location = pursuer.position` (punkt gdzie pursue się zamknął). Deep-space.
  BattleRec pisze `location: {x, y}` obok `systemId`.
- **B.** `location = systemId` (upraszczamy, tak jak obecnie). Ignorujemy
  world-coords. Cinematic odpala się "w systemie" bez specific location.
- **C.** `location = nearest celestial body` (snap do planety/księżyca/asteroidy).
  Dziwne, ale zgodne z "orbiting bez dockedAt" z `_completeOrder`.

**Rekomendacja:** A. battleRec już ma opcjonalne `location.x/y`; gameState może
pomieścić. Daje fundament pod wrak placement w deep-space i późniejszą inspekcję
miejsca bitwy przez UI.

### Q3. Czy endurance drain ×3-4 w pursue nadal ma sens?

M1 design doc §5.4 wprowadził wzmożony drain endurance w pursue (×3-4 vs cruise).
Jeśli pursue typowo kończy się szybko bitwą (vessel ginie w ~4 turach bitwy zanim
endurance spadnie poniżej 20%), ten mechanizm jest marnotrawstwem kompleksowości.

- **A.** Zostaw ×3-4 — utrzymuje presję "pursue kosztuje zasoby" niezależnie od
  wyniku bitwy.
- **B.** Obniż do ×1-2 — bitwa sama w sobie jest już kara; endurance nie musi
  tłumaczyć pursue.
- **C.** Usuń drain multiplier, zastąp: "pursue completion do enemy vessela
  kosztuje X endurance" (flat cost) jako "zmęczenie bojem".

**Rekomendacja:** B na start, potem obserwować playtest. Gdyby pursue wchodził w
pętlę bez wyniku (A_retreats, player re-pursues, etc.), to wtedy wrócić do A lub C.

### Q4. BUG#4 "deep-space drift" — czy nadal relewantny po M2 combat?

BUG#4 (z M1 playtestu) dokumentował że po `_completeOrder` dla vessel targetu,
pursuer stoi w pustce bez nowego state. Jeśli M2 dodaje combat trigger przy
completion:

- **Gdy pursuer wygra:** target → wreck, pursuer → status='idle', state='orbiting',
  dockedAt=null. **Wciąż drift state.** Ale teraz z jasną decyzją: gracz wydaje
  `moveToPoint` do kolonii lub `pursue` na nowy target. Drift to logiczny "idle
  post-combat" a nie bug.
- **Gdy pursuer przegra:** pursuer → wreck. Drift nie istnieje (wrak ma własne
  mechaniki).
- **Gdy pursuer retreatuje:** `BattleSystem.js:140-141` rozróżnia retreat A vs B.
  Jeśli pursuer jest A i retreatuje (spadł <20% HP), vessel żyje ale bez dockedAt.
  **Bug4-like drift wraca.**

**Rekomendacja:** rozpatrzeć w M2 osobną decyzję: "retreat = auto-return do najbliższej
przyjaznej planety" (jak w space combat gry Stellaris). Wtedy BUG#4 znika bez
residuum.

### Q5. Czy ujednolicić `playerVesselsToBattleUnit` i `empireFleetToBattleUnit`?

Obecnie dwa agregatory:
- `playerVesselsToBattleUnit` — hull-based (BattleSystem.js:219); używany w
  EnemyAttackHandler + WarSystem._buildPlayerBattleUnit
- `empireFleetToBattleUnit` — strength-based (BattleSystem.js:177); używany w
  WarSystem._fleetArrived + forceBattle

Kiedy materializowana flota walczy (P2/P3), która funkcja jest używana?
- Materializer spawnuje vessele z hull+modules → są dostępne dla
  `playerVesselsToBattleUnit`. Ale jeśli `_fleetArrived` odpala na ich fleet,
  używa `empireFleetToBattleUnit(fleet)` — abstract, z strength=0.

To niespójność: zmaterializowane vessele istnieją jako konkretne obiekty, ale
WarSystem._fleetArrived i tak bierze abstract dane.

Alternatywy:
- **A.** `_fleetArrived` sprawdza `fleet.materializationState`: jeśli 'full',
  agreguje vessele przez `playerVesselsToBattleUnit` zamiast `empireFleetToBattleUnit`.
- **B.** Dwa flows są orthogonalne: `_fleetArrived` tylko dla abstract (nie-materialized), a
  materialized vessele walczą przez ścieżkę A (vessel:arrived). Wyklucza
  double-hit (P2) gdy `_fleetArrived` skipuje materialized.
- **C.** Jedna unified ścieżka — zdeprekować `empireFleetToBattleUnit`; abstract
  fleet przy arrival musi najpierw zmaterializować się (nawet minimalna), potem
  walka przez vessel-based.

**Rekomendacja:** B na MVP (najmniejsza zmiana, załatwia P2), potem rozważyć C
w M3 jako część "pełnej reformy combat unification".

---

## 8. Postscript — dane do runtime potwierdzenia

Gdybyśmy chcieli zamknąć **NIEPEWNE** oznaczenia w §3, kolejny playtest powinien
zebrać:

1. Pełny log `DebugLog.js` z zakresu wszystkich `battle:resolved` events.
2. `KOSMOS.debug.enableTargetingTrace()` włączony przed odpaleniem scenariusza —
   trace pokaże dokładnie: issue pursue, ticki pursue, completion lub
   blockage, dokładny gameYear każdego kroku.
3. Dump `window.KOSMOS.vesselManager._vessels` w momencie przed bitwą —
   potwierdzi listę wszystkich vesseli, mission types, pozycje.
4. Dump `gameState.get('empires.emp_test_enemy.fleets')` przed bitwą — czy
   `empire.fleets` istnieje i ma elementy (weryfikuje H-ALT).

Bez tych danych §3.2 pozostaje najbardziej prawdopodobną rekonstrukcją, ale nie
100% pewną.
