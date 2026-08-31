# Findingi 199 + 200 — „AI atakuje to, czego nie jest w stanie zdobyć"

> **Status:** ✅ **ARC ZAMKNIĘTY 2026-08-31 — LIVE-GATE §7 PASS z udokumentowanymi odstępstwami (§10a).**
> Podpis właściciela: **D-199-1 = W1
> Z POPRAWKĄ** (bez clampa → własny powód odmowy) · **D-199-5 = W2** (poza zakresem → Finding 202,
> z potwierdzonym warunkiem sortowania) · **D-199-6 = 6a + 6b RAZEM** (ponowny podpis po §4.1) ·
> **D-199-7 = W1** · **D-199-8 = W1** · **D-199-2 = V4** (budynki CIAŁO, okręty UKŁAD) ·
> **D-199-3 i D-199-4 ROZPUSZCZONE przez V4** (findingi 203 i 206 domykają się z commitem 3).
> Save **v101, zero migracji** (zakres liczony w czasie bitwy, nic nowego nie persystuje).
> **Commity:** `90978a2` (plan) · `792a034` (C1 — D-199-6) · `b2e94ef` (C2 — D-199-1/7/8) · C3 (D-199-2 = V4).
> Keeper `defense_scope_smoke` **50/50** · sweep **193/193 0 FAIL** · `check-i18n` PASS.
> ⚠ Kill-switch: `GAME_CONFIG.FEATURES.defenseScope` (ON). Dowód flipa — §11 (**czwórka**, nie para).
> **Rejestr macierzysty:** `docs/design/VESSEL_ORDERS_PLAN.md` §Findings 199 · 200 (oba otwarte).
> Sondy pomiarowe: scratchpad, **poza repo** (`probe-199-base.mjs`, `probe-199-tempo.mjs`,
> `probe-199-v4.mjs`, `probe-200-freeweapon.mjs`) — wszystkie liczby niżej pochodzą z ich wyjścia.

---

## 0. Reguła wejścia — co uruchomiłem PRZED audytem i co to zmieniło

`git log -S` na trzech site'ach + `git log -S "isDefended"` + ponowne uruchomienie sondy 199
z sesji Z2 + `w3_target_selection_smoke` / `deploy_seams_smoke` / `w2_deploy_model_smoke`.

| pytanie z reguły wejścia | odpowiedź |
|---|---|
| `_playerColoniesInSystem` / `_playerVesselsInSystem` | **po jednym commicie**: `cb815cd` (W3-4b). Oba helpery zostały tam **wydzielone**, nie napisane — systemowa matematyka siedziała wcześniej wewnątrz `_buildPlayerBattleUnit` (`347a64d`, Fazy 0-7). |
| `_buildPlayerBattleUnit` | 5 commitów: `347a64d` (narodziny) · `61756be` · `7f606b7`/`c4526b6` (filtr rezerwy W2) · `cb815cd` (W3-4b). |
| `isDefended` | **jeden commit: `07c1087` (W3-5)** — powstał razem z regułą celu i **nigdy nie był zmieniany**. |
| **co naprawdę wylądowało w W3-5 / §Findings 34** | Finding 34 mówił: *„samotny rajder nie skruszy bronionej kolonii ⇒ preferuj eskadrę (2+)"*. W3-5 dowiózł **dokładnie i wyłącznie to**: `SQUADRON_VS_DEFENDED = 2` + `insufficient_squadron` jako pierwszoklasowy powód odmowy. **Zakresu nie tknął.** |
| **czy stoi już jakaś częściowa bramka** | **TAK — i zlecenie ją zaniża.** Patrz §1, sprostowanie 1. |

**Czy ten sam skutek zmierzono dwa razy pod dwiema przyczynami — TAK, i przyczyny są rozłączne.**
Przyczyną Findingu 34 był **rozmiar eskadry** (1 rajder przeciw czemukolwiek bronionemu). Przyczyną
199 jest **rozjazd zakresu** (cel wygląda na bezbronny, bo budynki czyta się per-ciało). Naprawa
z W3-5 nie może sięgnąć 199, bo cel 199 raportuje `defended: false` — **reguła eskadry nigdy się nie
odpala**.

---

## 1. Trzy sprostowania do zlecenia (każde zmienia przestrzeń decyzji)

**Sprostowanie 1 — asymetria jest o POŁOWĘ mniejsza, niż brzmi.** Źródło (`DirectorOffensive.js:181-198`):

- **budynki** → `target.colony.buildingSystem._active` — **zakres CIAŁA** ⇒ asymetryczne wobec bitwy;
- **okręty** → `if ((v.systemId ?? 'sys_home') !== target.systemId) continue` — **zakres UKŁADU**,
  czyli **już symetryczne** z bitwą, z jedną różnicą: dodatkowy warunek `hasWeapons`.

⇒ „V2 = poszerz `isDefended` do układu" znaczy w istocie „poszerz **połowę budynkową**". Połowa
okrętowa jest na miejscu od `07c1087`. (Wpis rejestru 199 mówi to poprawnie; skróciła to dopiero
jednozdaniowa rama zlecenia.)

**Sprostowanie 2 — `isDefended` NIE JEST bramką ataku. Jest selektorem ROZMIARU eskadry.**
Wybiera wyłącznie `needed = 2` vs `needed = 1`. Poszerzenie go **nie powstrzymuje** AI przed atakiem
na broniony cel — podnosi tylko wymaganą liczbę okrętów. **ZMIERZONE** (§3.3): przy puli 2 wariant V2
dalej wystartował i dalej zginął.

**Sprostowanie 3 — człon wartości NIE POTRAFI rozróżnić ciał wewnątrz układu.**
`targetValue(target)` = `TerritoryService.getSystemDevScore(target.systemId)` — punktacja **per UKŁAD**
używana do rankingu celów **per CIAŁO**. Dwie kolonie w jednym układzie zawsze remisują na wartości,
więc o kolejności decyduje **wyłącznie** `defended`, a potem `String(body.id).localeCompare`. Dlatego
bias jest systematyczny, a nie marginalny — i dlatego V2 (który czyni `defended` jednolitym w układzie)
degeneruje sortowanie do porównania identyfikatorów. → **Finding 202**.

---

## 2. Inwentarz konsumentów (pytanie A)

**Wołający bezpośredni — mapa jest wąska (4 site'y, 2 pliki):**

| site | wołający | żywy? |
|---|---|---|
| `WarSystem:609` `_buildPlayerBattleUnit(systemId)` | — | definicja |
| `EnemyAttackHandler:158` | bitwa orbitalna (batch) | **ŻYWY — jedyna ścieżka produkcyjna** |
| `WarSystem:400` `forceBattle` | przycisk `WarOverlay:354` | dźwignia debug/dev |
| `WarSystem:534` `_fleetArrived` | `WarSystem:493`, floty abstrakcyjne | **tylko STARY ZAPIS** po retirementcie W3-8 |
| `WarSystem:605` `hasPlayerPresenceInSystem` | `EnemyAttackHandler:124` | ŻYWY (bramka widma z W3-4b) |

`_playerColoniesInSystem` / `_playerVesselsInSystem` **nie mają konsumentów poza `WarSystem`**.
`PlayerViability`, narracja STRATCOM, parowanie DSCS i ścieżka desantu naziemnego **ich nie czytają**
(grep czysty).

**Promień rażenia pośredni — wszystko poniżej WYNIKU bitwy.** 12 subskrybentów `battle:resolved`:
`WarSystem._classifyBattle` (księgowanie), `InvasionSystem` (bramka desantu), `AutoRetreatSystem`,
`ProximitySystem`, `VesselManager` (stempel `lastBattleId`), `UIManager` (auto-slow), `GameScene` ×2
(Dziennik), `ThreeRenderer` (FX), `DebugLog`, `VesselCombatSystem`. **Żaden z nich nie czyta zakresu** —
czytają `winner` / `participant*` / `location`. Zmiana zakresu jest dla nich niewidzialna **co do
kształtu** i widoczna wyłącznie **co do wyniku**. To dobra wiadomość: żaden konsument nie musi się ruszać.

**⚠ Dwa zakresy-rodzeństwo, które naiwna naprawa zostawiłaby w tyle — oba zmierzone:**

1. **`EnemyAttackHandler._wreckPlayerVesselsInSystem(systemId)` jest w zakresie UKŁADU.** Przy
   body-scope statek gracza zadokowany przy stolicy **nie pomaga bronić** koloni wtórnej, ale **i tak
   ginie**, gdy ta padnie. ZMIERZONE (V1, `statkiGr = 1.0`): handlowiec przy `p_cap` został wrakiem
   po bitwie przy `p_sec`, w której nie był liczony jako obrońca. → **Finding 203**.
   ⚠ Pod **V4 to znika** (§3.5).
2. **`_updateOrbitalDominance` pisze per UKŁAD**, a `playerHasOrbitalDominance(planetId)` mapuje
   ciało → układ. Wygranie orbity nad jednym ciałem daje dominację nad całym układem (a więc bramkę
   desantu dla każdego ciała w nim). Żaden wariant tego nie rusza — ale slice ma to **nazwać**.

---

## 3. POMIARY WYKONANE PRZED KODEM

Instrument = **instrument Z2** (kształt `probe-z2-f`): prawdziwe `rollFires` + prawdziwy
`DIRECTOR_RULES.strike_player_target` (cooldown 5.0, jedna próba na rok wyświetlany,
`personalityMultiplier`) + stałe przelotu zmierzone w Z2 (WARP 0.28 + LEG 4.8 + noga powrotna) —
rozszerzony o **produkcyjne `pickTarget` + `_buildPlayerBattleUnit` + `resolveBattle`**.
Warianty realizowane przez **OGRANICZENIE WIDOKU ŚWIATA**, nie przez przepisanie matematyki bitwy.

**Kontrola pinu narzędzia (wykonaniem):** `otherFactor = 1` + zasięg systemowy odtwarza produkcyjne
`_buildPlayerBattleUnit` **pole w pole** → `OK`. Skalowanie poziomu jest dokładne, bo produkcyjna
matematyka jest liniowa w poziomie (`40·lv`, `100·lv`).

**Fixture** (scenariusz zgłoszony przez właściciela): `sys_home`, stolica na 1 AU z `defense_grid` Lv1
+ `defense_tower` Lv2, kolonia wtórna `Jaskrow` na 3 AU bez niczego, jeden **bezbronny** handlowiec
zadokowany przy stolicy. 4 ziarna × (imperium, agresja, sól), 100 lat wyświetlanych.

### 3.1 Obrońca, którego bitwa NAPRAWDĘ buduje — przy koloni wtórnej

| | HP | bronie |
|---|---|---|
| **V0** (dziś) | **210** | `[{2},{20}]` ← 180 HP i dmg 20 pochodzą ze **STOLICY** |
| **V1** (ciało, R = 0,5 AU) | **30** | `[{2}]` (obrona symboliczna) |
| **V3** (hybryda, F = 0,25) | 45 | `[{5}]` |
| V1 **przy stolicy** | 210 | bez zmian — stolica zawsze broni się sama |

### 3.2 ⚠ PULA JEST PARAMETREM DECYDUJĄCYM, nie tłem

Przy puli nieograniczonej `launchStrike` zawsze wysyła `MAX_STRIKE_SIZE = 3`, trzy rajdery (360 HP)
biją nawet pełną obronę i **wszystkie warianty stają się nierozróżnialne** (10 zwycięstw / 10).
Scenariusz właściciela miał **dwa** rajdery ⇒ realna pula jest mała. Zamiecione 1-3, bez uzupełnień
(produkcja okrętów AI stoi — **Finding 208**).

### 3.3 Tempo / 100 lat wyświetlanych, średnia z 4 przebiegów

| pula | V0 dziś | V1 ciało | V2 celowanie=układ | V2+G układ + eskadra GRADOWANA |
|---|---|---|---|---|
| **1** | 1 uderz. / **przegrana** / 1 kadłub / wycz. AI **9** vs gracz 2 · **pusto w roku 11** | 10 uderz. / **10-0 dla AI** / 1 statek gracza / wycz. gracz **90** | **0 uderzeń, 19,8 odmów** — pełny paraliż | **0 uderzeń, 19,8 odmów** |
| **2** | 1 uderz. / **przegrana** / **2 kadłuby** / wycz. AI 9 · pusto w roku 11 | 10 uderz. / 10-0 dla AI / wycz. gracz **90** | 1 uderz. / **przegrana** / **2 kadłuby** · pusto w roku 11 — **samobójstwo, tyle że na STOLICY** | **0 uderzeń, 0 straconych kadłubów** |
| **3** | 10 uderz. / 10-0 dla AI / wycz. gracz 90 | identycznie | identycznie | identycznie (cel = stolica) |

**Sześć odczytów, każdy nośny:**

1. **199 gryzie wyłącznie przy puli ≤ 2.** Przy 3 wszystkie warianty są tożsame. To dokładnie stan,
   który zobaczył właściciel, i stan, w którym AI tkwi, dopóki produkcja stoi (**208**).
2. **V0 jest jednorazową pompą wyczerpania.** Jedno uderzenie, jedna przegrana, `+9` wyczerpania AI
   wobec `+2` gracza — i imperium **nie ma rajderów od roku ~11**, milcząc przez pozostałe 89.
   To porażka z Findingu 34, żywa i odtworzona.
3. **V1 odwraca grę.** AI wygrywa 10/10 przy **każdej** puli, a gracz zbiera **90 wyczerpania / 100 lat**
   przy `AUTO_PEACE_EXHAUSTION = 100`. Kolonie wtórne stają się darmowym celem.
4. **V2 nie zatrzymuje samobójstwa — przekierowuje je.** Przy puli 2 AI dalej startuje i dalej ginie,
   teraz na **stolicy**, bo `defended` stało się jednolite, a porządek zdegenerował do porównania
   identyfikatorów (sprostowanie 3). Przy puli 1 daje **zero uderzeń w 100 lat**.
5. **V3 zachowuje się w celowaniu jak V2** (ta sama degeneracja), z osłabioną bitwą w środku —
   dziedziczy wady V2 nie kupując odrębnego zachowania. F = 0,25 to pokrętło przy mechanizmie,
   który nie jest problemem.
6. **Pomiar wymusił piąty wariant, którego zlecenie nie zawierało** — i tylko on usuwa darmowe straty
   nie oddając koloni wtórnych: **gradować eskadrę do obrony, którą bitwa NAPRAWDĘ zbuduje**
   (`needed = ceil(defenderHP · 1,5 / raiderHP)`). Przy puli 2 **odmawia zamiast ginąć** (0 kadłubów
   zamiast 2); przy puli 3 uderza i wygrywa. **Nie wycieka żadna nowa informacja** — dzisiejsze
   `isDefended` i tak czyta `colony.buildingSystem._active` wprost; gradowanie przestaje tylko
   wyrzucać to, co przeczytało.

### 3.4 ⚠ CLAMP DO `MAX_STRIKE_SIZE` ODTWARZA SAMOBÓJSTWO — poprawka właściciela potwierdzona pomiarem

| obrona stolicy | HP obrońcy | `needed` bez clampa | po clampie | skutek |
|---|---|---|---|---|
| grid Lv1 + tower Lv2 (fixture) | 210 | **3** | 3 | mieści się w suficie |
| **grid Lv3 + tower Lv5 (MAX)** | **530** | **7** | 3 | 🔴 3 rajdery (360) vs 530 → **winner = B B B B** |
| grid Lv3 + 3× tower Lv5 | **930** | **12** | 3 | 🔴 pewna śmierć |

⇒ Bez własnego powodu odmowy clamp odtwarza **dokładnie to samobójstwo, dla którego ten slice
istnieje**, tylko wyżej na skali. **Poprawka jest konieczna, nie ostrożnościowa.**

Dwa **rozłączne** powody odmowy, bo opisują dwa różne stany świata:

- **`insufficient_squadron`** — `needed ≤ MAX_STRIKE_SIZE`, ale `available < needed`
  („mógłbym wziąć, po prostu nie mam teraz okrętów") — stan **przejściowy**;
- **`target_beyond_reach`** — `needed > MAX_STRIKE_SIZE` („nawet w pełni sił tego nie wezmę") —
  stan **strukturalny**.

Oba z ładunkiem `{ needed, available, defenderHp }`.

### 3.5 V4 — wariant, o który poprosił właściciel (budynki CIAŁO, okręty UKŁAD)

**Próg utrzymania: HP obrońcy musi przekroczyć 240** — bo sufit AI to 3 rajdery = 360 HP przy
`RATIO = 1,5`, czyli `ceil(240·1,5/120) = 3`, a `241 → 4 > MAX_STRIKE_SIZE` ⇒ **odmowa**.

| co gracz ma przy koloni wtórnej | V1 (bud. ciało, okręty ciało) | **V4 (bud. ciało, okręty UKŁAD)** |
|---|---|---|
| nic | hp 30 · needed 1 | hp 30 · needed 1 |
| 1 fregata w układzie (dok przy stolicy) | hp **30** · needed 1 — **flota bezużyteczna** | hp 150 · needed 2 |
| 1 fregata przy tej koloni | hp 120 · needed 2 | hp 150 · needed 2 |
| **2 fregaty w układzie** | hp **30** · needed 1 | **hp 270 · needed 4 ⇒ UTRZYMANE** |
| tower Lv1 na tym ciele | hp 40 · needed 1 | hp 70 · needed 1 |
| tower Lv5 na tym ciele | hp 200 · needed 3 | hp 230 · needed 3 (o włos za mało) |
| grid Lv1 na tym ciele | hp 100 · needed 2 | hp 130 · needed 2 |
| grid Lv1 + tower Lv2 | hp 180 · needed 3 | hp 210 · needed 3 |
| **grid Lv1 + tower Lv3** | hp 220 · needed 3 | **hp 250 · needed 4 ⇒ UTRZYMANE** |
| **1 fregata + grid Lv1 na ciele** | hp 100 · needed 2 | **hp 250 · needed 4 ⇒ UTRZYMANE** |

**Odpowiedź na pytanie właściciela — co gracz MINIMALNIE potrzebuje, żeby utrzymać kolonię wtórną:**

- **pod V4:** **dwie fregaty w układzie** (270), **albo** `grid Lv1 + tower Lv3` na tym ciele (250),
  **albo — najtaniej — jedna fregata w układzie + `grid Lv1` na ciele** (250). Jedna fregata sama
  **nie wystarcza** (150), tower Lv5 sam **nie wystarcza** (230, brakuje 11 HP).
- **pod V1:** **żadna** z badanych konfiguracji nie dochodzi do 240. Najlepsza to `grid Lv1 + tower Lv3`
  **na tym ciele** = 220 ⇒ AI wysyła 3 i wygrywa. Trzeba `grid Lv1 + tower Lv4` (260). **Flota
  zaparkowana gdziekolwiek indziej w układzie jest warta ZERO** (hp zostaje 30).

**⇒ Czy D-199-3 i D-199-4 rozpuszczają się pod V4 — POTWIERDZONE, obie:**

- **D-199-3 (zakres wraków):** pod V4 zakres okrętów = UKŁAD = zakres
  `_wreckPlayerVesselsInSystem`. **Symetria z konstrukcji** — ginie ten statek, który bronił.
  ⇒ **decyzja znika**, a **Finding 203 przestaje być osiągalny** (pozostaje otwarty tylko wtedy,
  gdy wybrany zostanie V1).
- **D-199-4 (promień R):** pod V4 okręty nie są w zakresie ciała ⇒ **żaden promień nie jest
  potrzebny**. Budynki należą do ciała **z konstrukcji** (`colony.planetId`). ⇒ **decyzja znika
  w całości**: zero nowej stałej, zero reużycia progu 0,5 AU z `SystemPoolService`.
- **Finding 206** (`defense_tower` ma dwie prace w dwóch zakresach): pod V4 praca orbitalna staje się
  per-kolonia, tak jak praca katastroficzna ⇒ **206 się domyka** (tak samo pod V1).

**⇒ V4 jest ŚCIŚLE PROSTSZY od V1:** rozpuszcza dwie z trzech wstrzymanych decyzji i jeden finding,
zachowuje sens floty, a obietnicę UI („planetarna / kolonii") czyni prawdziwą tak samo jak V1.

⚠ **Resztkowa asymetria pod V4, do nazwania:** `isDefended` liczy okręty **uzbrojone**
(`hasWeapons`), a bitwa liczy **wszystkie** (HP bezbronnego handlowca wchodzi). Pod gradowaniem
`needed` liczone jest z jednostki, którą bitwa zbuduje, więc **oszacowanie AI pozostaje prawdziwe** —
asymetria staje się nieszkodliwa. Wariant **V4a** (bitwa też tylko uzbrojone) usunąłby ją, ale to
jest zmiana `_playerVesselsInSystem`, którą właściciel wyłączył z zakresu, i obniża HP obrońcy
(150 → 120 w fixture). **Nie rekomendowane w tym slice'ie.**

### 3.6 Sortowanie `pickTarget` — potwierdzenie warunku właściciela do D-199-5

| zakres | Stolica | Jaskrow (tower Lv1) | sort po BOOL | sort po GRADED |
|---|---|---|---|---|
| **V0** | `bool:true hp:250 needed:4` | `bool:true hp:250 needed:4` | Stolica > Jaskrow | Stolica > Jaskrow — **ten sam cel** |
| **V4** | `bool:true hp:210 needed:3` | `bool:true hp:70 needed:1` | Stolica > Jaskrow | **Jaskrow > Stolica — INNY CEL** |

**⇒ Warunek potwierdzony: `pickTarget` MUSI sortować po gradowanym `needed` rosnąco, nie po
booleanie.** Bez tego 202 dalej rozstrzyga między ciałami w tym samym układzie — i to **w najgorszy
sposób**, bo boolean wskazuje cel TRUDNIEJSZY.

⚠ **Ale zmiana sortowania jest NO-OPEM aż do commitu 3, i to trzeba wiedzieć przed podpisem:**
`_buildPlayerBattleUnit(systemId)` nie przyjmuje dziś ciała, więc **pod V0 każde ciało w układzie ma
IDENTYCZNEGO obrońcę** ⇒ `needed` jest dla wszystkich takie samo ⇒ gradowanie nie różnicuje i sort
i tak spada na identyfikator (zmierzone: obie kolonie `needed: 4`). Sortowanie po `needed` wpisujemy
w commicie 2 **jako przygotowanie**, ale zaczyna działać dopiero z body-scope.

### 3.7 ⚠ KONSEKWENCJA STANU PRZEJŚCIOWEGO (commit 2 bez commitu 3) — do świadomej akceptacji

Skoro pod V0 wszystkie ciała w układzie gradują się identycznie, to **gracz z maksymalnie
ufortyfikowaną stolicą (`needed 7`) czyni CAŁY układ nieatakowalnym**: `target_beyond_reach` odpowie
tak samo dla koloni wtórnej bez jednego działka. To lustrzane odbicie paraliżu z V2 — z tą różnicą,
że wywołuje je gracz, a nie pula AI.

⇒ Po commicie 2 AI staje się **poprawne, ale w układzie z silną stolicą całkowicie bierne**.
Dopiero commit 3 (body-scope) przywraca mu zdolność wybierania słabych ciał. **To jest argument
za tym, żeby commit 3 nie leżał długo.**

---

## 4. ⚠ CO POMIAR ZMIENIŁ, A NIE POTWIERDZIŁ

### 4.1 🔴 D-199-6 NIE DA SIĘ WYKONAĆ TAK, JAK ZOSTAŁO PODPISANE — sprawdzenie właściciela zadziałało

Właściciel poprosił o jedno sprawdzenie przed implementacją: *„potwierdź, że `resolveBattle` kończy
się czysto (limit tur) przy obrońcy, którego `weapons === []`"*. **Odpowiedź jest dwuczęściowa
i odwraca decyzję.**

**(a) Tak, kończy się czysto** — `turns = 6`, limit `MAX_TURNS = 30` działa, brak zawieszenia.

**(b) Ale `weapons: []` NIGDY NIE JEST HONOROWANE.** `BattleSystem.normalizeFleet` ma **własny,
drugi fallback**:

```js
const weapons = Array.isArray(raw.weapons) && raw.weapons.length > 0
  ? raw.weapons
  : [{ damage: 5, tracking: 0.7, armorPierce: 0 }]; // domyślny lekki laser
```

⇒ **Zdjęcie fallbacku z `playerVesselsToBattleUnit:262` zamienia dmg 2 na dmg 5. To WZMOCNIENIE
bezbronnego obrońcy, nie rozbrojenie.** ZMIERZONE (obrażenia zadane napastnikowi przez bezbronnego
handlowca, 6 ziaren):

| pancerz napastnika | dziś (dmg 2) | **6a samo** (→ dmg 5) | 6a **+** 6b (naprawdę bez broni) |
|---|---|---|---|
| 0 | 34 | **85** | 0 |
| 2 | 20 | **71** | 0 |
| 5 | 17 | **51** | 0 |
| 10 | 17 | 17 | 0 |

**⚠ SPROSTOWANIE DO MOJEGO WŁASNEGO POMIARU Z AUDYTU.** Wynik „0 przerzutów na 36 bitew" jest
**prawdziwy, ale z innego powodu, niż podałem**. Rajder `frigate_laser_escort` ma pancerz 10, a próg
`Math.max(1, rawDmg − armor·0,4)` sprowadza **oba** fallbacki do 1 obrażenia na trafienie. Napisałem
„dmg 2 to szum na każdej skali" — poprawnie brzmi: **„dmg 2 i dmg 5 są nierozróżnialne wyłącznie
przy pancerzu ≥ 10; przy lżejszym napastniku różnią się 3-5×"**. Wniosek o braku przerzutów
zwycięzcy zostaje, ale nie uprawnia do nazwania 6a „czystą higieną".

**Promień rażenia 6b jest ZEROWY** (sprawdzone): jedynym producentem `weapons: []` w całym `src/`
jest `playerVesselsToBattleUnit` z **pustą** tablicą statków — czyli „obrońca-widmo", którego bramka
`hasPlayerPresenceInSystem` (W3-4b) i tak nie wpuszcza już do bitwy.

**⇒ Trzy opcje do PONOWNEGO PODPISU (D-199-6 wraca na stół):**

| | co robimy | skutek | ocena |
|---|---|---|---|
| **6a** (jak podpisano) | zdejmij fallback `playerVesselsToBattleUnit` | **BUFF** 2 → 5 | ❌ **odrzucić** — odwrotność intencji |
| **6b** samo | `normalizeFleet` honoruje pustą listę | dziś **no-op** (nikt nie podaje `[]`) | ⚪ prawdziwe, ale bez skutku |
| **6a + 6b razem** | bezbronny kadłub wnosi **HP, zero broni** | 0 obrażeń, wynik bitwy bez zmian w fixture | ✅ **REKOMENDACJA** — jedyna kombinacja realizująca intencję Findingu 200 |

⚠ **Druga korekta do audytu:** ostrzegłem, że filtr `hasWeapons` w `_playerVesselsInSystem` złamie
`deploy_seams` T5 / `w2_deploy_model` T3a. **To było błędne** — oba keepery używają
`WARSHIP = ['engine_ion','armor_standard','weapon_kinetic']`, czyli kadłubów **uzbrojonych**.
Wyłączenie tego filtru z zakresu zostaje słuszne z **innego** powodu (usuwa HP bezbronnych kadłubów
= zmiana balansu, nie higiena), ale nie z powodu, który podałem.

⚠ **Przy okazji: dwa komentarze w kodzie opisują flotę, która nie istnieje.** `WarSystem:597`
i `EnemyAttackHandler:120` nazywają widmo *„sto punktów wytrzymałości i ZERO broni"* — a `normalizeFleet`
daje mu laser dmg 5. → **Finding 209** (klasa „predykat opisany w komentarzu ≠ predykat egzekwowany").

### 4.2 Pytanie o GATE B2 (a) — **NIE, 180-182 tego nie zamknęły**

- **180** — paliwo AI, jawnie zapisane jako **NIE rodzina B2(a)** (`fuel` nie występuje w kosztach
  statków; grep = 0). Utajony i tak.
- **181** ✅ ZAMKNIĘTY (`ccb275b`) — gałąź fuzji u Industrialisty; `warp_cores` po raz pierwszy niezerowe.
- **182** ✅ ZAMKNIĘTY (`d44af5e`) — cel zapasu tier 3+ 1 → 50; `plasma_cores` 0→50, `quantum_cores` 0→17.

181 i 182 naprawiły **dostępność komponentów**, ale wpis GATE B2 (a) jest **obserwacją PO tych
fiksach** (mówi to wprost w `OPEN_FINDINGS_INDEX.md`), a jego **warunek wstępny — Finding 178 —
jest OTWARTY**: `EmpireLogisticsSystem._loadByRarity` ładuje **wyłącznie `MINED_RESOURCES`**, a trasa
jest **jednokierunkowa** (outpost → stolica), więc **żaden commodity fizycznie nie wejdzie na pokład
kuriera** i wtórne kolonie AI nigdy nie dostają komponentów.

⇒ **Numeruję jako Finding 208** i nazywam **następnym elementem po 199, przed 154** — zgodnie
z podpisem właściciela. Uzasadnienie: po commicie 2 AI **przestaje ginąć**, ale odzyskanie zdolności
uderzeniowej wymaga **trzeciego kadłuba**, a jedyna droga do niego prowadzi przez
`pressureResponse → queueWarships → startShipBuild`, którą 208 blokuje po cichu
(`ORDER_TTL_DISPLAYED_YEARS = 3.0`, `director:orderExpired`).

---

## 5. Obietnica UI — odpowiedź ODWRACA ryzyko ze zlecenia

Zlecenie pytało, czy V1 sprawi, że UI zacznie kłamać. Jest **odwrotnie: to dzisiejsze zachowanie
czyni UI kłamliwym.**

| powierzchnia | tekst |
|---|---|
| `BuildingsData:723` | „Chroni **planetę** przed kometami i zagrożeniami kosmicznymi" |
| i18n `building.defense_tower.desc` | PL „System obrony **punktowej**" · EN „**Point** defense system" |
| `BuildingsData:745` | „Globalna obrona **kolonii**" |
| i18n `building.defense_grid.desc` | PL „**Planetarna** siatka obronna … ochrona **kolonii**" · EN „**Planetary** defense grid … **colony** protection" |
| `TechData:1015` | nazwa techu: „Obrona **Planetarna**" / „**Planetary** Defense" |
| `TechData:1024` | „Siatka Obronna … **kolonia** chroniona" |

**Każdy** napis w grze obiecuje zakres **planety/kolonii**. Zakresu układu nie obiecuje **nic**.
Jedyna wypowiedź projektowa na ten temat — `plan-war-diplomacy-ai.md:332` — mówi, że budynki
*„strzelają do wrogich jednostek **w promieniu**"*, co jest bliższe body-scope niż dzisiejszemu
„cały układ".

⇒ **Body-scope dla BUDYNKÓW jest prawdą projektową** (podpisane przez właściciela). Koszt V1/V4 jest
kosztem **balansu**, nie prawdziwości.

---

## 6. Symetria gracza (pytanie D)

**Nie ma czego zwężać po drugiej stronie.** Obrona planetarna jest mechaniką **wyłącznie gracza**:

- `_playerColoniesInSystem` filtruje `!c.ownerEmpireId || c.ownerEmpireId === 'player'`;
- `defense_tower` / `defense_grid` występują w `src/systems/` w **trzech** miejscach: `WarSystem`
  (obrońca-gracz), `DirectorOffensive.isDefended` (ocena kolonii **gracza**), `RandomEventSystem`
  (katastrofy). **Budynki obronne koloni AI nie wchodzą do żadnej bitwy, nigdy** — a
  `COMBAT_DIPLO_AUDIT.md:636` odnotował już „AI never builds any", przy `ColonyAutoExpander`
  bez ani jednej pozycji obronnej.

Droga gracza do koloni AI to: wygraj orbitę przez DSCS (okręt vs okręt, zero wkładu planetarnego) →
`playerHasOrbitalDominance` → desant → walka naziemna. **Nigdy nie woła `_buildPlayerBattleUnit`.**

⇒ Zwężenie bitwy po stronie AI **nie tworzy nowej asymetrii w drugą stronę** — *zmniejsza* istniejącą.
⚠ Ale `_tryPlayerCapture` i desant gracza dzielą `playerHasOrbitalDominance`, które jest **kluczowane
na UKŁAD** — więc przy body-scope bitwy gracz dalej bierze prawa desantowe do całego układu z bitwy
o jedno ciało. **Nazwane, nie naprawiane w tym slice'ie.**

---

## 7. DECYZJE

### 7.1 Podpisane 2026-08-31

| # | decyzja | status |
|---|---|---|
| **D-199-1** | **Gradowana eskadra** — `needed` liczone z jednostki, którą bitwa zbuduje | ✅ **W1 Z POPRAWKĄ**: **BEZ clampa** do `MAX_STRIKE_SIZE`. Gdy `needed > MAX_STRIKE_SIZE` ⇒ własna odmowa **`target_beyond_reach`** z ładunkiem `{needed, available, defenderHp}`. Uzasadnienie zmierzone: §3.4. ⚠ **`SQUADRON_HP_RATIO = 1.5` MUSI być nazwaną stałą eksportowaną** (obok `SQUADRON_VS_DEFENDED` / `MAX_STRIKE_SIZE` w `DirectorOffensive.js` — ta sama konwencja), **nigdy literałem we wzorze**: to **JEDYNE pokrętło balansu w tym slice'ie** i musi dać się znaleźć grepem oraz przestroić bez czytania formuły |
| **D-199-7** | Prawdomówna drabina odmów + `strikeReport` | ✅ **W1.** `GameScene:684` przestaje zaszywać `< 2`. Nowe powody **w tym samym commicie** dołączają do `DebugLog.TRACKED_EVENTS` (reguła W3) |
| **D-199-8** | `_buildPlayerBattleUnit(systemId, targetBodyId = null)` | ✅ **W1.** `null` ⇒ dzisiejszy zakres układu. `forceBattle` i `_fleetArrived` bez zmian; `deploy_seams` T5 i `w2_deploy_model` T3a zostają zielone **bez edycji** — ale przez to stają się **jałowe** wobec nowego zachowania ⇒ nowy keeper musi pinować ścieżkę z ciałem **jawnie** |
| **D-199-5** | Granulacja `targetValue` | ✅ **W2 — poza zakresem → Finding 202.** ⚠ **Warunek właściciela POTWIERDZONY pomiarem** (§3.6): `pickTarget` sortuje po **gradowanym `needed` rosnąco**, nie po booleanie. ⚠ Zmiana jest **no-opem do commitu 3** |
| **D-199-6** | Finding 200 | ✅ **6a + 6b RAZEM** (ponowny podpis po §4.1 — pierwszy warunek nie został spełniony). Bezbronny kadłub wnosi **HP, zero broni**. ⚠ **Skutek po stronie AI jest SYMETRYCZNY i zamierzony**: `EnemyAttackHandler:144` buduje `enemyUnit` tym samym helperem, więc bezbronny kadłub AI też traci prezentową broń — **nazwać w komunikacie commitu**. Commit 1 |
| **findingi 201-209** | zarejestrować | ✅ wszystkie; **201** podpięty do stałego warunku W3 „szablon transportowca AI" |

### 7.2 Podpisane 2026-08-31 — commit 3 = **V4**

| # | decyzja | status |
|---|---|---|
| **D-199-2** | zakres obrony | ✅ **V4: budynki w zakresie CIAŁA, okręty uzbrojone w zakresie UKŁADU.** Body-scope budynków = prawda projektowa (§5); okręty zostają systemowe, więc **flota zachowuje sens** |
| **D-199-3** | czy `_wreckPlayerVesselsInSystem` idzie za bitwą | ✅ **ROZPUSZCZONA.** Pod V4 zakres okrętów = UKŁAD = zakres wraków ⇒ symetria **z konstrukcji**: ginie ten statek, który bronił. **Finding 203 domyka się razem z commitem 3** |
| **D-199-4** | promień R „przy tym ciele" | ✅ **ROZPUSZCZONA W CAŁOŚCI.** Pod V4 okręty nie są w zakresie ciała ⇒ **żaden promień nie jest potrzebny**; budynki należą do ciała z konstrukcji (`colony.planetId`). **Zero nowych stałych, zero reużycia progu 0,5 AU** |

**Dlaczego V4, a nie V1** (uzasadnienie podpisu, w kolejności wagi):
1. **rozpuszcza D-199-3 i D-199-4** oraz domyka **findingi 203 i 206** — cztery rzeczy mniej do utrzymania;
2. **flota zachowuje sens** — pod V1 dwie fregaty w układzie są warte dokładnie zero (hp 30);
3. czyni obietnicę UI prawdziwą **tak samo** jak V1 (budynki = planetarne);
4. daje graczowi czytelny, osiągalny próg obrony (**1 fregata + `grid` Lv1** = 250 HP), zamiast wymogu
   ufortyfikowania każdego ciała z osobna.

⚠ **OBSERWACJA BALANSOWA (bez zmiany, do zapamiętania przy strojeniu `SQUADRON_HP_RATIO`):**
**`tower` Lv5 sam na koloni wtórnej daje 230 HP i mija próg utrzymania o 11 HP** (próg to > 240).
Gracz, który postawi maksymalną wieżę i nic więcej, dostanie `needed 3` — czyli AI dalej uderzy
i wygra. To najbardziej stroma krawędź w całej tabeli §3.5 i pierwszy kandydat do obejrzenia,
gdyby próg okazał się zbyt ostry.

---

## 8. Podział na commity

| commit | zawartość | balans? |
|---|---|---|
| **1** | **D-199-6 = 6a + 6b** (po ponownym podpisie) — bezbronny kadłub wnosi HP, zero broni | ⚪ zero treści balansowej w fixture; wynik bitwy bez zmian |
| **2** | **D-199-1 (z poprawką) + D-199-7 + D-199-8** + sort po `needed` (przygotowawczo) | ⚪ **AI przestaje ginąć darmowo; obrona gracza NIETKNIĘTA** |
| **3** | **D-199-2 = V4** (budynki CIAŁO, okręty UKŁAD). D-199-3/D-199-4 **nie mają treści** — rozpuszczone | 🔶 **realna zmiana balansu — PODPISANA** |

⚠ Kolejność jest wiążąca: commit 2 zamyka zgłoszoną porażkę („AI atakuje to, czego nie zdobędzie")
**bez** dotykania obrony gracza — a to jest dokładnie ta połowa, której właściciel nie musi ważyć.

**⚠ JEDEN live-gate, na stanie KOŃCOWYM po commicie 3 — NIE po commicie 2** (decyzja właściciela).
Powód jest zapisany w §3.7: stan przejściowy (commit 2 bez 3) czyni układ z silną stolicą całkowicie
nieatakowalnym, a **tego stanu nie zatrzymujemy** ⇒ bramkowanie go zmierzyłoby zachowanie, którego
nie wypuszczamy. Każdy commit z osobna: **fail-first + pełny sweep + `check-i18n`**, save **v101 bez
zmian**. Dowodem flagi zostaje **para odczytu stanu** z §11, nie obserwacja zachowania.

---

## 9. Keeper — `defense_scope_smoke.mjs`, plan fail-first

Pomiar fail-first **finalnymi** pinami przez `git stash` samego kodu gry. Każdy pin ma kontrolę pinu.
**Niejałowość egzekwowana jawnie** — powracająca lekcja tej sesji (F130 T3; siedem pinów
wykluczających w Z2 przechodziło jałowo, dopóki nie dodano wymogu obecnego świadka).

| pin | asertuje | wymóg NIEJAŁOWOŚCI | kontrola pinu |
|---|---|---|---|
| **T1** asymetria istnieje | `isDefended(wtórna) === false` **przy** `_buildPlayerBattleUnit(sys, wtórna).hp > 30` | assert `hp stolicy > 0` **i** `kolonie.length === 2` — inaczej „nigdzie nie ma obrony" przechodzi trywialnie | `isDefended(stolica) === true` |
| **T2** zakres zmienia jednostkę | flaga ON: 30 · OFF: 210 | assert, że liczby **się różnią**, i że `hp(stolica)` jest **identyczne** w obu — inaczej globalne osłabienie przeszłoby | stolica bez zmian ON/OFF |
| **T3** gradowanie różnicuje | `needed(wtórna) === 1`, `needed(stolica) === 3` | assert **≥ 2 różne wartości** w zbiorze — stub zwracający stałą musi paść | po zdjęciu obrony stolicy jej `needed` spada do 1 |
| **T4** odmowa zamiast samobójstwa | pula 2 vs stolica ⇒ `insufficient_squadron` `{needed:3, available:2}` **i zero wydanych rozkazów** | assert `strikeReadyVessels().length === 2` **przed** wywołaniem (pin na pustej puli przechodzi z niewłaściwego powodu — błąd z Z2) | pula 3 ⇒ `launched === 3` |
| **T5** ⚠ **CLAMP NIE WRACA** (poprawka właściciela) | obrona `grid Lv3 + tower Lv5` ⇒ `target_beyond_reach`, **nie** `launched > 0` | **assert `needed` BEZ CLAMPA > 3** (zmierzone 7) — bez tego pin przechodzi także dla implementacji z clampem | ta sama obrona zbita do Lv1/Lv2 ⇒ `needed === 3` ⇒ **atak dochodzi do skutku** |
| **T6** drabina prawdomówna | `insufficient_squadron` ≠ `target_beyond_reach`; oba w `TRACKED_EVENTS`; `strikeReport().werdykt` nazywa liczbę okrętów | assert, że werdykt **różni się** od tekstu sprzed slice'u | flaga OFF ⇒ wraca stary werdykt |
| **T7** sortowanie po `needed` | przy dwóch ciałach o różnym `needed` wybrane jest **mniejsze** | assert `needed` obu ciał **się różnią** (pod V0 są równe ⇒ pin byłby jałowy — **wymaga fixture z body-scope**) | odwrócenie obrony odwraca wybór |
| **T8** rozbrojenie 6a+6b *(w zleceniu podpisu: „T7")* | ⚠ **PIN MUSI PRZECHODZIĆ PRZEZ `normalizeFleet`, czyli mierzyć to, co WIDZI `resolveBattle`** — nie sam wynik `playerVesselsToBattleUnit`. Dwie warstwy: (1) `playerVesselsToBattleUnit([bezbronny]).weapons` jest puste **ORAZ** (2) `resolveBattle` z tym obrońcą zadaje **0** obrażeń | assert tablica wejściowa **niepusta** (dla `[]` pusta lista wychodzi INNĄ gałęzią) **i** pancerz napastnika **< 10** (przy 10 obie wersje floorują do 1 — mierzyłoby ciszę) | uzbrojony kadłub dalej wnosi swoją broń |

⚠ **DLACZEGO T8 MUSI BYĆ DWUWARSTWOWY — to jest cała lekcja z §4.1.** Pin jednowarstwowy
(tylko wyjście `playerVesselsToBattleUnit`) **przechodzi na pierwszym fallbacku i nigdy nie zobaczy
drugiego** — dokładnie tak ten buff się chował. Warstwa (2) jest jedyną, która odróżnia
„lista jest pusta" od „bezbronny naprawdę nie strzela".
| **T9** legacy bez zmian | `_buildPlayerBattleUnit(sys)` bez ciała === wartość sprzed slice'u | assert, że w układzie **jest** broniona kolonia, inaczej 30 === 30 | pin źródłowy: `EnemyAttackHandler:158` **podaje** drugi argument (komentarze zdjęte) |
| **T10** kill-switch | para odczytu stanu przeskakuje **jako para** | assert, że **obie** liczby się ruszają; jedna z dwóch = FAIL | — |

| **T14** SEDNO zakresu | siatka obronna STOLICY nie wchodzi do bitwy o inne ciało | assert, że stolica ma realną obronę (≥180 HP) — inaczej „nie przeciekła" jest prawdą trywialną | nad WŁASNYM ciałem obrona wchodzi w całości (**T15**) |
| **T15** kontrola zakresu | wywołanie BEZ ciała dalej sumuje układ | — | chroni `forceBattle` / `_fleetArrived`, które ciała nie mają |
| **T16** D-199-3 rozpuszczona | zakres wraków == zakres okrętów | assert, że statek przy stolicy WCHODZI do bitwy o wtórną (różnica V4 wobec V1) | ten sam statek ginie przy upadku układu |
| **T17** kill-switch | **CZWÓRKA**, nie para (§11) — zakres widać na wtórnej, kompetencję na stolicy | assert, że przy OFF każde ciało ma TEGO SAMEGO obrońcę | druga liczba się NIE rusza — i to jest poprawne, bo to sam Finding 199 |
| **T18** WYPŁATA slice'u | AI celuje w ciało TAŃSZE do wzięcia | assert, że ciała **realnie różnią się** kosztem (pod zakresem układu byłyby identyczne ⇒ pin jałowy) | ⚠ pin powstał z awarii własnych fixture'ów T9/T10 |

**Regresja do przebiegu (oczekiwane zielone):** `deploy_seams` · `w2_deploy_model` ·
`w3_target_selection` · `w3_cross_system_attack` · `w3_ai_invasion` · `w3_battle_booking` ·
`battle_announce_once` · `battle_sides` · `battle_result_classification` · `ai_strike_recall` ·
`war_seams`. Sweep **192 → 193**.

---

## 10. GATE (LIVE) — §7, celuje w cztery szwy niemierzalne headless

⚠ **URUCHAMIANY DOKŁADNIE RAZ — na stanie po commicie 3** (decyzja właściciela, uzasadnienie §8).
Commity 1 i 2 są bramkowane wyłącznie keeperem + sweepem.

*Warunki wstępne: wojna z `emp_001`; stolica z `defense_grid` + druga kolonia bez obrony w tym samym
układzie; jeden bezbronny handlowiec przy stolicy. **CC nie pisze plików w trakcie gate'u.***

### §7.0 — PRZYGOTOWANIE: zasianie puli AI i ODCZYT TABELI CELÓW (obowiązkowe)

⚠ **Pula uderzeniowa w realnym zapisie jest najpewniej PUSTA (Finding 208)** — produkcja okrętów
AI stoi, więc bez zasiania kroki §7.3-§7.5 zmierzą ciszę, nie zachowanie.

**(a) Kto, gdzie ma stolicę, co widzi.** ⚠ Rajder MUSI wylądować w **układzie macierzystym
imperium** — filtr puli z Z2 (`strikeReadyVessels`) odrzuca okręty spoza domu, a
`spawnEnemyRaider` domyślnie wybiera *najbliższy inny niż gracza*, co nie musi być domem AI.
```js
KOSMOS.debug.strikeReport('emp_001')      // → ukladMacierzysty, celeWZasiegu, cel{...}, werdykt
```
Zapisz `ukladMacierzysty` — dalej `SYS_AI`.

**(b) Zasiej rajdery — jedno wywołanie = JEDEN okręt.**
```js
['R1','R2','R3'].forEach(n => KOSMOS.debug.spawnEnemyRaider({
  empireId: 'emp_001', systemId: 'SYS_AI', vesselName: n, autoOrder: false }))
```
⚠ `autoOrder: false` jest obowiązkowe — bez niego rajder od razu dostaje rozkaz i **wypada
z puli** (`v.movementOrder` ≠ null), więc kolejne kroki zmierzyłyby pustą pulę.

**(c) ODCZYT PULI — przed KAŻDYM `forceStrike`, bez wyjątku.**
```js
KOSMOS.directorOffensive.strikeReadyVessels('emp_001').map(v => v.name)
```
**Odmowa przy pustej puli nie dowodzi niczego** (lekcja Z2: pin na pustym zbiorze przechodzi
z niewłaściwego powodu).

**(d) TABELA CELÓW — najważniejszy odczyt całego gate'u.**
```js
(() => { const o = KOSMOS.directorOffensive, r = o.strikeReadyVessels('emp_001');
  return o.reachableTargets('emp_001').map(t => ({
    cel: t.body.name, hp: o.estimateDefenderHp(t),
    needed: o.requiredSquadron(t, r).needed, gotowych: r.length })); })()
```
Oczekiwane w Twoim zapisie: **stolica ~210 HP → `needed` 3** · **kolonia wtórna bez obrony →
`needed` 1**. ⚠ **AI uderzy w wiersz o NAJMNIEJSZYM `needed`** (D-199-5) — o tym są kroki niżej
i o tym trzeba pamiętać przy dobieraniu liczby rajderów.

---

**§7.1 — asymetria widoczna PRZED zaufaniem naprawie** (odczyt bazowy, flaga OFF)
```js
(() => { const o=KOSMOS.directorOffensive, w=KOSMOS.warSystem, t=o.pickTarget('emp_001');
  return { cel:t?.body?.name, bronione:t?.defended, hpObroncy:w._buildPlayerBattleUnit(t.systemId).hp }; })()
```
**PASS** = `bronione: false` przy `hpObroncy` ≫ 30 — sprzeczność na żywym silniku.

**§7.2 — cel i próg eskadry** (flaga ON) — `KOSMOS.debug.strikeReport('emp_001')`
**PASS** = werdykt nazywa **liczbę okrętów**, nie boolean; tekst różny od §7.1.

**§7.3 — AI ODMAWIA zamiast ginąć** (`insufficient_squadron`).
Z tabeli §7.0(d) weź **najmniejsze `needed`** — nazwijmy je `N`. Zasiej **`N − 1`** rajderów
(np. dla stolicy `needed 3` ⇒ **dwa**; jeśli masz kolonię wtórną z `needed 1`, patrz uwaga niżej).
```js
KOSMOS.directorOffensive.strikeReadyVessels('emp_001').map(v => v.name)   // ODCZYT PULI — zawsze
KOSMOS.debug.forceStrike('emp_001')
```
**PASS** = `{ launched: 0, reason: 'insufficient_squadron', needed: N, available: N-1, defenderHp }`
i **zero nowych misji** na rajderach. **FAIL** = `launched > 0`.
⚠ **Gdy `N` = 1** (kolonia wtórna bez obrony), tego stanu nie da się pokazać — jeden okręt zawsze
wystarcza. Wtedy albo prowadź §7.3 na zapisie bez takiej kolonii, albo postaw na niej `defense_grid`
Lv1 (podnosi `needed` do 2) i powtórz odczyt (d).

**§7.4 — ⚠ POPRAWKA WŁAŚCICIELA na żywo: BEZ CLAMPA** (`target_beyond_reach`).
Ufortyfikuj do `defense_grid` Lv3 + `defense_tower` Lv5 (**~500 HP ⇒ `needed` 7**).
⚠ **Fortyfikuj to ciało, które tabela (d) pokazuje z NAJMNIEJSZYM `needed`, i powtarzaj odczyt (d),
aż KAŻDY wiersz ma `needed > 3`.** Inaczej AI po prostu ominie twierdzę i uderzy w słabsze ciało —
i **to nie będzie porażka gate'u, tylko wypłata slice'u** (pinowana keeperem T18; tak właśnie
wywróciły się moje własne fixture'y T9/T10 przy implementacji).
```js
// tabela musi mieć min(needed) > 3 PRZED tym wywołaniem
KOSMOS.debug.forceStrike('emp_001')
```
**PASS** = `{ launched: 0, reason: 'target_beyond_reach', needed: 7, defenderHp: ~500 }`.
**FAIL** = `launched: 3` ⇒ clamp wrócił.
⚠ Zasiej przy tym **3 rajdery** — pin ma pokazać, że AI odmawia **mając pełny sufit**, a nie
dlatego, że mu brakuje okrętów.

**§7.5 — batching EAH + zakres wraków** (niemierzalne headless): po realnym uderzeniu
```js
[...KOSMOS.vesselManager._vessels.values()].filter(v=>!v.isWreck)
  .map(v=>({n:v.name, dok:v.position?.dockedAt, wrak:v.isWreck}))
```
**PASS** (przy commicie 3 = V4) = zakres wraków **równy** zakresowi obrońcy; przy V1 — handlowiec
przy stolicy **przeżywa** klęskę przy koloni wtórnej.

**§7.6 — gracz to widzi.** Dziennik: **jedna** linia `⚔` (150/155 mają zostać zamknięte), auto-slow
działa (157 zamknięty). ⚠ Właściciel gra po **EN** — filtruj po prefiksie `⚔`, nigdy po polskim tekście.

**§7.7 — kill-switch.** `defenseScope` OFF ⇒ jednolinijkowiec z §7.1 wraca do bazowych liczb **jako para**.

**§7.8 — zero błędów w konsoli** przez §7.1-§7.7.

⚠ Wszystkie jednolinijkowce sprawdzone **co do kształtu** wobec źródeł (`strikeReport`/`forceStrike`
istnieją `GameScene:655/694`; `window.KOSMOS.directorOffensive` montowany `:469`; `warSystem` `:450`),
ale **nie wykonane na żywej karcie** — ta walidacja należy do slice'u implementacyjnego.

⚠ **DŹWIGNIA FLAGI — `GAME_CONFIG` NIE JEST GLOBALNE.** Poprawny uchwyt to
`KOSMOS.gameConfig.FEATURES.defenseScope` (`GameScene:394` przypisuje `window.KOSMOS.gameConfig =
GAME_CONFIG`, ta sama tożsamość obiektu, `FEATURES` niezamrożone). **Ten sam błąd autora skryptu
złapał już gate Z2** (`f021ccf`) i repo ma na to regułę (`validate-gate-oneliners-on-live-engine`) —
została złamana **po raz drugi, w tym samym miejscu**. Potwierdzone wykonaniem na żywej karcie.

---

## 10a. WYNIK LIVE-GATE'U (2026-08-31, właściciel, na żywo) — **PASS**

| krok | wynik |
|---|---|
| **§7.0** | ✅ `strikeReport` **prawdomówny na pustym imperium**: werdykt „brak okrętu zdolnego do skoku" przy `kadlubyZeSkokiem: 0` — **Finding 208 potwierdzony NA ŻYWO**. Tabela celów odtworzyła matematykę gradowania **co do liczby**: 690 HP → 9 · 730 HP → 10 · 30 HP → 1 (przy `hull_frigate` 120). Zasiany **1** rajder (nie 3 — patrz §7.3) |
| **§7.1** | ⚠ **NIEWYKONALNY w tym zapisie** — uzbrojona flota gracza stoi w `sys_home`, więc sprzeczność „`bronione:false` przy dużym HP" nie ma jak wystąpić. Obie połowy flagi udowodnione **czwórką z §11** zamiast tego |
| **§7.2** | ✅ werdykt nazywa **liczby**, nie boolean |
| **§7.3** | ⚠ **NIEOSIĄGALNY NA ŻYWO w tym zapisie** — drabina ocenia wyłącznie **głowę rankingu wartości** (`needed 9`), więc `insufficient_squadron` nie ma jak wypłynąć, dopóki `sys_home` dominuje. **To jest NOWY DEFEKT → Finding 210**, nie awaria naprawy. Pokryty headless (**T10**); odstępstwo przyjęte |
| **§7.4** | ✅ **PASS w formie MOCNEJ**: `{launched: 0, reason: 'target_beyond_reach', needed: 9, available: 1, defenderHp: 690}` — i to przeciw **PRAWDZIWEJ flocie gracza jako twierdzy**, nie przeciw fixture'owi. **Clamp nie wrócił** |
| **§7.5** | ✅ realna bitwa przy Colony Alioth (przez ręczne `issueAttack`). **Zero wraków gracza — forma SŁABA**: w tamtym układzie gracz nie miał czego stracić. Szew batchowania EAH przećwiczony na żywo. **Bonus:** odczyt R1 po bitwie `{mo: null, last: mo_1 completed, pending: false, inEnc: false}` — zwolnienie rozkazu **VO-3b potwierdzone po PRAWDZIWEJ wygranej bitwie**; pusta pula = filtr układu macierzystego (R1 jest teraz bazą wysuniętą Z2 w `sys_014`, zgodnie z projektem) |
| **§7.6** | ✅ **JEDNA** linia `⚔`, po angielsku, z przetłumaczonymi nazwami, **zwycięzca POPRAWNY przy graczu jako AGRESORZE wojny** (konfiguracja, w której 155/2b się wywracało — naprawa trzyma). Auto-slow zadziałał. ⚪ Obserwacja → **Finding 211** |
| **§7.7** | ✅ `ON [690,9,730,10]` → `OFF [730,2,730,2]` (1. == 3., boolean wrócił) → `ON [690,9,730,10]`, **bez przeładowania**. ⚠ korekta do §11 niżej |
| **§7.8** | ✅ konsola czysta |

### ⚠ Trzy rzeczy, które gate zmienił w tym dokumencie

**(a) `sys_home` jako TWIERDZA to lepszy dowód §7.4, niż planowałem.** Scenariusz zakładał ręczne
fortyfikowanie do `grid Lv3 + tower Lv5`. Na żywo wystarczyła **prawdziwa flota gracza** (690 HP →
`needed 9`), więc odmowa `target_beyond_reach` została zmierzona na stanie, którego nikt nie
spreparował. To jest mocniejsza forma tego samego pinu.

**(b) KOREKTA DO §11 — „druga liczba jest kontrolą" obowiązuje TYLKO dla GOŁEJ koloni wtórnej.**
W zapisie właściciela druga liczba **ruszyła się** (`9 ↔ 2`), bo tamta kolonia jest broniona
**FLOTĄ**, nie budynkami: przy ON gradowanie liczy 690 HP → 9, przy OFF boolean widzi uzbrojony
okręt w układzie → `isDefended = true` → 2. **Ruchoma druga liczba NIE JEST awarią pinu.**
Nieruchoma jest tylko wtedy, gdy kolonia wtórna nie ma **ani** obrony, **ani** floty w układzie.
⚠ Rozstrzygające pozostają: **1. liczba** (zakres) i **równość 1. == 3. przy OFF** (każde ciało ma
tego samego obrońcę). Keeper T17 mierzy wariant GOŁY i dlatego jego kontrola pinu jest tam prawdziwa.

**(c) Dwa kroki okazały się niewykonalne w konkretnym zapisie (§7.1, §7.3) — i to jest własność
ZAPISU, nie naprawy.** §7.1 wymaga koloni bez floty w układzie; §7.3 wymaga, żeby głowa rankingu
była osiągalna. Oba pokryte headless (T1/T14 i T10). ⚠ Przy następnym gate'cie tej rodziny warto
**zacząć od tabeli celów** i dobrać kroki do tego, co zapis w ogóle potrafi pokazać.

---

## 11. Save, kill-switch, dowód flagą

**Save: v101, zero migracji, dla każdego wariantu.** Nic nowego nie persystuje; klucze
`orbitalDominance` bez zmian; kształt `gameState.battles[*]` nietknięty. ⇒ pułapka
„`TitleScene` kasuje zapis przy błędzie migracji" **nie jest w ogóle uzbrajana**.

**Jedna flaga: `GAME_CONFIG.FEATURES.defenseScope`** (default **ON**, konwencja `aiStrikeRecall`).
OFF ⇒ zachowanie sprzed slice'u co do bitu, z regułą eskadry włącznie. ⚠ **Jedna, nie dwie** — dwie
dałyby trzeci, nieokreślony stan „w połowie wyłączone".

**Dowód flipa odczytem stanu** (kształt Z2 `[1,[]] ↔ [0,[...]]`, bez obserwowania zachowania):

⚠ **KOREKTA DO PIERWOTNEJ WERSJI TEJ SEKCJI — para NIE WYSTARCZA, i dowiodło tego wykonanie.**
Planowałem tu `[hp, needed]` czytane na koloni WTÓRNEJ i przewidywałem `[30, 1]` ON / `[210, 2]` OFF.
Druga liczba była błędna: **dwie połowy tej flagi objawiają się na RÓŻNYCH celach.**
Na koloni wtórnej `needed` **nie drgnie** (boolean mówi „niebroniona" ⇒ 1, a gradowanie z 30 HP
też daje 1) — i to nie jest luka, tylko **sam Finding 199**: kolonia bez własnej obrony wygląda
na bezbronną w OBU trybach. Połowa kompetencyjna jest widoczna dopiero na **stolicy**.

```js
(() => { const o=KOSMOS.directorOffensive, w=KOSMOS.warSystem;
  const T = (id) => ({ colony: KOSMOS.colonyManager.getColony(id), body: KOSMOS.entityManager.get(id),
                       systemId: KOSMOS.entityManager.get(id).systemId });
  const SEC='<id koloni WTÓRNEJ>', CAP='<id STOLICY>';
  return [ w._buildPlayerBattleUnit(T(SEC).systemId, SEC)?.hp, o.requiredSquadron(T(SEC)).needed,
           w._buildPlayerBattleUnit(T(CAP).systemId, CAP)?.hp, o.requiredSquadron(T(CAP)).needed ]; })()
// ON  -> [ 30, 1, 210, 3]     ← 1. liczba = ZAKRES        (stolica nie broni już wtórnej)
// OFF -> [210, 1, 210, 2]     ← 4. liczba = KOMPETENCJA   (próg wraca do booleana)
```

Czwórka jest rozstrzygająca: **pierwsza** liczba JEST zakresem, **czwarta** JEST regułą
kompetencji, a przy OFF pierwsza i trzecia muszą być RÓWNE (każde ciało w układzie ma tego
samego obrońcę — definicja stanu sprzed slice'u). Pinuje to `defense_scope_smoke` **T17**,
z kontrolą pinu na drugiej liczbie.

---

## 12. Granice dowodu — czego headless NIE zmierzy

`src/testing/headless/GameCore.js` konstruuje `WarSystem` i `InvasionSystem` (`:197-198`), ale **nie**
`EnemyAttackHandler`, `DeepSpaceCombatSystem`, `MovementOrderSystem`, `ProximitySystem` ani
`DirectorSystem`/`DirectorOffensive`. Keepery mogą je `new`-ować wprost (tak robi `deploy_seams`),
więc **funkcje** są pinowalne — **wpięcie** nie. Konkretnie niemierzalne:

1. **okno batchowania EAH** — `_resolveBatchedBattle` odpala się z `setTimeout(BATTLE_BATCH_WINDOW_MS)`;
   krok „którzy wrogowie wchodzą do jednej bitwy" jest realnoczasowy;
2. **reguła odpalana przez tik Directora** — montaż pinowalny źródłowo (lekcja Findingu 35), **decyzja
   pod żywym zegarem** nie;
3. **`_wreckPlayerVesselsInSystem` na żywym `VesselManager`** z orbitami + rozmieszczenie wraków w rendererze;
4. **czy gracz to zauważy** — linia Dziennika, auto-slow, tekst werdyktu `strikeReport`.

⇒ §7 gate'u celuje dokładnie w te cztery.

---

## 13. Nowe findingi (do rejestru macierzystego `VESSEL_ORDERS_PLAN.md`)

| # | waga | teza |
|---|---|---|
| **201** | 🟠 | **`transport_assault` istnieje, ale nigdy nie dojdzie do desantu — przyczyna Findingu 49 naprawiona, skutek NIE.** `0e6ea0d` domknął połowę katalogową, więc werdykt `AI_DROP_HULL_AUDIT.md` („w katalogu nie istnieje ani jeden wpis z `troop_bay_*`/`drop_pods`") jest **nieaktualny** i wymaga nagłówka korygującego. Zastąpiły go dwie nowe blokady: szablon **nie ma gniazda broni**, więc filtr `hasWeapons` w `strikeReadyVessels` wyklucza go z każdego uderzenia ⇒ `_onVesselGroupVictory` zawsze widzi `droppers.length === 0`; oraz **żadna reguła `DIRECTOR_RULES` go nie nazywa** (`template:` tylko `science_probe`), więc AI go **nie buduje**. ⇒ desant AI pozostaje strukturalnie nieosiągalny. **Podpięte do stałego warunku W3 „katalog transportowca AI" — ten sam temat, ten sam przyszły gate.** |
| **202** | 🟠 | **`targetValue` jest per-UKŁAD, a rankuje cele per-CIAŁO** (`DirectorOffensive:206`). Dwie kolonie w jednym układzie zawsze remisują ⇒ porządek spada na `defended`, a potem na `String(body.id).localeCompare`. To źródło systematyczności biasu z 199 i powód, dla którego V2 degeneruje rozróżnianie celów. ⚠ **ZMIERZONE** (§3.6): sort po booleanie wskazuje cel **trudniejszy**. |
| **203** | 🟠 | **`_wreckPlayerVesselsInSystem` w zakresie UKŁADU przy obrońcy w zakresie CIAŁA.** Dziś utajony; **uzbraja się w chwili, gdy wejdzie D-199-2 = V1 bez D-199-3**. ZMIERZONE: handlowiec przy stolicy ginie po bitwie przy koloni wtórnej, w której nie był liczony. ⚠ **ZAMYKANY RAZEM Z COMMITEM 3** — D-199-2 = V4 czyni go nieosiągalnym (zakres okrętów = zakres wraków). |
| **204** | 🟠 | **Dwa predykaty obecności nie zgadzają się co do tego, kto jest graczem.** `WarSystem.hasPlayerPresenceInSystem:603` filtruje własność; `WarSystem._isPlayerInSystem:556` — bramka `_fleetArrived` — używa **`getAllColonies()` bez filtru właściciela**, więc kolonia **AI** w układzie czyni `playerPresent === true`. Osiągalny tylko ze starej ścieżki flot abstrakcyjnych, dlatego przeżył utwardzenie bliźniaka w W3-4b. Rodzina 97 / 195. |
| **205** | ⚪ | **`battle:orbitalDominance` ma ZERO subskrybentów.** `WarSystem:369` emituje z komentarzem „dla InvasionSystem i UI"; `InvasionSystem` czyta dominację na żądanie przez `getOrbitalController`. Rodzina 197 / `station:orphaned`. |
| **206** | ⚪ | **`defense_tower` ma dwie prace w dwóch zakresach.** Redukcja katastrof per-kolonia (`RandomEventSystem:283`), obrona orbitalna per-układ (`WarSystem:629`); opis budynku obiecuje tylko pierwszą. **ZAMYKA SIĘ Z COMMITEM 3** (V4 — praca orbitalna staje się per-kolonia, tak jak katastroficzna). |
| **207** | ⚪ | **Werdykt `strikeReport` zaszywa regułę eskadry** (`GameScene:684`, `ready.length < 2`) — jest **lustrem** drabiny, nie drabiną, więc skłamie przy pierwszej zmianie progu. Objęty przez D-199-7. |
| **208** | 🟠 | **GATE B2 (a) — produkcja okrętów AI stoi (numer nadany 2026-08-31).** `startShipBuild` zwraca `queued`, a `ORDER_TTL_DISPLAYED_YEARS = 3.0` kasuje zlecenie **cicho** (`director:orderExpired`). **180-182 tego NIE zamknęły** (§4.2): 181/182 naprawiły dostępność komponentów, ale ten wpis jest obserwacją **po** tych fiksach, a jego warunek wstępny — **Finding 178** — jest otwarty (kurier ładuje wyłącznie `MINED_RESOURCES`, trasa jednokierunkowa ⇒ komponenty nigdy nie docierają). ⚠ **Po commicie 2 staje się REALNYM blokerem pętli ofensywnej, przed 154**: AI przestaje ginąć, ale odzyskanie uderzenia wymaga trzeciego kadłuba, którego 208 nie przepuści. |
| **209** | ⚪ | **Dwa komentarze opisują flotę, która nie istnieje.** `WarSystem:597` i `EnemyAttackHandler:120` nazywają obrońcę-widmo *„sto punktów wytrzymałości i ZERO broni"*, a `BattleSystem.normalizeFleet` podstawia mu **laser dmg 5**. Klasa „predykat opisany w komentarzu ≠ predykat egzekwowany" (arc BRAMKA WŁASNOŚCI, reguła 3). Domyka się z commitem 1 (6b). |

---

## 14. Świadomie poza zakresem

- **`_playerVesselsInSystem` + `hasWeapons`** (wariant V4a) — usunęłoby resztkową asymetrię, ale
  obniża HP obrońcy (zmiana balansu, nie higiena). Właściciel wyłączył z zakresu.
- **`playerHasOrbitalDominance` w zakresie ciała** — osobna oś, §6.
- **Obrona planetarna dla kolonii AI** — `COMBAT_DIPLO_AUDIT.md:636`, temat na własny slice.
- **Finding 154** (`_findNearestFriendlyPlanet` bez terminu układu) — **po 208**, zgodnie z podpisem.

---

## 15. Odnośniki

`docs/design/VESSEL_ORDERS_PLAN.md` §199 · §200 (rejestr macierzysty) ·
`docs/design/OPEN_FINDINGS_INDEX.md` · `docs/design/W3_PLAN.md` §Findings 34 ·
`docs/design/AI_RECALL_PLAN.md` (instrument tempa) · `docs/audit/AI_DROP_HULL_AUDIT.md` (⚠ wymaga
nagłówka korygującego — Finding 201) · `docs/audit/COMBAT_DIPLO_AUDIT.md` §2.3 · `VO3B_PLAN.md` §9
(GATE B2 (a) → Finding 208) · `docs/audit/SYSTEM_SCOPE_138_142_AUDIT.md` (rodzina „brak granicy",
kierunek odwrotny).
