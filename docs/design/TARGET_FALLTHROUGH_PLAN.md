# Finding 210 — drabina ocenia tylko GŁOWĘ rankingu, więc AI nie atakuje tego, co MOŻE wziąć

> **Status:** 📋 **PODPISANE 2026-08-31.** Decyzje: **D-210-1 = A** (fall-through W ISTNIEJĄCYM
> porządku wartości) · **D-210-2 = TAK** (rozdział `pickTarget` / `pickAttainableTarget`, z §6.3
> wciągniętym w sygnaturę) · **D-210-3 = TAK** (`skippedHead` w `strikeLaunched`) ·
> **D-210-4 = NIE** (bez limitu fall-through) · **D-210-5 = ta sama flaga `FEATURES.defenseScope`** ·
> **D-210-6 = 202 poza zakresem, zapisane jako NASTĘPNA dystorsja.**
> **Poprawka właściciela do kontraktu drabiny: TRZY stany terminalne** — §4.
> Save **v101, zero migracji**. **Rejestr macierzysty:** `VESSEL_ORDERS_PLAN.md` §Findings 210.
> Sonda pomiarowa: scratchpad, **poza repo** (`probe-210.mjs`).
> Poprzedni slice tej rodziny: `DEFENSE_SCOPE_PLAN.md` (Findingi 199 + 200, arc zamknięty).

---

## 0. Reguła wejścia

`git log -S` na `launchStrike` (5 commitów, ostatni `b2e94ef`) · `pickTarget` (12, ostatni `6e48460`)
· `reachableTargets` i `targetValue` — **oba nietknięte od `07c1087` (W3-5)**.
Keepery przed audytem: `w3_target_selection` 32/32 · `defense_scope` 50/50 · `ai_strike_recall` 62/62
· `vo3b_order_clear` 30/30 · `w3_attack_dispatch` 37/37 — **wszystkie zielone**, żaden nie pinuje
zachowania „głowa vs reszta".

**Promień rażenia jest wąski:** `pickTarget` ma **dwóch** konsumentów — `launchStrike` i
`strikeReport` (`GameScene:658`). Poza `DirectorOffensive` nikt tego nie czyta.

---

## 1. Mechanizm — z doprecyzowaniem, którego rejestr nie miał

`launchStrike` bierze **jeden** cel z `pickTarget` i na nim kończy: gdy ten jeden wypadnie
`target_beyond_reach`, akcja odmawia **bez fall-through** do celu osiągalnego.

⚠ **Commit 2 slice'u DEFENSE_SCOPE JUŻ mityguje 210 WEWNĄTRZ układu** — i to zmienia zakres naprawy.
Dodany wtedy człon `needed` asc sortuje w obrębie tego samego poziomu wartości, więc gdy w bogatym
układzie stoi tańsze ciało, **ono zostaje głową** i AI atakuje normalnie. ZMIERZONE: po dołożeniu
placówki w `sys_home` głową jest **Placówka (`needed 3`)**, nie Stolica (`needed 10`).

⇒ **210 bije WYŁĄCZNIE CROSS-SYSTEM**, gdzie poziomy `targetValue` się różnią i tie-break nigdy nie
wchodzi. Dokładnie ten stan miał właściciel na live-gate'cie: w `sys_home` nie było tańszego
rodzeństwa, więc głowa (`needed 9`) blokowała wszystko.

---

## 2. POMIARY WYKONANE PRZED KODEM

Instrument **Z2** (`rollFires` + prawdziwa reguła `strike_player_target` + czasy przelotu z sondy Z2/C)
+ **produkcyjne** `requiredSquadron` / `_buildPlayerBattleUnit` / `resolveBattle`. Warianty realizowane
przez podmianę **samego wyboru celu** — reszta łańcucha nietknięta.

⚠ **Fixture MUSI być trzysystemowy** — jednosystemowy z audytu 199 nie mógłby tego defektu pokazać.

| ciało | układ | wartość | HP obrońcy | `needed` |
|---|---|---|---|---|
| Stolica | sys_home | **227** | 740 | **10** ← ponad sufit |
| Średni | sys_mid | 100 | 180 | 3 |
| Alioth | sys_low | 50 | 30 | 1 |

### 2.1 Tempo / 100 lat wyświetlanych, średnia z 4 ziaren

| pula | wariant | uderzeń | odmowy | AI wygr/przegr | kadłuby AI | wycz. AI / gracz | trafienia |
|---|---|---|---|---|---|---|---|
| **1** | **V0 dziś** | **0,0** | **beyond 19,8** | 0/0 | 0 | 0 / 0 | — |
| 1 | A | 10,0 | — | 10/0 | **0** | 20 / 90 | Alioth |
| 1 | B | 10,0 | — | 10/0 | **0** | 20 / 90 | Alioth |
| **2** | **V0** | **0,0** | **beyond 19,8** | 0/0 | 0 | 0 / 0 | — |
| 2 | A / B | 10,0 | — | 10/0 | 0 | 20 / 90 | Alioth |
| **3** | **V0** | **0,0** | **beyond 19,8** | 0/0 | 0 | 0 / 0 | — |
| 3 | **A** | 10,0 | — | 10/0 | 0 | 20 / 90 | **Średni** |
| 3 | **B** | 10,0 | — | 10/0 | 0 | 20 / 90 | **Alioth** |

**Cztery odczyty:**
1. **V0 jest CAŁKOWICIE bierne — 0 uderzeń, 19,8 odmów, przy KAŻDEJ puli.** Scenariusz z live-gate'u
   odtworzony co do kształtu.
2. **A i B są nierozróżnialne przy puli 1-2**; rozjeżdżają się dopiero przy 3, gdy AI stać na cel
   średniej wartości. To jedyny punkt separacji.
3. ⚠ **Ani A, ani B nie wskrzeszają pompy wyczerpania z Findingu 34**: `kadłuby AI = 0`,
   `AI przegranych = 0` przy każdej puli — obie wybierają wyłącznie to, na co je stać, a
   `SQUADRON_HP_RATIO 1.5` gwarantuje wygraną. **Fall-through nie kupuje aktywności samobójstwami.**
4. Wyczerpanie gracza 90/100 lat w obu — koszt tego, że AI w ogóle działa, nie różnica wariantów.

### 2.2 Wymóg (1) — „czy fall-through robi z AI maszynę bijącą w najsłabsze ciało?"

- **B: TAK.** Alioth przy puli 1, 2 **i** 3 — cel nie zmienia się nigdy, niezależnie od siły imperium.
  To ta sama przewidywalność, którą commit 2 wyrzucił z booleana, wracająca innymi drzwiami.
- **A: NIE.** Alioth (pula 1-2) → **Średni** (pula 3) → **Placówka** (pula 3, fixture 4-celowy).
  **Cel ESKALUJE wraz z siłą** — jest sygnałem o imperium, nie stałą.

⚠ **„Przewidywalność po ziarnach" NIE DYSKRYMINUJE — i to jest wynik, nie porażka pomiaru.**
Wybór celu jest **deterministyczny z projektu** (`pickTarget`: *„los jest w RZUCIE reguły, nie
w wyborze celu — inaczej ten sam zapis dawałby po wczytaniu inny cel"*). ZMIERZONE: identyczny cel
na wszystkich czterech ziarnach, dla **V0, A i B**. Sensowny zamiennik to pytanie użyte wyżej:
**czy cel śledzi stan świata (siłę puli)** — A śledzi, B nie.

### 2.3 Wymóg (2) — „czy 210 domyka się bez 202?"

**Domyka się — ale czyni 202 wiążącym.** Fixture z gołą placówką w bogatym układzie:

| ciało | wartość | HP | `needed` | |
|---|---|---|---|---|
| **Placówka** | **227** | 240 | **3** | goła placówka; dziedziczy flotę układu (V4: okręty systemowe) |
| Stolica | 227 | 740 | 10 | |
| Średni | 100 | 180 | 3 | **prawdziwa kolonia** |
| Alioth | 50 | 30 | 1 | |

`pula 3 → V0: Placówka · A: Placówka · B: Alioth`

**A przy RÓWNYM koszcie (3 = 3) wybiera Placówkę zamiast Średniego, bo 227 > 100** — a te 227 to
`getSystemDevScore` **UKŁADU**, nie wartość tego ciała. To jest 202 w czystej postaci. Nie jest to
bez sensu (uderzenie w rdzeń wroga ma wartość strategiczną), ale **liczba, która o tym decyduje, nie
opisuje celu**. ⇒ 210 zamyka się samodzielnie; po nim **202 przestaje być ciekawostką i staje się
następną widoczną dystorsją** (D-210-6).

---

## 3. Kształt naprawy (D-210-1 = A, D-210-2)

NEW `pickAttainableTarget(empireId, ready)` — **jedna funkcja licząca**, z której korzystają
**i porządek, i próg osiągalności**:

```
ranked = reachableTargets → { value, defended, needed: requiredSquadron(c, ready).needed }
         sort: value DESC, needed ASC, body.id            ← ten sam porządek co dziś
cap    = min(ready.length, MAX_STRIKE_SIZE)
pick   = ranked.find(t => t.needed <= cap)                ← fall-through, bez limitu (D-210-4)
→ { pick, head: ranked[0], ranked }
```

⚠ **§6.3 WCIĄGNIĘTE W SYGNATURĘ (poprawka właściciela).** `ready` jest **argumentem**, więc `needed`
liczy się z **REALNEJ puli** i dla progu, i dla porządku — **jedną funkcją**. Dziś `pickTarget` liczy
`needed` bez puli (fallback `STRIKE_HULL_HP_FALLBACK`), a decyzja z puli: dwie liczby z dwóch źródeł.
Porządek jest wprawdzie niewrażliwy na `perShipHp` (wspólny dzielnik), ale **próg osiągalności już
nie** — a raport i decyzja nie mają prawa się rozjechać (lekcja D-199-7).

`pickTarget(empireId)` **ZOSTAJE bez zmian** — odpowiada na inne pytanie („czego AI najbardziej
chce") i jest tym, co pokazuje raport jako **głowę**.

---

## 4. ⚠ KONTRAKT DRABINY — TRZY STANY TERMINALNE (poprawka właściciela, pinowana)

| stan | kiedy | co leci | warunek NIEJAŁOWOŚCI pinu |
|---|---|---|---|
| **(a) start bez pominięcia** | głowa była osiągalna (`pick === head`) | `director:strikeLaunched` z `skippedHead: null` | assert, że lista miała **≥ 2** cele — inaczej „brak pominięcia" jest prawdą trywialną |
| **(b) start z pominięciem** | `pick !== head` | `strikeLaunched` z **`skippedHead: {bodyId, systemId, needed, defenderHp}`** | assert, że `head.needed > cap` **i** `pick.needed <= cap` — czyli że pominięcie było KONIECZNE |
| **(c) pełna odmowa** | fall-through wyczerpał listę | **`director:strikeRefused` z `{needed, defenderHp}` GŁOWY** + `attemptedTargets` | assert, że lista miała **≥ 2** cele i **żaden** się nie zmieścił |

⚠ **(c) NIE MOŻE ZAMILKNĄĆ — to jest cała treść tej poprawki.** Stan „wszystko jest twierdzą" jest
**dzisiejszym zachowaniem na żywo** (live-gate DEFENSE_SCOPE §7.3/§7.4) i po naprawie musi dalej być
**słyszalny**. Lekcja **Findingu 196**: zdarzenia są jedynym kanałem audytu, a `director:strikeRefused`
to JEDYNE wejście, z którego widać, dlaczego ofensywa AI stoi. Cicha odmowa zamieniłaby defekt
w niewidzialność.

**Klasyfikacja powodu w (c)** zachowuje rozróżnienie strukturalne/przejściowe z D-199-7, ale liczone
**na całej liście**, nie na głowie:
- **jakikolwiek** cel ma `needed <= MAX_STRIKE_SIZE` ⇒ `insufficient_squadron` (**przejściowy** —
  więcej okrętów pomoże);
- **żaden** ⇒ `target_beyond_reach` (**strukturalny** — nawet pełny sufit nie wystarczy).

⚠ Liczby w ładunku pochodzą z **GŁOWY** (wymóg właściciela), a klasyfikacja z **listy** — i to nie
jest niespójność, tylko dwie różne informacje: *„czego nie zdobyłem"* i *„czy warto czekać na okręty"*.
`attemptedTargets` odróżnia „jeden cel, ponad zasięg" od „pięć celów, wszystkie ponad zasięg".

---

## 5. Czego naprawa NIE rusza

`reachableTargets` · `targetValue` (D-210-6) · `requiredSquadron` (matematyka bez zmian) ·
`SQUADRON_HP_RATIO` · `_playerVesselsInSystem` · zakres obrony z V4 · format zapisu.

---

## 6. Keeper — `defense_scope_smoke.mjs`, rozszerzenie (T19-T23)

⚠ **Ten sam plik, nie nowy** — 210 jest odsłonięte przez ten sam slice i chodzi pod tą samą flagą.

| pin | asertuje | NIEJAŁOWOŚĆ | kontrola pinu |
|---|---|---|---|
| **T19** SEDNO | głowa ponad sufit + cel osiągalny dalej na liście ⇒ **uderzenie RUSZA** | assert `head.needed > cap` **i** `pick.needed <= cap` (bez tego pin przechodzi dla implementacji bez fall-through) | ta sama lista przy fladze OFF ⇒ odmowa (dzisiejsze zachowanie) |
| **T20** stan (b) | `skippedHead` **wypełniony** i nazywa GŁOWĘ, nie cel | assert `skippedHead.bodyId !== pick.bodyId` | stan (a): głowa osiągalna ⇒ `skippedHead === null`, przy liście ≥ 2 |
| **T21** stan (c) NIE MILCZY | wszystkie cele ponad sufit ⇒ `strikeRefused` z `needed`/`defenderHp` **GŁOWY** + `attemptedTargets` | assert, że celów było **≥ 2** i żaden się nie zmieścił | jeden cel osiągalny ⇒ zdarzenie **NIE** leci |
| **T22** klasyfikacja (c) | „jakiś ≤ sufit" ⇒ `insufficient_squadron`; „żaden" ⇒ `target_beyond_reach` | assert, że obie konfiguracje dają **RÓŻNE** powody | — |
| **T23** jedna funkcja licząca | `pickAttainableTarget` liczy `needed` z **przekazanej puli** (inna pula ⇒ inny wynik progu) | assert, że dwie pule dają **różny** `pick` na tym samym świecie | pin źródłowy: `ready` jest argumentem, nie odczytem z locatora |

**Regresja:** `w3_target_selection` (T4 — jeden cel, więc fall-through wyczerpuje listę ⇒ ten sam
powód i te same liczby) · `defense_scope` T9/T10 (oba ciała ufortyfikowane ⇒ stan (c)) · T18
(`pickTarget` nietknięte) · `ai_strike_recall` · `vo3b_order_clear` · `w3_attack_dispatch`.

---

## 7. GATE (LIVE) — na REALNYM zapisie właściciela

Protokół krok po kroku jak w `DEFENSE_SCOPE_PLAN.md` §7. **CC nie pisze plików w trakcie gate'u.**

**§8.0 — przygotowanie** (identyczne jak DEFENSE_SCOPE §7.0): `strikeReport` → `ukladMacierzysty`;
zasiew `spawnEnemyRaider({empireId, systemId: SYS_AI, autoOrder: false})`; **odczyt puli przed
każdym `forceStrike`**; **odczyt tabeli celów**.

**§8.1 — SEDNO: uderzenie rusza tam, gdzie dotąd była odmowa.**
```js
KOSMOS.directorOffensive.strikeReadyVessels('emp_001').map(v => v.name)   // pula — zawsze
KOSMOS.debug.forceStrike('emp_001')
```
**PASS** = `{ launched: 1, targetBodyId: <Colony Alioth> }` **oraz** `skippedHead` nazywające głowę
z `sys_home` z jej `needed`. **FAIL** = `target_beyond_reach` (fall-through nie działa).
⚠ To jest **dokładnie ta sama komenda, która na live-gate'cie DEFENSE_SCOPE zwróciła
`{launched: 0, reason: 'target_beyond_reach', needed: 9}`** — różnica w odpowiedzi JEST wynikiem.

**§8.2 — raport pokazuje OBA cele.** `KOSMOS.debug.strikeReport('emp_001')`
**PASS** = `cel` (osiągalny, Alioth) **i** `celGlowa` (sys_home, `needed 9`) — raport nie kłamie
o tym, w co AI uderzy.

**§8.3 — stan (c) dalej słyszalny.** Ufortyfikuj/zabierz cele tak, by **żaden** wiersz tabeli nie
mieścił się w suficie, potem `forceStrike`.
**PASS** = `{launched: 0, reason: 'target_beyond_reach', needed: <głowy>, attemptedTargets: N>1}`.
**FAIL** = cisza (Finding 196: brak zdarzenia = brak audytu).

**§8.4 — kill-switch.** `KOSMOS.gameConfig.FEATURES.defenseScope = false` → `forceStrike`
**PASS** = wraca **dzisiejsza odmowa na głowie** (`target_beyond_reach`, `needed 9`), bez fall-through.
Przełącz z powrotem na `true` → uderzenie znów rusza. Bez przeładowania.
⚠ Uchwyt to `KOSMOS.gameConfig`, **nie** `GAME_CONFIG` — ten błąd złapał już dwa gate'y (Z2 `f021ccf`
i DEFENSE_SCOPE §7.7).

**§8.5 — Dziennik i konsola.** Jedna linia `⚔` po bitwie, auto-slow, zero błędów w konsoli.

---

## 8. Świadomie poza zakresem

**202** (`targetValue` per-UKŁAD rankuje cele per-CIAŁO) — **zapisane jako NASTĘPNA dystorsja**
(D-210-6): po 210 AI będzie preferować gołą placówkę w bogatym układzie nad prawdziwą kolonią
w średnim, przy równym koszcie. ZMIERZONE (§2.3). · **208** (produkcja okrętów AI, warunek wstępny
**178**) — następny w kolejce właściciela. · **154**.

---

## 9. Odnośniki

`VESSEL_ORDERS_PLAN.md` §210 (rejestr macierzysty) · `DEFENSE_SCOPE_PLAN.md` (slice, który 210
odsłonił; §10a wynik live-gate'u) · `OPEN_FINDINGS_INDEX.md` · `AI_RECALL_PLAN.md` (instrument tempa).
