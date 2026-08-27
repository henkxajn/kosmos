# NARRACJA BITWY — Findingi 150 + 155 (save v101 bez migracji)

> **Status:** PODPISANY 2026-08-27 (D1-D6 = W1). Slice przekrojowy, **NIE należy** do
> VESSEL_ORDERS (P0-P5 zostaje osobnym, podpisanym planem).
> **Rejestr macierzysty findingów:** `docs/design/VESSEL_ORDERS_PLAN.md` §Findings 150-155.
> Tu mieszka wyłącznie kształt naprawy, pomiar i gate.

---

## 1. Jedno zdanie

Gra **ogłasza jedną bitwę dwa razy** (150) i **odczytuje zwycięzcę z kolejności ról wojny
zamiast z uczestników** (155) — pierwsze zwielokrotnia meldunki i realne skutki, drugie je
odwraca; razem dają graczowi cztery linie o jednej walce, z których część kłamie o tym, kto
wygrał.

---

## 2. Pomiar wejściowy (przed kodem)

### 2.1 Korekta rejestru — kiedy 150 jest osiągalne

Wpis 150 mówi „przy zadeklarowanej wojnie". **Zmierzone w źródle — to prawda tylko dla
JEDNEGO producenta:**

| producent | ścieżka | emisji |
|---|---|---|
| **DSCS** `_finalizeBattle:1068` | emituje sam (`warId:null`) → `WarSystem._classifyBattle:198` widzi `status==='war'` → `recordBattle` → **emituje ponownie** `:314` | **2** |
| **VCS** `:348` (uśpiony flagą) | znakowo to samo | **2** |
| **EnemyAttackHandler** `:205` | gałąź wojenna woła `recordBattle` **wprost** (W1-4) — jedno ogłoszenie; gałąź bez wojny emituje sama `:228` → potyczka, bez re-emitu | **1** |
| `WarSystem.forceBattle:388`, `_fleetArrived:522` | wywołanie wprost | **1** |

**Warunek osiągalności: bitwa DSCS/VCS + zadeklarowana wojna + gracz po jednej ze stron.**
To rozstrzyga rozbieżność obserwacji z gate'u B2: rajdery (EAH) dały **jedną, wewnętrznie
sprzeczną** linijkę (155), a walka w głębokim kosmosie **dwie sprzeczne** (150 + 155).

### 2.2 Inwentarz szkody 150 — per konsument

⚠ To było brakujące pytanie rejestru („NIEZMIERZONE: którzy konsumenci są idempotentni").

| konsument | idempotentny? | skutek drugiego przebiegu |
|---|---|---|
| `WarSystem._classifyBattle` | ✅ `if (warId) return` | — |
| `ProximitySystem` / `VesselCombatSystem` | ✅ `Map.delete` | — |
| `ThreeRenderer._onBattleResolvedFx` | ⚪ nieidempotentny, ale wychodzi na `loc.point` | — |
| `InvasionSystem` | ⚪ wychodzi na `pB.type !== 'player'` | — **dziś**; patrz Z2 |
| **`AutoRetreatSystem`** | 🔴 **NIE** | drugi rozkaz odwrotu tym samym statkom; `_issueMoveToPoint:924` pobiera paliwo **przy wydaniu**, preempcja kasuje pierwszy ⇒ **podwójna opłata paliwowa** + drugi `vessel:autoRetreatIssued` ⇒ druga linia w Dzienniku |
| **`GameScene:2383`** (Dziennik) | 🔴 NIE | **2 wpisy, dwa schematy etykiet** — jeden poprawny, jeden odwrócony |
| **`GameScene:2324`** (kolejka kina) | 🔴 NIE — `_battleQueue` **nie deduplikuje po `battleId`** | wpis #1 → baner; wpis #2 → **modal „ENGAGEMENT IMMINENT"** (`getBattleViewPreference()` domyślnie `'ask'`, modal **pauzuje grę**) ⇒ duplikat łamie decyzję Slice 1 („deep-space = baner, nie kino") |
| **`UIManager:1353`** | 🔴 NIE | 2 kolejne linie z **różnymi `battleId`** + podwójny auto-slow |
| `VesselManager:143` | ⚪ nadpisanie | `lastBattleId` = id wojenne zamiast `battle_ds_*` (oba rekordy istnieją) |
| `DebugLog` | 🔴 NIE | 2 wpisy w audycie AI |

**Netto przy jednej bitwie DSCS w wojnie: 4 linie w Dzienniku, jedno pauzujące okno kina
wbrew projektowi, podwójne paliwo AI za odwrót.**

### 2.3 Mechanizm 155

`GameScene:2398-2402` (ścieżka A, brana **zawsze gdy `warId` jest ustawione**) mapuje literę
wyniku na nazwy z **rekordu wojny** (`war.aggressor === 'player' ? 'Gracz' : …`). Zakłada
`A = agresor`, czego **nic nie gwarantuje**: `recordBattle:283-284` kopiuje `participantA/B`
dosłownie, a `EnemyAttackHandler:172-186` **zawsze** stawia wroga jako `A`. ⇒ gdy graczem jest
agresor wojny, **wygrana gracza jest raportowana jako zwycięstwo wroga**.

Drugi wariant: `playerSide = result.participantB?.type === 'player' ? 'B' : 'A'` **degeneruje
się do `'A'`** dla bitew DSCS/VCS (obaj uczestnicy to `vessel_group`) — osiągalny wyłącznie
przez duplikat z 150, więc **naprawa 150 usuwa go całkowicie**.

✅ **Stan gry nietknięty** — `_battleLoserSide:255-265` rozstrzyga po `empireId` i zwraca
`null`, gdy nie umie zmapować. Kłamie wyłącznie warstwa narracji.

---

## 3. Decyzje (podpisane 2026-08-27)

| # | decyzja | wybór |
|---|---|---|
| **D1** | naprawa 150 w `_classifyBattle` (`announce:false`), **nie u producentów** | **W1** |
| **D2** | przyjmujemy Z2 (ogłoszenie sprzed księgowania dla DSCS) + **pin, który się ZAPALI** | **W1** |
| **D3** | i18n linii Dziennika **w tym samym commicie** co 155 | **W1** |
| **D4** | `retreatNote` tylko gdy `playerInvolved && playerSide` | **W1** |
| **D5** | kanon: `WarSystem._hasPlayerSide` deleguje do `isPlayerParticipant`; `_battleLoserSide` **nietknięte** | **W1** |
| **D6** | kolejność: **150 → 155 → docs** | **W1** |

---

## 4. Kształt naprawy 150 — jeden szew, nie N producentów

Lekcja z `131cc2e` („guard u jednego producenta nie jest guardem systemu"), odwrócona:
**nie łatamy DSCS i VCS z osobna — łatamy jedyne miejsce, przez które przechodzą obaj.**

```js
// WarSystem._classifyBattle — gałąź (b), JEDYNE wejście re-entrantne
const war = this.getWarWith(empireId);
if (war) this.recordBattle(war.id, result, { announce: false });   // producent JUŻ ogłosił
return;

// WarSystem.recordBattle — domyślnie ogłasza (EAH / forceBattle / _fleetArrived bez zmian)
recordBattle(warId, result, opts = {}) {
  …
  this._updateOrbitalDominance(battleRec);
  if (opts.announce !== false) EventBus.emit('battle:resolved', { warId, battleId, result: battleRec });
  return battleRec;
}
```

Księgowanie (exhaustion, `war.battles[]`, dominacja) **nietknięte** — zmienia się wyłącznie
liczba ogłoszeń. VCS objęty z urzędu.

**Rozważony i ODRZUCONY wariant `concludeBattle`** (DSCS przestaje emitować, ogłasza księgowy):
architektonicznie czystszy — jedno ogłoszenie ZAWSZE po domknięciu ksiąg, z prawdziwym `warId` —
ale przenosi bitwy DSCS na ścieżkę A, więc tracą `source:'dscs'` i **zaczynają otwierać modal
kina**. Naprawiając duplikat, wprowadzalibyśmy jego najgorszy objaw jako stałą.

---

## 5. Kształt naprawy 155 — jedna funkcja, cztery call-site'y

**Tożsamość stron pochodzi z UCZESTNIKA, nigdy z kolejności ról wojny.** Wzorzec jest w repo
trzykrotnie (`GameScene` ścieżka B, `_battleLoserSide`, `_hasPlayerSide`) — wyciągamy go do kanonu.

NEW `src/utils/BattleSides.js` — czysty, **bez importu i18n** (patrz Z11):

```
isPlayerParticipant(p)     // p.empireId === 'player' || p.type === 'player'  ← OBA kształty (W3-7)
resolveBattleSides(result, { registry, playerLabel, unknownLabel })
  → { playerSide: 'A'|'B'|null, playerInvolved, sideAName, sideBName, foeEmpireId, foeArchetype }
```

**Reguła braku:** gdy żadnej strony nie da się zmapować na gracza → `playerSide: null` i **nie
zgadujemy** (dokładnie jak `_battleLoserSide` zwraca `null`, zamiast przypisywać karę losowo).
Linia w Dzienniku powstaje, ale bez atrybucji „Gracz/Wróg" i z neutralną wagą.

| linia `GameScene` | dziś | po |
|---|---|---|
| `2337` | `participantB?.type==='player' ? 'B':'A'` → degeneruje do `'A'` | `sides.playerSide` |
| `2343-2344` | `war.aggressor==='player' ? 'Gracz' : …` | `sides.sideAName/sideBName` |
| `2358-2367` (B) | własna kopia matematyki | ta sama funkcja |
| `2398-2401` | jw. — **linia z gate'u B2** | `sides.*` |
| `2410-2416` (B) | własna kopia | ta sama funkcja |
| `2435-2436` | „Wróg wycofał się" nawet bez gracza w bitwie | bramka `playerInvolved && playerSide` (D4) |

⚠ **Rozgałęzienie `if (warId)` ZOSTAJE** — po naprawie decyduje już tylko o *prezentacji*
(`sysLabel`, `source:'dscs'` → baner vs kino), nie o tożsamości. Zwijanie go = zmiana tego,
które bitwy dostają kino. Poza zakresem.

⚠ `BattleIntroModal` wyświetla te nazwy pod nagłówkami „AGRESOR"/„OBROŃCA" (`:130,139`), a
strony A/B **nie są** agresorem/obrońcą wojny. Po naprawie pola znaczą „strona A/strona B" —
tak, jak już dziś używa ich ścieżka B. Werdykt modalu (`winner === playerSide`) **staje się
poprawny**; nagłówki kolumn zostają jako obserwacja (Finding 158).

---

## 6. Zastrzeżenia Z-klasy

**Z1 — keeper pinuje defekt (wymuszone).** `w3_battle_booking_smoke.mjs` **T4** asertuje
`withWar.length === 1` **i** `withoutWar.length === 1` pod nagłówkiem „brak re-entrancji": dowodzi
braku **pętli** i przy okazji pinuje **podwójne ogłoszenie jako poprawne**. Odwracamy wzorem
`retreat_preempt` T4 / `deploy_seams` T1-T4: powód w nagłówku, inwariant, który przeżywa
(`war.battles` +1, `recordBattle` dokładnie raz) zostaje **jako kontrola pinu**.
`w3_seams_smoke` T2 (`resolved.length > 0`, `recordBattleCalls === 1`) i `war_seams_smoke` T6
sprawdzone — **przechodzą bez zmian**.

**Z2 — odwraca się kolejność „księgowy przemawia po domknięciu ksiąg" (W3-6b). PODPISANE D2.**
⚠ **KOREKTA PO POMIARZE (2026-08-27) — ryzyko jest MNIEJSZE, niż zakładał audyt, ale opiera się na
niezapisanym dotąd kontrakcie.** `EventBus.emit` jest **synchroniczny i idzie w kolejności
rejestracji** (`EventBus.js:31`), a `WarSystem` powstaje **przed** `InvasionSystem`
(`GameScene.js:318/319`, headless `GameCore:197/198`). `_classifyBattle` → `recordBattle` →
`_updateOrbitalDominance` domyka się więc **wewnątrz tego samego emitu**, zanim zdarzenie dojdzie
do kolejnych subskrybentów. **Zmierzone wykonaniem** (keeper T7a): sonda zarejestrowana za
`WarSystem` widzi dominację **już zaksięgowaną**. Nie ma zatem regresji „stale world" — jest
**kontrakt POZYCYJNY**, którego nikt wcześniej nie zapisał.
Druga warstwa bezpieczeństwa: bramka desantu (`InvasionSystem:189`) i tak wychodzi natychmiast na
kształcie DSCS (obie strony `vessel_group`). Staje się miną dopiero w kierunku Findingów 49/50
(produkcyjny desant AI).
⚠ **Wymóg podpisu D2: pin ma się ZAPALIĆ, nie tylko opisać.** Realizacja — keeper T7:
mierzy kolejność **wykonaniem** (dominacja stale w chwili ogłoszenia, ustawiona po nim),
asertuje **zero zdarzeń `invasion:*`** z bitwy o kształcie DSCS i ma **kontrolę pinu** na
kształcie EAH (ten sam listener REAGUJE). Gdy ktokolwiek udrożni desant AI z bitwy DSCS —
`_onVesselGroupVictory` przejdzie dalej, odczyta stale dominację i wyemituje `invasion:blocked`
⇒ **T7 pada** i zmusza do rozstrzygnięcia kolejności.

**Z3 — ogłoszenie będzie mówić `warId: null` o bitwie zaksięgowanej w wojnie.** Informacja nie
ginie (`war.battles[]` + rekord), ale event jej nie niesie. Konsumentów `warId` w ładunku jest
**dokładnie trzech** (dwa listenery `GameScene` + guard `_classifyBattle`) i wszyscy trzej
wychodzą na tym lepiej. Świadomy limit.

**Z11 — `GameScene.js` nie importuje się pod node.** Stąd: matematyka w **czystym module**
(pin **wykonaniowy**), a wpięcie pinowane **źródłowo, z rozbieranymi komentarzami + kontrolą
pinu**. Dlatego helper **nie woła `t()`**, tylko przyjmuje etykiety parametrem — inaczej keeper
przestaje się wykonywać, a `check-i18n` czyta `t()` w całym `src/`.

---

## 7. Plan wykonania

1. **Pomiar fail-first** — uprząż istnieje: `w3_battle_booking_smoke` ma `boot()` +
   `deepSpaceBattle()` odpalające **prawdziwe** `_finalizeBattle`.
2. **C1 (150 + D5)** — edycja §4 + NEW `battle_announce_once_smoke.mjs` + odwrócenie
   `w3_battle_booking` T4 + delegacja `_hasPlayerSide` (D5).
   ⚠ **`src/utils/BattleSides.js` WCHODZI DO C1, nie do C2** — decyzja właściciela z 2026-08-27
   („D5 dołóż do C1, ten sam plik") pociąga tę konsekwencję: D5 **importuje** kanon, więc bez
   modułu C1 byłby commitem importującym nieistniejący plik. Atomowość znaczy „każdy commit stoi
   sam", nie „każdy commit jest mały".
   **Zweryfikowane WYKONANIEM** (C2 tymczasowo cofnięte, sweep uruchomiony na samym C1):
   **175/175 OK, 0 FAIL**, `check-i18n` PASS (pl=en=**3272** — bez siedmiu kluczy D3, które
   dochodzą dopiero w C2). Stan pełny po przywróceniu: 176/176, pl=en=3279.
3. **C2 (155)** — `GameScene.js` (oba listenery) + i18n PL/EN (D3) + keeper `battle_sides_smoke`
   (wykonanie dla kanonu + pin źródłowy wpięcia w scenę).
4. **C3** — docs: `CLAUDE.md`, zamknięcie 150/155 w rejestrze macierzystym, wpisy 156-158.

---

## 8. Gate (live, właściciel)

⚠ **Hook językowo neutralny** — właściciel gra po EN, więc filtr nie może opierać się na
polskim tekście. Prefiks `⚔` zostaje w OBU językach właśnie po to.

- **§1 (150)** — bitwa deep-space w zadeklarowanej wojnie: linie kanału `combat` **4 → 2**,
  **brak** okna „ENGAGEMENT IMMINENT" po walce w głębokim kosmosie.
- **§2 (155)** — gracz **agresorem** wojny + `spawnEnemyAttack` na stolicę: Dziennik mówi, że
  **gracz wygrał**, waga zielona zamiast czerwonej, brak zdania sprzecznego z adnotacją o odwrocie.
- **§3** — odwrót AI: jedna linia zamiast dwóch; paliwo pobrane raz.

One-linery gate'u **walidowane wykonaniem** przed przekazaniem checklisty (reguła
`validate-gate-oneliners-on-live-engine`).

---

## 9. Findings filed (rejestr macierzysty)

- **156** — po naprawie w `gameState.battles` **nadal zostają DWA rekordy** jednej bitwy
  DSCS-w-wojnie (`battle_ds_*` z DSCS `:1067` + `battle_<rok>_<war>_<n>` z `recordBattle`),
  o **niepowiązanych id**, i to trafia do zapisu. Naprawa dotyka treści zapisu ⇒ osobna decyzja.
- **157** — `UIManager:1356` filtruje `type === 'vessel_group' && empireId === 'player'` ⇒ bitwy
  obrony orbitalnej (EAH, kształt `type:'player'`) **nigdy** nie dostają linii zwycięstwo/porażka
  ani auto-slow z tego konsumenta. W3-7 dostemplował `empireId`, ale predykat pyta **też** o `type`.
  Naprawa = **dodanie** linii (zmiana zachowania) ⇒ poza zakresem.
- **158** — `BattleIntroModal` ma zahardkodowany polski (`AGRESOR`/`OBROŃCA`/`ZWYCIĘSTWO`).
  Rodzina Findingu 113; `check-i18n` tego nie widzi. Linia Dziennika zamknięta przez D3.

---

## 10. WYKONANIE (2026-08-27) — pomiar fail-first i wynik

### 10.1 Pomiar PRZED naprawą (keeper `battle_announce_once_smoke`, fail-first)

**15 PASS / 4 FAIL.** Zmierzone, nie wywnioskowane:

| pomiar | przed | po |
|---|---|---|
| ogłoszeń `battle:resolved` na jedną bitwę DSCS-w-wojnie | **2** | **1** |
| rozkazów odwrotu dla jednego uciekiniera | **2** | **1** |
| paliwo spalone na jedną ucieczkę | **0,817** przy koszcie kursu **0,409** ⇒ **×2,0** | 1 kurs |
| rekordy w `gameState.battles` | 2 (`battle_ds_*` + `battle_<rok>_<war>_<n>`) | 2 — **Finding 156, otwarty** |

Po naprawie keeper: **19 PASS / 0 FAIL**.

### 10.2 ⚠ ODKRYCIE, KTÓREGO AUDYT NIE PRZEWIDZIAŁ — kolejność duplikatu

Zagnieżdżony emit domyka się **w całości**, zanim zewnętrzna pętla `forEach` dojdzie do kolejnego
subskrybenta. Zmierzone: kolektor zarejestrowany za `WarSystem` dostawał **jako pierwszy** ładunek
z `warId` (ten z zepsutymi etykietami), a dopiero potem oryginalny z `warId: null`.
⇒ **w Dzienniku BŁĘDNA linia pojawiała się PRZED poprawną.** To domyka obserwację właściciela
o „dwóch sprzecznych linijkach" — kolejność nie była przypadkowa.

### 10.3 ⚠ LEKCJA Z WŁASNEGO BŁĘDU — próg, który nie mierzył niczego

Pierwsza wersja pinu paliwowego asertowała „spalone ≤ **połowa baku**" i **PRZESZŁA na
niepoprawionym kodzie** (0,82 z 25,00 przy DWÓCH rozkazach), bo kurs odwrotu jest o rzędy wielkości
tańszy niż bak. Pin porównuje teraz z **kosztem jednego kursu** (`mission.fuelCost`) i pokazuje
stosunek 2,0. **Próg dobrany do niewłaściwej skali to fałszywa zieleń** — ta sama klasa co pin
celujący w martwą ścieżkę.

### 10.4 Naprawa środowiska headless (poza zakresem slice'u, bez commita)

Suita **nie dawała się uruchomić w ogóle**: `node_modules/` zniknęło z tej maszyny, a łańcuch
`GameCore → GroundUnitManager → GroundUnitFactory → GlbSnapshotRenderer` importuje `three`, które
**nie jest zależnością produkcyjną** (gra bierze Three.js z CDN). Odtworzony został **udokumentowany**
stub (`0.0.0-headless-stub`, wystawia tylko `.` i `GLTFLoader` — `COLONY_OWNERSHIP_GUARD_PLAN`
§Dyscypliny 2). ⚠ **Granica dowodu zachowana i zweryfikowana**: stub nadal **nie** eksportuje
`TextureLoader`, więc `ColonyOverlay`/`GameScene` dalej **nie importują się** pod node
(`THREE.TextureLoader is not a constructor`) — poszerzenie stuba dałoby zieleń wyłącznie na jednej
maszynie. `node_modules/` jest gitignorowane ⇒ **nie wchodzi do żadnego commita**.

### 10.5 Testy

| suita | wynik |
|---|---|
| `battle_announce_once_smoke` (NEW) | **19/19** |
| `battle_sides_smoke` (NEW) | **35/35** |
| `w3_battle_booking_smoke` (T4 odwrócony) | **20/20** |
| sweep `run-all.mjs` | **176/176 OK, 0 FAIL** |
| `check-i18n` | **PASS** (pl=en=3279) |

⚠ **Wszystkie sześć pinów źródłowych T6 zweryfikowano na kodzie SPRZED naprawy** (`git show HEAD`):
każdy z nich by tam padł. Pin bez takiej kontroli byłby zgadywaniem.

### 10.6 One-liner gate'u — zwalidowany wykonaniem

```js
KOSMOS.eventLogSystem.getEntries({ channels: ['combat'] }).filter(e => e.text.includes('⚔')).length
```
Uruchomiony na żywym silniku headless: jedna bitwa ⇒ **1**. Filtr po znaku `⚔` i kanale, **nie po
polskim tekście** — właściciel gra po EN (reguła `gate-filters-language-agnostic`).

---

## 11. Świadomie poza zakresem

`_findNearestFriendlyPlanet` (F154) · `ProximitySystem:187` (F151) · routing prezentacji
baner/kino · pełne i18n `BattleIntroModal` (158) · filtr `UIManager` (157) · drugi rekord
w zapisie (156) · `_battleLoserSide`.
