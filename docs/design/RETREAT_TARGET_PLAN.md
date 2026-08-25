# RETREAT_TARGET — odwrót z bitwy dobiera SCHRONIENIE, nie BAZĘ (F-D + F-E)

> **Status:** PODPISANY 2026-08-25 (D-FDa … D-FDk). Save **v101 bez migracji**.
> Rejestr wyjściowy: `UNIFIED_VESSEL_ORDERS_AUDIT.md` (F-D/F-E).
> Slice **przekrojowy**, NIE należy do VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).

**Jedno zdanie.** Odwrót z bitwy i powrót do bazy dzielą dziś JEDNĄ funkcję doboru celu
(`AutoRetreatSystem._findNearestFriendlyPlanet`), która filtruje po WŁAŚCICIELU i **nie ma terminu
układu** — więc wskazuje kolonie z innych układów, a rozkaz odpada na bramce `target_other_system`
⇒ **odwrót nie działa dla nikogo, gracza włącznie**. Rozszczepiamy na dwie nazwy: *schronienie*
(dowolne ciało w TYM układzie, orbita, `colonyId` nietknięty) i *baza* (własna kolonia, dok, re-homing).

---

## §1 Inwentarz — 7 call-site'ów + bliźniak, dwa rozłączne zbiory

Wszystkie ŻYWE (sprawdzone: rejestracja w `UIManager`, flagi `FEATURES`).

### Zbiór A — UCIECZKA (filtr własności ODZIEDZICZONY) → przepinamy

| # | miejsce | wyzwalacz | przy `null` dziś |
|---|---|---|---|
| 1 | `AutoRetreatSystem._issueRetreatOrder:70` | `battle:resolved` (AI) **+ `DSCS:1236` WPROST (gracz!)** | 🔴 `_turnIntoWreck` — **zabija** |
| 2 | `MovementOrderSystem._issueRetreat:453` | PPM „Wycofaj się z bitwy" + `FleetGroupPanel:471` | odmowa `no_friendly_planet` |
| 3 | `FleetSystem._tickCivYears:582` (doktryna `retreat_at_50`) | próg HP floty, co 0,5 civY | cichy `continue` |

### Zbiór B — POWRÓT DO BAZY (filtr własności POPRAWNY) → **NIETKNIĘTY**

| # | miejsce | co robi z wynikiem |
|---|---|---|
| 4 | `FleetManagerOverlay._handleFleetReturnBase:4550` | `_pendingReturnDock` → **`v.colonyId = planetId`** (`FleetSystem:653`) |
| 5 | `FleetCommandPanel._fleetReturn:384` | j.w. |
| 6 | `FleetGroupPanel:445` (`grpReturn`) | j.w. + fallback `startReturn` |
| 7 | `MovementOrderSystem._tryAutoReturnDrift:1848` (**F-E**) | ⚠ TELEPORT, nie rozkaz — omija bramkę układu całkowicie |

⚠ **`_pendingReturnDock` przepisuje BAZĘ** (`FleetSystem._maybeAutoDockOnReturn:653`, bezwarunkowo;
próg `RETURN_DOCK_THRESHOLD_AU:30` jest **martwy** — stała bez konsumenta). Dlatego ucieczka nie może
korzystać z tej ścieżki: wroga planeta stałaby się bazą statku.

⚠ **Gracz JUŻ dostaje auto-odwrót.** `AutoRetreatSystem:56` wychodzi dla `empireId==='player'`, ale
`DeepSpaceCombatSystem._resolvePlayerMissionsPostBattle:1236` woła `_issueRetreatOrder` **wprost**,
omijając tę bramkę, gdy flota gracza spadnie ≤ `RETREAT_THRESHOLD` (0.2) HP — flaga
`m4PlayerCombatMissionPause: true`. **Symetria istnieje, wpuszczona drugimi drzwiami**, a jedyna
gałąź, która ZABIJA, jest po obu stronach wspólna. To czyni D-FDe warunkiem koniecznym, nie ozdobą.

---

## §2 Trzy fakty, które przestawiają sens rozkazu

**2.1 — Bitwa DSCS trwa ~2,2 s REALNEGO czasu.** `MAX_ROUNDS=20` × `ROUND_INTERVAL_MS=110`
(`DSCS:54,69,447-470`), tempo **odpięte od zegara gry**. Pokonanie 0,5 AU przy `speedAU=1,4`
(⚠ **AU na rok GRY**, nie na civYear — `MOS:713` `travelYears = totalDistAU / speedAU`) zajmuje
0,357 roku gry = **~130 s realnych przy 1 d/s**, czyli **~59× dłużej niż cała bitwa**.
⇒ **Cel odwrotu nie decyduje o wyniku bitwy.** Rozkaz decyduje o tym, GDZIE ocalały wyląduje
i czy nie zostanie zwarty ponownie. (Pomiar 2 potwierdza wykonaniem.)

**2.2 — Dziś odmowa NIE MUTUJE NICZEGO; po naprawie odwrót zacznie mutować pięć rzeczy naraz.**

| mutacja | dowód |
|---|---|
| paliwo pobierane przy WYDANIU, **także pod `bypassFuelCheck`** | `MOS:765-767` |
| `position.dockedAt` na obce ciało | `VesselManager:2409` |
| `colonyId` przepisany (ścieżka doktryny) | `FleetSystem:653` |
| kara dyplomatyczna za przylot uzbrojonego statku | `DiplomacySystem:608-628` (flaga `lightDiplomacy` ON) |
| **pierwsze uruchomienie destrukcji preempcyjnej na odwrocie** (`_preemptCommit` tylko po `res.ok`) | `MOS:232-238` |

**2.3 — Dwa zarzuty blokujące (zweryfikowane w kodzie), które projekt musi zamknąć:**

- 🔴 **Z1 — uciekinier AI parkuje nad kolonią gracza na zawsze.** `SystemPoolService:363`:
  `if (pos.dockedAt === body.id) return true;` — **sam fakt zadokowania**, bez testu odległości ⇒
  blokada puli `logistics_hub`. `DirectorDoctrine:268` pomija statki z `movementOrder` ⇒ AI po niego
  nie wróci. `EnemyAttackHandler:92-98` zbiera **każdy** wrogi statek orbitujący planetę do zbiorowej
  bitwy ⇒ darmowe posiłki następnej fali. **Zamyka D-FDb=W2** (ciała obcego imperium na końcu drabiny).
- 🔴 **Z2 — odwrót na ciało w promieniu starcia bywa wyrokiem.** `DSCS._allOutsideOf:889-890` pomija
  statki z `dockedAt != null`; gdy wszyscy żywi zadokują, `aliveCount=0` → `false` (`:896`) ⇒ bitwa
  dojeżdża do `MAX_ROUNDS` z `retreated=null` ⇒ **side-level wrak żywych przegranych** (`:729-732`,
  `:968-977`). **Zamyka D-FDd=W3** (selektor + marker).

**Co się NIE potwierdziło** (dossier się mylił, sprawdzone w kodzie): tankowanie z cudzego magazynu
**nie grozi** (`_tickRefueling` wymaga `state==='docked'`, `VesselManager:1929`, a przylot daje
`orbiting`) · orbitowanie wrogiego ciała **samo z siebie nie wyzwala ataku** (`EnemyAttackHandler`
bramkuje na `mission.type==='attack'`) · **planety** nie wpadają w strefę wykluczenia Słońca
(generator liczy własne `minOrbitAU ≥ 0,35`; perihelium ≥ 0,3185 AU) — teoretycznie tylko księżyce
planet wewnętrznych, a pomiar 1 nie znalazł ANI JEDNEGO takiego przypadku na 587 ciałach.

---

## §3 POMIARY WYKONANE PRZED KODEM (sondy w scratchpadzie, poza repo)

### Pomiar 1 — geometria (`probe-retreat-geometry.mjs`, 12 wygenerowanych układów, 7 200 próbek)

```
ciał/układ: min 38 · p50 50 · p90 56 · max 57 (suma 587) · odsiane strefą Słońca: 0
knob: CLEARANCE = 0.50 AU (= COMBAT_DISENGAGE_AU)

STARCIE PRZY CIELE (kolonia/orbita) — 3600 próbek
  d(najbliższe ciało)           min 0.00 · p50 0.07 · p90 0.13 · max 0.15 AU
  d(najbliższe POZA bąblem)     min 0.50 · p50 3.06 · p90 6.90 · max 16.64 AU
  bąbel ZMIENIŁ wybór           3600/3600 (100.0%)
  dodatkowy dystans             p50 3.00 · p90 6.85 · max 16.54 AU
  bąbel OPRÓŻNIŁ zbiór          0/3600 (0.0%)

STARCIE W PUSTCE (przechwyt) — 3600 próbek
  bąbel ZMIENIŁ wybór           50/3600 (1.4%)
  bąbel OPRÓŻNIŁ zbiór          0/3600 (0.0%)
```

**Wnioski wiążące dla implementacji:**

1. **Zbiór kandydatów nigdy nie jest pusty**, a bąbel go **nigdy nie opróżnia** (0/7200)
   ⇒ **szczebel 2 (wektor ucieczki) jest w praktyce NIEOSIĄGALNY.** Zostaje jako backstop
   poprawnościowy i **musi być pinowany na syntetycznym układzie zdegenerowanym**, inaczej keeper
   mierzyłby ciszę.
2. **Knob `RETREAT_CLEARANCE_AU` jest NIEWRAŻLIWY.** Rozkład jest bimodalny: przy ciele najbliższe
   ciało leży ≤0,15 AU, a następne dopiero ~3 AU. Każda wartość z przedziału ~0,16–3,0 AU wybiera
   TO SAMO ciało. **0,50 nie wymaga kalibracji** — i nie ma sensu jej „stroić".
3. **Cena bąbla jest realna, ale opłacalna.** Odwrót ze starcia o kolonię to w medianie lot 3 AU.
   Kontrola paliwowa (fregata: bak 10, 0,4/AU): **3 AU = 1,2 = 12 % baku**, p90 6,85 AU = 27 %,
   max 16,5 AU = 66 %. Początkowa obawa („bąbel jest za drogi") **nie potwierdziła się**;
   D-FDc=W1 przechodzi pomiar.

### Pomiar 2 — wyścig (`probe-retreat-race.mjs`, kadencja DSCS modelowana 1:1)

Pytanie: czy statek zdąży być ZAKLASYFIKOWANY jako uciekinier (`dist(mid) > 0,50 AU` **i**
`dockedAt == null`) w którejś rundzie, zanim doleci i zadokuje?

```
cel 0.6 AU od midpointu     1. runda OUT      runda przylotu    OUT przed końcem bitwy?
  1 d/s                     —                 —                 NIE   (0 próbek OUT w 120 s)
  1 m/s                     #47 (5.07 s)      #55 (6.02 s)      NIE
  1 r/s                     #5  (0.45 s)      #5  (0.52 s)      TAK   ← JEDNA próbka OUT
```

**Wnioski wiążące:**

1. **Przy 1 d/s — czyli przy prędkości, na którą auto-slow sam schodzi w chwili starcia gracza
   (`TimeSystem` na `vessel:engaged`, emitowane przez `DSCS:362`) — klasyfikacja NIE NASTĘPUJE NIGDY**
   w oknie życia bitwy. Odwrót jest z natury **post-battle**. To potwierdza §2.1 wykonaniem.
2. **Wyścig JEST REALNY przy 1 r/s.** Statek pokonuje **1,85 AU na jedną rundę** (110 ms), więc dla
   celu 0,6 AU pierwsza próbka OUT i przylot wypadają w TEJ SAMEJ rundzie — przy innej fazie
   próbkowania statek przeszedłby z „wewnątrz" wprost w „zadokowany", **nie będąc policzonym ani razu**.
   ⇒ **sam clearance NIE zamyka Z2. D-FDd=W3 (selektor + marker w DSCS) jest konieczne — dowiedzione.**

### Pomiar 2b — kontrola mechanizmu D-FDf (`probe-retreat-arrival.mjs`)

```
A) targetBodyId=p_rock → PO PRZYLOCIE: state=orbiting · dockedAt=p_rock · mission=null
                          colonyId: p_home → p_home  ✓ NIETKNIĘTY · paliwo 8.80/10
B) KONTROLA sam targetPoint → dockedAt=p_rock (auto-przejęcie ciała spod punktu przez _findBodyNearPoint)
C) KONTROLA pusty punkt     → dockedAt=null, status=idle  ⇒ to jest semantyka szczebla 2 (dryf)
```

⚠ Pierwsze uruchomienie tej kontroli było **JAŁOWE** (statek nie doleciał w oknie sondy — mierzyłoby
stan w locie). Powtórzone z wymuszonym przylotem. Kontrola B pokazuje, że jawny `targetBodyId` nie
jest ściśle *konieczny*, gdy punkt pokrywa się z ciałem — jest konieczny, bo `_findBodyNearPoint`
**nie ma terminu układu** (Finding 138) i bo przewidziany punkt ruchomej planety nie pokrywa się z nią.

---

## §4 Decyzje PODPISANE (D-FDa … D-FDk)

| id | decyzja | wariant |
|---|---|---|
| **D-FDa** | Nowy dobór mieszka w **nowym czystym module** `src/utils/RetreatTarget.js`; `_findNearestFriendlyPlanet` **nietknięty** | **W1** |
| **D-FDb** | Własność = **kolejność preferencji, nie filtr**: własne → niczyje → ciała obcego imperium na końcu | **W2** |
| **D-FDc** | Selektor odrzuca ciała bliżej niż `RETREAT_CLEARANCE_AU = COMBAT_DISENGAGE_AU` (0,50) od punktu starcia | **W1** |
| **D-FDd** | Bitwę domykają **OBA**: selektor (clearance) **i** `DSCS._allOutsideOf` uczy się markera `retreatFromBattleId` | **W3** |
| **D-FDe** | Brak celu ⇒ **drabina**: ciało → wektor ucieczki → odmowa. **`_turnIntoWreck` znika z `AutoRetreatSystem`** | **W3** |
| **D-FDf** | Po dotarciu **ORBITA** (`targetBodyId`, `dockedAt=bodyId`, `colonyId` NIETKNIĘTY); `_pendingReturnDock` **usunięty ze ścieżki doktryny** | **W1** |
| **D-FDg** | Bypass paliwa **zostaje**; selektor **preferuje ciała z portem** (tankowanie możliwe po dolocie) | **W3** |
| **D-FDh** | F-E (dryf): własność **zostaje** + dochodzi termin układu + **drugi szczebel zamiast wiecznej pętli „+5 lat"** | **W3** |
| **D-FDi** | Tylko **jawny `targetBodyId`** w naszych ścieżkach; `_findBodyNearPoint` (Finding 138) — **osobny podpis, poza tym slice'em** | **W2** |
| **D-FDj** | Pełna widoczność: nowy powód + domknięcie brakujących kluczy i18n + **konsument sukcesu** | **W2** |
| **D-FDk** | **Rozkaz `retreat` przechodzi MIMO `vessel_immobilized` / `vessel_in_reserve`** — prawo do przeżycia nie jest nagrodą za zaległości | *(nowa)* |

### Drabina rang selektora (D-FDb + D-FDg razem)

```
tier 0  ciało z WŁASNĄ kolonią/stacją MAJĄCĄ PORT   ← jedyny tier, na którym da się zatankować
tier 1  ciało z WŁASNĄ kolonią/stacją bez portu
tier 2  ciało NICZYJE
tier 3  ciało z kolonią OBCEGO właściciela          ← ostatni (Z1)
```

Drabina jest **bezwzględna** (dowolne ciało niższego tieru bije dowolne ciało wyższego); odległość
porządkuje WEWNĄTRZ tieru. To jest świadome: przy `bypassFuelCheck` statek i tak doleci, więc
maksymalizujemy szansę wylądowania tam, gdzie **da się zatankować** — inaczej powstaje limbo
klasy Finding 111/125 (statek żywy, paliwo 0, orbita bez portu, `_tickRefueling` wymaga `docked`).

---

## §5 Kształt

**NEW `src/utils/RetreatTarget.js`** — rodzina NAZWANYCH funkcji (wzór `ColonyOwnership.js`),
zero przeciążonych flag boolowskich:

```
bodiesInSystemOf(vessel)                                  → Body[]
nearestShelter(vessel, { avoidPoint, clearanceAU, colonyManager })
                                                          → { body, distanceAU, tier, foreignAnchor } | null
nearestOwnColonyBodyInSystem(vessel, colonyManager)       → { colony, planet, distanceAU } | null   ← F-E
escapeVector(vessel, avoidPoint, minAU)                   → { x, y } | null                          ← szczebel 2
```

**Przepięcia:** #1, #2, #3 → `nearestShelter` · #7 (F-E) → `nearestOwnColonyBodyInSystem`.
**Bez zmian:** #4, #5, #6 (powrót do bazy) czytają `_findNearestFriendlyPlanet` dokładnie jak dziś.

**Rozkaz ucieczki:** `moveToPoint` z jawnym `targetBodyId`, `bypassSpaceportCheck`, `bypassFuelCheck`,
`issuedBy:'auto_retreat'|'manual_retreat'`, marker `movementOrder.retreatFromBattleId`.
**Bez `_pendingReturnDock`** (D-FDf) ⇒ `colonyId` nietknięty.

---

## §6 Poza zakresem (świadomie)

- **Finding 138** — `VesselManager._findBodyNearPoint:3410` bez terminu układu (D-FDi=W2: osobny podpis;
  dotyka KAŻDEGO rozkazu celowanego punktem, więc rozszerzałby promień rażenia).
- **`_pendingReturnDock` stawiany PRZED `issueOrder` i niesprzątany przy odmowie** na trzech ścieżkach
  POWROTU (#4/#5/#6). Wzór poprawki jest w repo (`_issueDock` stawia `_pendingDock` pod `if (result?.ok)`,
  `MOS:427`), ale to zbiór B — poza tym slice'em. **Filed.**
- **Kara dyplomatyczna za przylot uciekiniera** (`DiplomacySystem:608-628`) — zostaje jak jest.
- **Strona AI nie ma snapshotu/wznowienia misji po `_freezeAsStationary`** (gracz ma) ⇒ okręt AI
  z wyzerowaną misją zostaje z `movementOrder` w `active` na zawsze. **Filed, osobny slice.**
- **Balans**: czy 3 AU odwrotu od kolonii to właściwa cena. To pytanie do gate'u, nie do planu.

---

## §7 Keepery

- NEW `src/testing/smoke/retreat_target_smoke.mjs` — **fail-first**: termin układu, drabina tierów,
  clearance, brak wraku, szczebel 2 na **syntetycznym układzie zdegenerowanym** (bo pomiar 1 pokazał,
  że w realnym układzie ten szczebel jest nieosiągalny), `colonyId` nietknięty, D-FDk.
- `retreat_preempt_smoke.mjs` **T4** — trzy asercje: `reason==='target_other_system'` **padnie
  (pin do świadomego ODWRÓCENIA)**; `ai.isWreck !== true` **musi przeżyć** (to jest test D-FDe);
  **jedyny dziś pin inwariantu D-VO3a** traci swojego producenta odmowy ⇒ przepiąć.
  ⚠ Po D-FDk `vessel_immobilized` **przestaje blokować `retreat`** — pin D-VO3a musi użyć innego typu
  rozkazu, inaczej znowu zmierzy ciszę.

**Save:** v101, **zero migracji** (wszystko liczone w runtime). **i18n:** PL+EN.
