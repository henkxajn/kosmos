# AUDYT — Findingi 138 + 142: brak granicy układu przy wyborze celu

> ✅ **SLICE WYKONANY 2026-08-27.** Decyzje podpisane: **D-SS1=W1** (`vessel` jako 4. arg, filtr
> w helperze) · **D-SS2=W1** (fail-OPEN `systemIdOf`) · **D-SS3=W1** (picker keyed na statku) ·
> **D-SS4=TAK** (rodzina recon w zakresie) · **D-SS5=TAK** + **D-SS5b=tylko GRACZ** (obrona
> w głąb w OBU dyspozytorach, AI zwolnione — `PHASE5_TODO` → Finding 153) · **D-SS6=poza slice'em**.
> Keeper `src/testing/smoke/system_scope_orders_smoke.mjs` — **fail-first 12/17 → 31/31 PASS**.
> Sweep **185/185 0 FAIL** · `check-i18n` PASS · zero migracji save (v101) · zero nowych kluczy i18n.
> ⚠ **Live-gate PENDING.** Sekcje §1-§4 opisują stan SPRZED naprawy i tak należy je czytać.
>
> ⚠ **KOREKTA DO §5.2 pkt 4 (metoda dowodu):** `_launch*` **nie jest jednym miejscem**, a
> dyspozytorzy są **DWAJ** — `dispatchOnMission` **i** `redispatchFromOrbit` (`MissionSystem:967`,
> ścieżka dostawy PO SKOKU WARP). Bramka w jednym byłaby nieutwardzonym bliźniakiem na trasie
> legalnej. Odkryte przy implementacji, po podpisie D-SS5; doprecyzowane jako **D-SS5b**.


**Data:** 2026-08-27 · **Save:** v101 (audyt read-only, zero zmian w kodzie gry) ·
**Sonda:** `src/testing/headless/probe-system-scope-138-142.mjs` (uruchamialna, wszystkie liczby niżej
pochodzą z jej wyjścia).
**Rejestr macierzysty:** `docs/design/VESSEL_ORDERS_PLAN.md` §Findings 138 · 142 (oba ZAMKNIĘTE 2026-08-27).
**Klasa:** „globalne id ≠ położenie" — ta sama co W3-4b, `131cc2e` (walka), F-D/F-E (odwrót, dryf).

> ⚠ **Ten dokument NICZEGO nie naprawia.** Odpowiada na trzy pytania: *co dokładnie jest zepsute*,
> *jak bardzo*, i *czy 138+142 łączyć z P3 (151-154)*.

---

## 0. Streszczenie w pięciu zdaniach

1. **138 i 142 to NIE dwa warianty tego samego defektu** — to dwa różne pytania, które kod myli
   z trzecim: 138 pyta „*które ciało leży pod tym punktem*", 142 pyta „*co ten statek może zrobić*",
   a oba odpowiadają danymi **KAMERY**, nie danymi **STATKU**.
2. **Skutki są PRZECIWNE, i to jest sedno:** 138 kończy się **ODMOWĄ** (irytacja), 142 kończy się
   **ZGODĄ** (statek startuje, pobiera paliwo, leci w pustkę własnego układu i melduje przylot).
3. **142 jest cięższe, niż mówi rejestr.** Wpis opisuje „cele, których statek nie dosięgnie"
   (⇒ odmowa). **ZMIERZONE:** dla akcji INNYCH niż transport odmowy nie ma na żadnym szczeblu —
   jest fantomowy lot i przyjęty fantomowy przylot.
4. **„Oczywista" naprawa 138 z rejestru jest błędna** — `getByTypeInSystem` jest **fail-CLOSED**,
   a repo już raz świadomie ją z tego powodu odrzuciło (`RetreatTarget.js:70-72`).
5. **Merge: 138 + 142 TAK (jeden slice), 151-153 NIE, 154 opcjonalnie.** Uzasadnienie w §5.

---

## 1. Finding 138 — snap „leć tutaj" przeszukuje całą galaktykę

### 1.1 Mechanizm

`VesselManager._findBodyNearPoint` (`src/systems/VesselManager.js:3463`) iteruje
`EntityManager.getByType('planet'|'moon'|'planetoid')` — rejestr **PŁASKI, galaktyczny** — i wybiera
ciało najbliższe punktowi w promieniu `SNAP_TO_BODY_AU = 0.5`. Współrzędne są **LOKALNE dla układu**
(gwiazda każdego stoi w `(0,0)`), więc ciała różnych układów zajmują **te same zakresy liczbowe**.

**Jeden producent w produkcji** — `MovementOrderSystem._issueMoveToPoint:795`:

```
„leć tutaj" (punkt) → _findBodyNearPoint auto-przejmuje ciało spod punktu (:793-796)
                    → bramka W3-4b isSameSystem (:803-808) odrzuca → target_other_system
```

⚠ **Bramka jest poprawna. Zepsuty jest snap trzy linie nad nią** — komentarz bramki (`:798-802`)
tłumaczy dokładnie tę lekcję, a wywołanie wyżej ją łamie.

### 1.2 Pomiar — defekt skaluje się z eksploracją, a nie występuje na starcie

Sonda §2: 12 realnie wygenerowanych układów (`SystemGenerator`), ciała ustawione na orbitach,
siatka 10 201 klików w ±25 AU wokół gwiazdy macierzystej.

| układów | ciała obce | klików snapujących | z tego OBCE | % snapów = **odmowa** | % **wszystkich** klików |
|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 138 | 0 | **0,0 %** | 0,0 % |
| 2 | 43 | 228 | 90 | 39,5 % | 0,9 % |
| 3 | 87 | 321 | 184 | 57,3 % | 1,8 % |
| 5 | 207 | 577 | 441 | 76,4 % | 4,3 % |
| 8 | 379 | 907 | 777 | 85,7 % | 7,6 % |
| 12 | 616 | 1359 | 1235 | **90,9 %** | 12,1 % |
| 20 | 1071 | 2002 | 1893 | **94,6 %** | 18,6 % |

**Trzy rzeczy, których nie dało się zgadnąć:**

- **Na starcie partii defekt NIE ISTNIEJE (0 %).** Układy generują się leniwie
  (`StarSystemManager.generateAndRegister`), więc dopóki gracz nie skoczył nigdzie, obcych ciał nie ma.
  ⇒ To defekt **fazy średniej/późnej**, dokładnie tej, w której gracz najwięcej klika po mapie.
- **Kiedy już zaczyna gryźć, DOMINUJE.** Przy 12 układach obcych ciał jest ~10× więcej niż własnych
  w tym samym zakresie współrzędnych, więc obce wygrywa **9 razy na 10 snapów**.
- **Liczba klików, które w ogóle snapują, rośnie 14×** (138 → 2002). Naprawa nie tylko odblokuje
  rozkaz — **zmniejszy też liczbę niechcianych przejęć punktu przez ciało**.

### 1.3 Co JEST bezpieczne (i dlaczego to zmienia priorytet)

- **Klik DOKŁADNIE na własnym ciele: 0/62 przejęć.** Własne ciało ma dystans 0 — nie do pobicia.
  ⇒ Najczęstsza intencja gracza („leć do tej planety") **działa**.
- **14/62** własnych ciał ma jednak obcego rywala w promieniu 0,5 AU ⇒ klik *obok* własnej planety
  potrafi przegrać.

⇒ **138 boli przy klikaniu w PUSTĄ PRZESTRZEŃ**, nie przy klikaniu w cel. To zawęża objaw
i tłumaczy, dlaczego przeżył tak długo.

### 1.4 Widoczność odmowy

Odmowa `target_other_system` idzie do gracza **wyłącznie kanałem Dziennika**
(`RightClickMenu:316-343`, `severity:'warn'`, zmierzone w Findingu 141: `toasty: []`).
Gracz patrzący na mapę widzi **statek, który nie rusza, bez żadnej reakcji**.

---

## 2. Finding 142 — picker misji klucza się na KAMERZE, nie na STATKU

### 2.1 Mechanizm — dwa błędy, nie jeden

`FleetManagerOverlay._getValidTargets` (`:9136`, **jedyny wołający `:8853`**):

- `:9150` `const activeSysId = window.KOSMOS?.activeSystemId` — **oglądany** układ.
- Pętla główna zbiera ciała `activeSysId` i stempluje **na sztywno** `systemId: activeSysId,
  sameSystem: true` (`:9224`, `:9247`).
- Gałąź cross-system (`:9259-9263`) liczy `curSysId = vessel.systemId ?? activeSysId`
  **poprawnie**, ale pomija **OBA** układy: `if (sys.id === activeSysId || sys.id === curSysId) continue`
  z komentarzem *„in-system pokryty wyżej"* — a **nie jest pokryty**, bo wyżej użyto `activeSysId`.

### 2.2 Pomiar (sonda §4) — rejestr opisuje POŁOWĘ defektu

Statek w `sys_home`, `warpFuel.max = 0`, akcja `survey`:

| `activeSystemId` | celów | własne ciała statku | obce ze stemplem `sameSystem` + `reachable` |
|---|---:|---:|---:|
| `sys_home` (= układ statku) | 3 | **3/3** | 0/2 |
| `sys_061` (≠ układ statku) | 2 | **0/3** | **2/2** |

⇒ Rejestr wymienia tylko **fałszywy POZYTYW** („oferuje cele, których statek nie dosięgnie").
Symetryczny **fałszywy NEGATYW jest równie realny: własne, osiągalne cele statku znikają z listy
w całości.** To druga połowa defektu i musi wejść do zakresu naprawy.

⚠ Dodatkowo `reachable` liczone jest przez `_calcDistAU` (`:9313`) = surowy `hypot` na współrzędnych
z **dwóch różnych ramek** ⇒ `reachable: true` na dystansie, który nie istnieje.

### 2.3 ⚠ NAJCIĘŻSZE: dla akcji innych niż transport **nie ma żadnej odmowy** (sonda §5)

Zmierzone na dokładnej ścieżce produkcyjnej `FLEET_ACTIONS.survey.execute`
(`createMission('survey', v, { targetId })`), statek w `sys_home`, cel w `sys_061` przy 9 AU:

```
misji przed/po: 0 / 1                       ⇒ ODMOWY NIE MA NA ŻADNYM SZCZEBLU
lot: start (1.00, 0.00) AU → cel (2.15, 8.74) AU   ← WSPÓŁRZĘDNE WEWNĄTRZ sys_home
dystans rekordu: 8 AU (fikcja — dwie ramki)   paliwo pobrane: 2.80
czy coś tam jest w sys_home?  NIE — statek leci w pustkę
_vesselIsAtTarget(cross-system) = true        ← PRZYLOT ZOSTANIE PRZYJĘTY
```

**Dlaczego nic tego nie zatrzymuje — łańcuch bez ani jednej bramki układu:**

| ogniwo | plik | co robi |
|---|---|---|
| picker | `FleetManagerOverlay:9136` | oferuje obce ciało jako `sameSystem` |
| akcja | `FleetActions.js:81` | `createMission('survey', …, { targetId })` — brak pojęcia układu |
| dyspozytor misji | `MissionSystem:147` | brak bramki układu w `createMission` |
| start | `MissionSystem._launchReconTarget` | dystans = `_calcDistance` (surowy hypot), pobiera paliwo |
| lot | `VesselManager.dispatchOnMission:418-425` | `_predictPosition(cel)` daje x/y **obcego** układu, `_calcRoute` liczy trasę w układzie **statku** |
| przylot | `MissionSystem._vesselIsAtTarget:1600` | `!isSameSystem` ⇒ **`return true`** (świadomy fail-open) |

⚠ `_vesselIsAtTarget` jest fail-open **celowo** i to jest udokumentowane („nie bramkujemy tego, czego
nie umiemy zmierzyć; ta trasa należy do `OrderService`"). Decyzja jest słuszna **pod warunkiem, że
rekord cross-system nigdy nie powstaje**. Picker właśnie łamie ten warunek ⇒ **fail-open zamienia się
w wypłatę za lot, którego nie było** — dokładnie wzorzec, który VO-2 już raz gasił („duch wypłacił
77 minerałów").

⚠ **Skutek ubocznny na fog-of-war:** przyjęty przylot recon oznacza ciało w układzie, w którym gracz
nigdy nie był. Zasięg tego skutku (czy `explored` faktycznie się zapisuje na końcu łańcucha)
**NIE ZOSTAŁ ZMIERZONY** — patrz §7.

### 2.4 Transport zachowuje się INACZEJ — i to jest wskazówka projektowa

Ścieżka `transport`/`transport_passenger` idzie przez `OrderService` (`:2921-2925`), a panel
potwierdzenia (`:8960-8961`) liczy `isCrossSystem` **względem `vessel.systemId`** — czyli **już dziś
wie lepiej niż picker**. Tam skutkiem jest czysta odmowa `not_warp_capable` (połykana — Finding 141),
nie fantomowy lot.

⇒ **W jednym pliku żyją obok siebie dwie odpowiedzi na to samo pytanie.** Naprawa to w dużej mierze
rozszerzenie odpowiedzi, którą panel potwierdzenia już daje, na picker, który jej nie daje.

---

## 3. ⚠ Pułapka naprawy: `getByTypeInSystem` jest fail-CLOSED (sonda §3)

Rejestr 138 proponuje: *„`EntityManager.getByTypeInSystem(type, systemId)` ISTNIEJE (`:82`) i jest
używane gdzie indziej — naprawa to podmiana wywołania + przekazanie `vessel.systemId`."*

**Ta propozycja jest błędna i repo już raz to rozstrzygnęło.** Pomiar:

```
getByType("planet")                     → 1
getByTypeInSystem("planet","sys_home")  → 0   ← ciało bez stempla ZNIKA
getByTypeInSystem("planet", null)       → 0   ← statek w tranzycie warp: pusty zbiór
```

`EntityManager.getByTypeInSystem:82-84` robi `e.systemId === systemId` — twarda równość, **zero
tolerancji na `undefined`**. `RetreatTarget.js:70-72` mówi to wprost:

> „Termin układu przez `systemIdOf` (fail-open jak `SystemScope`), **NIE** przez
> `EntityManager.getByTypeInSystem` — ta ostatnia jest fail-CLOSED i wycięłaby stare encje bez pola
> `systemId`."

**Kontrola pinu (żeby nie przesadzić w drugą stronę):** świeżo wygenerowane ciała **mają** stempel
(0/678 bez `systemId`), a `GameScene._restoreSystem` stempluje `?? 'sys_home'` na wszystkich trzech
typach (`:4388`, `:4419`, planety analogicznie). Jedyne dwa miejsca tworzące ciała to
`SystemGenerator` i restore — obu stempel dotyczy.
⇒ **Ryzyko jest dziś teoretyczne, ale kierunek awarii jest zły**: fail-closed w tej roli znaczy
„statek nie ma dokąd lecieć", czyli **cichy paraliż**, przed którym ostrzega nagłówek `SystemScope.js`.

⇒ **Właściwe narzędzie: `systemIdOf` z `SystemScope.js`** (fail-open) — ta sama decyzja, którą
podjęto dla `bodiesInSystemOf`. Osobno trzeba nazwać zachowanie dla `systemId === null`
(tranzyt warp): tam **pusty zbiór jest poprawny** (statek między układami nie ma „tutaj"),
i `bodiesInSystemOf:82` już dokładnie tak robi.

---

## 4. Nowe znaleziska (ta sama klasa, NIEZAREJESTROWANE)

### 4.1 🔴 `MissionSystem._findNearestUnexplored` — nieutwardzony BLIŹNIAK (sonda §6)

`MissionSystem:2758` czyta `window.KOSMOS.activeSystemId`, a **jego własny bliźniak dwie funkcje
niżej — `_findNearestUnexploredFrom:2782` — robi to POPRAWNIE** (`fromEntity.systemId ?? activeSystemId`).

**ŻYWY**: wołany z `:291`, `:296`, `:1321`, `:1373` — czyli ze ścieżek `deep_scan` oraz recon
`scope='nearest'`, obu wystawionych graczowi przyciskiem.

```
activeSystemId=sys_home → cel: h2   (poprawnie)
activeSystemId=sys_061  → cel: f1   ← statek jest w sys_home
```

⚠ `getUnexploredCount()` (`:264`) ma ten sam defekt w roli **bramki**: przy oglądaniu cudzego układu
odpowiada „są jeszcze niezbadane ciała" na temat **cudzego** układu, i to ona bramkuje przycisk
`deep_scan` (`FleetActions.js:104`).

⇒ Rodzina 142 liczy **trzy** miejsca, nie jedno. Wzorzec **nieutwardzonego bliźniaka** jest
w tym repo powtarzalny (`removeColony:667`, `ReturnJump`, `_launchFoundOutpost`).

### 4.2 🟠 `FleetManagerOverlay._handleFleetEngage:4534` — lista wrogów wg KAMERY

`:4544` filtruje wrogów po `activeSystemId`, a nie po układzie **floty**, po czym sortuje ich surowym
`hypot` od pierwszego członka floty (`:4553-4557`). Flota w innym układzie niż oglądany dostanie listę
celów, których nie widzi. **NIE ZMIERZONE end-to-end** — bramka `isSameSystemStrict` w DSCS
(`131cc2e`) prawdopodobnie zatrzyma skutek w warstwie walki, ale rozkaz i tak zostanie wydany.

### 4.3 ⚪ Korekta do rejestru: odnośniki 154 są przesunięte

Rejestr podaje `FleetManagerOverlay.js:4550` — faktyczne wywołania stoją na **`:4581` i `:4590`**.
(`FleetGroupPanel.js:445` i `FleetCommandPanel.js:384` — zgodne.)

### 4.4 ⚪ `AutoRetreatSystem._findNearestFriendlyPlanet` nie ma już ŻADNEGO wołającego wewnątrz swojego systemu

Grep: zero `this._findNearestFriendlyPlanet` w `AutoRetreatSystem.js`. Metoda „prywatna" żyje
**wyłącznie** jako reach-in trzech plików UI (`ar._findNearestFriendlyPlanet?.(…)`). To zmienia
charakter Findingu 154: to nie jest „defekt w systemie odwrotu", tylko **selektor UI zaparkowany
w cudzej klasie**.

---

## 5. ⇒ ODPOWIEDŹ NA PYTANIE O POŁĄCZENIE Z P3 (151-154)

### 5.1 Rekomendacja

| | |
|---|---|
| **138 + 142 (+ 4.1)** | **JEDEN slice.** Zdecydowanie tak. |
| **154** | **Opcjonalny dodatek** — tani, ta sama warstwa, ale ma własny promień rażenia. Domyślnie: osobno. |
| **151, 152, 153** | **NIE.** Trzy różne powody, żaden nie jest kosmetyczny. |

### 5.2 Dlaczego 138 + 142 to jeden slice

Nie dlatego, że „ta sama klasa" — klasa łączy też 151-153. Dlatego, że dzielą **pięć rzeczy naraz**:

1. **Ten sam gest gracza** — „każ TEMU statkowi lecieć TAM". 138 to gest na mapie 3D, 142 to ten sam
   gest w rejestrze floty. Gracz nie odróżnia tych dwóch dróg; dziś dostaje z nich **sprzeczne
   odpowiedzi** (cicha odmowa vs fantomowy lot).
2. **Ta sama warstwa** — wydawanie rozkazu przez GRACZA. Zero AI, zero walki, zero detekcji.
3. **Ten sam kierunek fail** — oba muszą być **fail-OPEN** (`systemIdOf`), bo cena fałszywego
   negatywu to paraliż floty. To rozstrzygnięcie zapada **raz** dla obu.
4. **Ta sama metoda dowodu** — `VesselManager`, `MovementOrderSystem`, `MissionSystem`
   **i `FleetManagerOverlay` importują się pod node** (zweryfikowane wykonaniem). Oba findingi da się
   pinować **WYKONANIEM**, nie źródłowo. Jeden keeper, jedna atrapa świata dwuukładowego.
5. **Zero migracji zapisu, zero nowych kluczy i18n** (powody `target_other_system`,
   `not_warp_capable` już istnieją w PL i EN).

⚠ **Argument rozstrzygający: rozdzielenie ich jest AKTYWNIE szkodliwe.** Naprawa samego 138 (snap
przestaje łapać obce ciała) sprawia, że klik „leć tutaj" w miejscu obcej planety **przestaje być
odmawiany i staje się dryfem w pustkę** — czyli defekt 142 w innym opakowaniu. Naprawa samego 142
zostawia mapę 3D z ~91 % odmów. **Spójna odpowiedź na pytanie „gdzie ten statek może lecieć" musi
powstać w jednym miejscu.**

### 5.3 Dlaczego 151-153 NIE

| finding | powód wykluczenia |
|---|---|
| **151** `ProximitySystem:187` | **Inny kierunek fail i inna domena.** Ta linia bramkuje nie tylko walkę, ale **DETEKCJĘ i INTEL** (rumor → contact). Decyzja fail-open/closed jest tam **odwrotna** niż w rozkazach (por. `isSameSystemStrict`, `131cc2e`). Wciśnięcie jej do slice'u o rozkazach zmusiłoby do podjęcia w jednym podpisie dwóch przeciwnych decyzji o tym samym pytaniu. Gate też jest inny: fog-of-war, nie ruch. |
| **152** POI | **Inna klasa zakresu: brak POLA, nie zły filtr.** `POIRegistry.js`/`POITypes.js` **nie mają `systemId` w ogóle** ⇒ naprawa = dodanie pola + **migracja zapisu** (v101 → v102). Slice bez migracji i slice z migracją mają różne gate'y i różne ryzyko. |
| **153** `EmpireLogisticsSystem` | **Inny aktor (AI) i NIEZNANA OSIĄGALNOŚĆ.** Rejestr sam to mówi: nieustalone, czy AI zakłada outposty poza układem stolicy. Slice musiałby zacząć od pomiaru, którego 138/142 nie potrzebują (oba już zmierzone). Wrzucenie go tutaj znaczy „gate zmierzy ciszę". |

### 5.4 154 — dlaczego „opcjonalnie", a nie „tak" albo „nie"

**Za:** ta sama warstwa (gest gracza), ten sam objaw (`target_other_system`), a **lekarstwo już
istnieje i jest gotowe do wpięcia**: `RetreatTarget.nearestOwnColonyBodyInSystem` (`:155`) ma
**identyczny kształt zwrotki** `{ colony, planet, distanceAU }` — napisany celowo jako lustro tamtej
funkcji. Trzy podmiany wywołań + retirement osieroconej metody prywatnej (§4.4).

**Przeciw:** dotyka przycisku **używanego w normalnej grze** („Powrót do bazy") na trzech
powierzchniach, z których dwie (`FleetGroupPanel`, `FleetCommandPanel`) nie były przedmiotem tego
pomiaru. `RETREAT_TARGET_PLAN` świadomie zostawił go z **własnym podpisem**, i to była decyzja
właściciela, nie przeoczenie.

⇒ **Domyślnie osobno.** Dołączyć tylko, jeśli właściciel chce zamknąć całą rodzinę
„selektor celu bez terminu układu" jednym podpisem — wtedy jest to jedna z najtańszych pozycji
w rejestrze.

---

## 6. Ograniczenia projektowe dla przyszłej naprawy (bez pisania kodu)

1. **Narzędziem jest `systemIdOf`, nie `getByTypeInSystem`** (§3). Wzorzec: `bodiesInSystemOf:77-92`.
2. **`systemId === null` (tranzyt warp) ⇒ pusty zbiór**, jawnie, z komentarzem — nie przez przypadek.
3. **142 wymaga naprawy w OBIE strony** — nie tylko przestać oferować obce, ale **zacząć oferować
   własne** (`0/3` z §2.2).
4. **Gałąź cross-system musi przestać pomijać `activeSysId`** (`:9263`) — po przecelowaniu na
   `vessel.systemId` warunek `sys.id === activeSysId` staje się fałszywym wykluczeniem.
5. **`reachable` cross-system nie może wynikać z `_calcDistAU`** — surowy hypot na dwóch ramkach.
6. **Bliźniaki liczy się PRZED naprawą, nie po** (§4.1): rodzina 142 to `_getValidTargets`,
   `_findNearestUnexplored`, `getUnexploredCount` — i osobno `_handleFleetEngage`.
7. **Keeper musi pinować WYKONANIEM**, bo się da (§5.2 pkt 4), i musi mieć fixture **dwuukładowy** —
   istniejący `cross_system_targets_smoke` (8/8 PASS) ustawia `activeSystemId === vessel.systemId`
   i dlatego **jest ślepy na cały defekt**. Zarazem: **przejdzie po naprawie bez zmian**, co czyni
   go gotowym strażnikiem regresji „identyczność co do wiersza", którego wymagał `VESSEL_ORDERS_PLAN` §7a.

---

## 7. Granice dowodu — czego NIE zmierzono

- **Nie mierzono live w przeglądarce.** Wszystko powyżej to headless na prawdziwych klasach
  (`SystemGenerator`, `VesselManager`, `MissionSystem`, `FleetManagerOverlay`), nie na atrapach logiki
  — ale klikalność UI (czy gracz realnie dojdzie do pickera dla statku spoza oglądanego układu)
  **nie była przechodzona**. Rejestr 142 twierdzi, że tak, na podstawie sesji live („43 → 61 celów").
- **Nie domknięto łańcucha recon do końca** — sonda dowodzi, że `_vesselIsAtTarget` **przyjmie**
  przylot; nie zmierzono, czy `explored` faktycznie zostaje zapisane na obcym ciele i jakie dokładnie
  łupy padają. To osobny pomiar dla gate'u naprawy.
- **§4.2 (`_handleFleetEngage`) to ODCZYT, nie pomiar.**
- **Nie mierzono 151-153** — wykluczenie z §5.3 opiera się na kształcie kodu i rejestrze, nie na
  własnych pomiarach tych trzech.
- **Rozkład klików w §1.2 jest JEDNORODNY** w ±25 AU. Gracz klika częściej blisko swoich ciał, więc
  kolumna „% wszystkich klików" jest **górnym oszacowaniem**; kolumna „% snapów" jest odporna na to
  założenie i to ona jest właściwą miarą.

---

## 8. Odnośniki

| co | gdzie |
|---|---|
| snap bez terminu układu | `src/systems/VesselManager.js:3463` |
| jedyny producent snapu | `src/systems/MovementOrderSystem.js:795` (bramka `:803-808`) |
| filtr fail-closed | `src/core/EntityManager.js:82` |
| precedens fail-open | `src/utils/RetreatTarget.js:70-92` (`bodiesInSystemOf`) |
| picker misji | `src/ui/FleetManagerOverlay.js:9136` (jedyny wołający `:8853`) |
| stemple `sameSystem: true` | `src/ui/FleetManagerOverlay.js:9224`, `:9247` |
| wykluczenie gałęzi cross | `src/ui/FleetManagerOverlay.js:9263` |
| panel potwierdzenia (POPRAWNY) | `src/ui/FleetManagerOverlay.js:8960-8961` |
| bliźniak recon | `src/systems/MissionSystem.js:2758` vs poprawny `:2782` |
| bramka „układ zbadany" | `src/systems/MissionSystem.js:264` |
| fail-open przylotu | `src/systems/MissionSystem.js:1600` |
| lista wrogów wg kamery | `src/ui/FleetManagerOverlay.js:4534`, filtr `:4544` |
| selektor 154 | `src/systems/AutoRetreatSystem.js:169`; wołający `FMO:4581/4590`, `FleetGroupPanel:445`, `FleetCommandPanel:384` |
| gotowe lekarstwo dla 154 | `src/utils/RetreatTarget.js:155` |
| sonda (wszystkie liczby) | `src/testing/headless/probe-system-scope-138-142.mjs` |
