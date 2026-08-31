# Finding 130 (+ Z2) — misja rajdera AI ginie w starciu; parkowanie to OSOBNY problem

> **Status:** ✅ **PODPISANE 2026-08-31 (D-130-1..4 = W1) i WDROŻONE.** Wykonanie: §6. Live-gate: §7.
> Rejestry macierzyste: `OPEN_FINDINGS_INDEX.md` §130 · `VO3B_PLAN.md` §6 (Z2).
> Sonda fail-first: `src/testing/headless/probe-130-z2.mjs`.
> Save **v101, bez migracji** (pola runtime).

---

## 0. Reguła wejścia (z poprzedniej sesji) — wynik

`git log -S "_freezeAsStationary"` + uruchomienie keepera **przed** audytem:

- **130 ŻYWY, niezamknięty.** Ale `git log -S` pokazał rzecz, której rejestr nie notuje:
  commit **`046976d`** dodał **pełny mechanizm migawki i wznowienia — TYLKO DLA GRACZA**
  (`m4PlayerCombatMissionPause`, flaga **ON**). Keeper `player_combat_mission_pause_smoke`
  **19/19 zielony**.
- ⇒ **To nie jest brak mechanizmu, tylko ASYMETRIA.** Naprawa polega na rozszerzeniu istniejącej,
  przetestowanej ścieżki na stronę B — nie na projektowaniu czegoś nowego.

---

## 1. Fail-first — zmierzone WYKONANIEM (`probe-130-z2.mjs`)

Rajder AI (`mission=attack`) i statek gracza (`mission=recon`) wchodzą w to samo starcie DSCS:

| | rajder AI | statek gracza |
|---|---|---|
| przed starciem | `mission=attack` | `mission=recon` |
| **po `startEngagement`** | `mission=null`, **`_suspendedMission=BRAK`** | `mission=null`, **`_suspendedMission=recon`** |
| `strikeReadyVessels('emp_001')` | **`[v_ai]` — WRÓCIŁ do puli** | — |

Kod, który to robi (`DeepSpaceCombatSystem:392-394`):

```js
for (const v of sideBVessels) this._freezeAsStationary(v, dominantDocked);   // AI: mission = null
if (ownerA === 'player') this._pausePlayerSideForCombat(sideAVessels, …);    // gracz: migawka + wznowienie
```

**Dwie szkody, nie jedna:**
1. **Ta z rejestru** — `EnemyAttackHandler:42` bramkuje na `mission.type === 'attack'`, więc po
   wyzerowaniu misji **przechwycenie w głębokiej przestrzeni po cichu kasuje całe uderzenie AI**.
2. **Ta NIEZANOTOWANA, i to ona łączy 130 z Z2** — `DirectorOffensive.strikeReadyVessels:82` ma
   `if (v.mission) continue;`. Zerowanie misji **wpisuje rajdera z powrotem do puli uderzeniowej**
   w tej samej chwili, w której go rozbraja z zadania.

---

## 2. ⚠ KOREKTA PRZESŁANKI — 130 **NIE ODBLOKOWUJE** Z2

Rejestr (i zlecenie) mówi: *„130 jest warunkiem koniecznym dla Z2 — rajder bez zapisanej misji
nie ma czym wrócić"*. **Mechanizm jest inny, niż zapisano**, i to zmienia zakres pracy.

**(a) W migawce NIE MA nogi powrotnej.** `MovementOrderSystem._issueAttack` wydaje `moveToPoint`
na ciało i **przemianowuje** misję (`vessel.mission.type = 'attack'`). Zmierzona zawartość:
`{type:'attack', targetId:'p_home', phase:'in_system'}` — **bilet w jedną stronę**. Nawet pełne
wznowienie zawróciłoby rajdera do planety, przy której już stoi.

**(b) Nie ma czego przywracać, bo powrotu NIGDY nie było.** `homeSystemId` w całym `src/systems/`
pojawia się wyłącznie w kolonizacji i logistyce (`EmpireStrategySystem`, `EmpireLogisticsSystem`).
**Zero logiki powrotu okrętu wojennego AI do domu.** Z2 wymaga więc **zbudowania** mechanizmu,
nie odtworzenia.

**(c) Parkowanie ma DRUGIEGO producenta, którego 130 nie dotyka.**
`EnemyAttackHandler:241-245`, przy **zwycięstwie AI** w bitwie orbitalnej:

```js
v.position.state = 'orbiting';
v.position.dockedAt = planetId;   // ← DOKUJE przy planecie GRACZA
v.status = 'idle';
v.mission = null;                 // ← drugie bezwarunkowe zerowanie, też bez migawki
```

To jest **bliższy sedna Z2 niż DSCS**: jawnie sadza rajdera na orbicie gracza. Naprawa samego 130
zostawiłaby ten site nietknięty ⇒ **rajder dalej parkowałby**, tylko innym torem.
⚠ Klasa „policz PRODUCENTÓW, zanim uznasz problem za utwardzony" (`131cc2e`).

**Wniosek:** 130 i Z2 **nie są jednym zadaniem**. 130 jest samodzielny, mały i przetestowany
wzorem gracza. Z2 to cztery niezależne składniki (dwa producenty parkowania + brak filtra puli
+ `bypassFuelCheck` + brak mechanizmu powrotu) — czyli dokładnie ta **„zmiana JAKOŚCIOWA modelu
wojny"**, którą `VO3B_PLAN.md` §6 sam nazwał i którą właściciel **świadomie przyjął jako
tymczasową 2026-08-26**, odsyłając do osobnego slice'u „AI wraca po ataku".

---

## 3. Anatomia Z2 (na przyszły slice — NIE do wykonania tutaj)

| składnik | gdzie | uwaga |
|---|---|---|
| parkowanie po starciu deep-space | `DSCS:1219` (`_freezeAsStationary`) | domyka je 130 **tylko częściowo** |
| parkowanie po wygranej orbitalnej | `EnemyAttackHandler:241-245` | **dokuje przy planecie gracza**; 130 tego nie rusza |
| ponowny dobór z parkingu | `DirectorOffensive.strikeReadyVessels:71-88` | brak filtra `dockedAt` / układu macierzystego |
| brak kosztu | `issueAttack` w tym samym układzie → `bypassFuelCheck` | brak presji paliwowej |
| **brak powrotu** | — | ⚠ **nie istnieje w ogóle** |

✅ **Wykonalność powrotu potwierdzona:** `WarpRouteSystem.canOrder` odrzuca statki AI, więc AI
podróżuje przez `dispatchInterstellar` (skok pojedynczy, bez limitu długości) — ta sama maszyneria
obsłuży nogę powrotną. Nie trzeba nowego transportu, trzeba **intencji**.

---

## 4. DECYZJE DO PODPISU

| # | pytanie | W1 (rekomendacja) | W2 |
|---|---|---|---|
| **D-130-1** | kształt naprawy | **Uogólnić istniejącą ścieżkę gracza na obie strony** (`_pausePlayerSideForCombat` → `_pauseSideForCombat`, `_resolvePlayerMissionsPostBattle` → obie strony). Dwie równoległe implementacje tego samego rozjechałyby się — reguła nieutwardzonego bliźniaka | osobna ścieżka AI |
| **D-130-2** | kill-switch | **Nowa flaga `m4EnemyCombatMissionPause`** — zmiana zachowania AI jest odczuwalna w rozgrywce i musi dać się wyłączyć NIEZALEŻNIE od gracza (także na gate'cie) | reuse flagi gracza (nazwa zaczęłaby kłamać) |
| **D-130-3** | co po bitwie dla AI | **Wznów misję, chyba że warstwa order przejęła** (`vessel.mission != null` → oddaj sterowanie). **BEZ** gałęzi odwrotu przy niskim HP — dla AI robi to już `AutoRetreatSystem` | lustro pełnej ścieżki gracza (ryzyko podwójnego odwrotu) |
| **D-130-4** | zakres slice'u | **130 SAM; Z2 zostaje otwarty z anatomią z §3** | 130 + Z2 razem |

### Dlaczego rekomenduję rozdzielenie (D-130-4)

1. **Bo inaczej „zamknięcie Z2" byłoby nieprawdziwe** — bez ruszenia `EnemyAttackHandler:245`
   rajder parkuje dalej, a slice raportowałby sukces.
2. **Bo Z2 to strojenie, nie poprawność** — jak długo w domu, ile paliwa, czy ryzyko przechwycenia:
   każdy z tych progów wymaga pomiaru w rozgrywce, nie keepera.
3. **Bo 130 jest wartościowy sam** — dziś przechwycenie w głębokiej przestrzeni **po cichu kasuje
   uderzenie AI**, co fałszuje każdy pomiar tempa wojny.

⚠ **Uczciwie o skutku ubocznym D-130-4:** naprawa 130 sprawi, że rajder z przywróconą misją
**przestanie natychmiast wracać do puli uderzeniowej** (`strikeReadyVessels:82`) — czyli Z2
złagodnieje, ale **nie zniknie**: po ukończeniu wznowionej misji `EnemyAttackHandler:245`
wyzeruje ją ponownie i rajder wróci do puli z parkingu. To jest opóźnienie, nie zamknięcie.

---

## 5. Keeper (po podpisie)

NEW `ai_combat_mission_pause_smoke.mjs`, **wykonaniowy** (DSCS importuje się headless — sonda
dowiodła):

- **T1** symetria: obie strony dostają migawkę; obie wznawiają. Fail-first: AI nie ma.
- **T2** **rdzeń związku z Z2**: rajder z przywróconą misją **NIE** wraca do `strikeReadyVessels`
  + kontrola pinu (z wyzerowaną — wraca).
- **T3** warstwa order przejęła → migawka porzucona, bez wyścigu.
- **T4** **pin limitu**: `EnemyAttackHandler:245` NIETKNIĘTY ⇒ Z2 dalej otwarty. Pin ma **mówić
  wprost**, że to świadoma granica slice'u, żeby następna osoba nie wzięła zieleni za zamknięcie Z2.
- **T5** kill-switch: flaga OFF → zachowanie sprzed naprawy, bit w bit.

⚠ **Fixture musi modelować REALNY kształt** — przy pisaniu sondy `modules: [{id, slotType}]`
przeszło `node` i cicho wypadło z walki (`hasWeapons` czyta tablicę **stringów**). Złapał to
dopiero `KOSMOS.debug.combatTrace`; bez trace'u sonda mierzyłaby ciszę.


---

## 6. WYKONANIE (2026-08-31)

**Fail-first: 13 pass / 6 fail** — mierzone finalnymi pinami na nietkniętym kodzie; wszystkie
kontrole pinu zielone po obu stronach. **Po naprawie: 19/19.**

Sonda `probe-130-z2.mjs`, ten sam scenariusz przed i po:

```
PRZED                                      PO
rajder AI    _suspendedMission=BRAK        rajder AI    _suspendedMission=attack
statek gracza _suspendedMission=recon      statek gracza _suspendedMission=recon
```

**Zmiany:**
- `_pausePlayerSideForCombat` → **`_pauseSideForCombat(vessels, pin, { isPlayer })`** — jedna
  ścieżka dla obu stron. ⚠ **Zamrażanie zostaje ASYMETRYCZNE i to jest zamierzone:** strona AI
  jest zamrażana ZAWSZE (także przy fladze OFF — to zachowanie sprzed 130 i kill-switch nie ma
  prawa go zmienić), strona gracza tylko przy fladze ON (kontrakt z `046976d`).
- `_resolvePlayerMissionsPostBattle` → **`_resolveMissionsPostBattle`** — iteruje OBIE strony,
  każdą bramkowaną własną flagą. Gałąź odwrotu **tylko dla gracza** (D-130-3): dla AI odwrót
  wydaje `AutoRetreatSystem` na `battle:resolved`, więc druga gałąź dałaby **dwa odwroty na
  jedną bitwę**. Realizacja: `eligible` liczone wyłącznie dla gracza.
- `_joinEncounter` — wzmocnienie strony B też idzie wspólną ścieżką (bez tego byłby
  **nieutwardzony bliźniak** tego samego szwu).
- NEW flaga `m4EnemyCombatMissionPause` (default ON), niezależna od gracza.

**Dwa odwołania, które po zmianie nazwy by KŁAMAŁY** (naprawione w tym samym commicie):
komentarz `AutoRetreatSystem:70` (wskazywał starą nazwę i numer linii) oraz dwa wywołania
w keeperze A1.

### ⚠ Świadome odwrócenie pinu w keeperze A1

`player_combat_mission_pause_smoke` **T6** brzmiał „**no-op dla AI↔AI**" — i pinował **DEFEKT**:
migawkę dostawał wyłącznie gracz, więc bitwa dwóch AI nie wznawiała niczego. To jest dokładnie
Finding 130. Po D-130-1 AI↔AI **ma** wznawiać. Inwariant „bez właściwej flagi nic się nie dzieje"
nie zniknął — przeniósł się na **kontrolę pinu** (flaga AI OFF → znowu no-op). A1: 19 → **21/21**.

---

## 7. LIVE-GATE — ✅ **PASS 2026-08-31** (właściciel, na żywo)

**Wynik — dwa rajdery, dwie różne ścieżki, obie poprawne:**
- **`v_21`** przeżył starcie bez odwrotu → misja **wznowiona jako `attack`** (nie `null`),
  **kontynuował lot i dotarł do celu** (`state: orbiting`, `dockedAt: entity_11`). To jest rdzeń
  130: przechwycenie przestało po cichu kasować uderzenie.
- **`v_22`** wycofał się przez `AutoRetreatSystem` (`move_to_point`, `issuedBy: auto_retreat`) —
  **zero konfliktu z mechanizmem 130**. ⚠ To najmocniejsza część gate'u, bo dokładnie ta
  interakcja była ryzykiem D-130-3: gdyby AI dostało własną gałąź odwrotu, byłyby **dwa odwroty
  na jedną bitwę**. Na żywo potwierdzone, że jest jeden.

⚠ **GRANICA DOWODU — kill-switch (krok 4) NIE był testowany w przeglądarce.** Flagę
`m4EnemyCombatMissionPause` pinuje wyłącznie keeper **T5** (wykonaniowo, obie gałęzie).
Nie nazywać jej zweryfikowaną na żywym silniku.

Naprawa jest **niewidoczna wprost w UI** — dotyczy stanu misji AI. Najprostsza obserwowalna
konsekwencja: **przechwycony rajder nie porzuca już uderzenia**.

| # | krok | oczekiwane |
|---|---|---|
| 1 | `KOSMOS.debug.spawnEnemyRaider()` (lub naturalne uderzenie), przechwyć go własnym uzbrojonym statkiem w głębokiej przestrzeni | bitwa DSCS się rozgrywa |
| 2 | po bitwie: `KOSMOS.vesselManager.getAllVessels().filter(v => v.ownerEmpireId).map(v => [v.name, v.mission?.type])` | ocalały rajder ma **`attack`**, nie `null` |
| 3 | obserwuj dalej | rajder **kontynuuje** uderzenie na planetę zamiast stanąć bezczynnie |
| 4 | `GAME_CONFIG.FEATURES.m4EnemyCombatMissionPause = false`, powtórz 1-2 | misja znowu `null` (kill-switch działa) |
| 5 | konsola | brak błędów |

⚠ **Czego ten gate NIE zamyka: Z2.** Po ukończeniu wznowionej misji `EnemyAttackHandler:245`
zeruje ją ponownie i **dokuje rajdera przy planecie gracza** — parkowanie zostaje. Keeper **T4**
pinuje tę granicę wprost, żeby zielony przebieg nie został wzięty za zamknięcie Z2.

---

## 8. Obserwacja z wykonania (niezmierzona, do rejestru przy Z2)

**W trakcie trwającej bitwy rajder jest w `strikeReadyVessels`.** DSCS zeruje `mission` na czas
walki, a pula pyta tylko o `mission`/`movementOrder`/`pendingOrder` — **nie istnieje żaden
publiczny predykat „statek jest w starciu"** (grep czysty: brak `_vesselToEncounter`/`isInCombat`).
Director mógłby więc teoretycznie wysłać nowe uderzenie okrętem, który właśnie się bije.
⚠ **Pre-existing i przez tę naprawę ZWĘŻONE**, nie poszerzone (po bitwie misja wraca i statek
wypada z puli). Osiągalność niezmierzona — należy do slice'u Z2, gdzie i tak trzeba dotknąć
predykatów puli.
