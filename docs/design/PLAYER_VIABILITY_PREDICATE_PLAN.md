# PLAN — Finding 111 (P1): predykat końca gry ma pytać o ZDOLNOŚĆ, nie o ISTNIENIE

**Data:** 2026-08-20 · **Status:** ⬜ **NIEPODPISANY — zero kodu napisanego.**
**Klasa:** samodzielny P1, **poza** arciem BRAMKA WŁASNOŚCI (D1-D6) i **poza** VESSEL_ORDERS (P0-P5).
**Rejestr źródłowy:** `COLONY_OWNERSHIP_GUARD_PLAN.md` §Findings 111 (tam wpis, tu naprawa).
**Audyty wejściowe:** `docs/audit/WARP_COLONIZE_ROUTE_AUDIT.md` · `docs/audit/COLONIZE_PATH_ZERO_COLONY_AUDIT.md`
(⚠ czytać ZAWSZE ze sprostowaniem w nagłówku — Finding 106).
**Metoda tego planu:** odczyt + **wykonanie headless** (`GameCore` + prawdziwy `Ticker`, sondy
`probe111*.mjs` w scratchpadzie, poza repo). Gra NIE była uruchamiana — live-gate jest warunkiem podpisu.

---

## 1. Defekt w jednym zdaniu

`PlayerViability.hasColonyCapableShip` (`:57`) pyta **„czy istnieje kadłub z modułem habitatu"**,
a `_tickPlayerViability` (`ColonyManager.js:308-317`) zeruje licznik karencji przy każdym tiku, dopóki
`state.ok` ⇒ **dopóki gdziekolwiek stoi taki kadłub, `game:over` nie padnie NIGDY** — nawet gdy ten
kadłub nie może dziś zrobić absolutnie nic.

⚠ **To nie jest poprawka predykatu, to jest powrót D9 na stół.** D9 („koniec gry dopiero przy braku
zdolności odwrócenia") oparto na przesłance zapisanej w `PlayerViability.js:13-15`: *„przy ZERZE kolonii
`canLaunchColony` przechodzi, a przylot zakłada kolonię"*. Finding 106 zmierzył, że to **półprawda**:
bramka przechodzi, **start nie** (`_launchColony:648`). Decyzja stoi więc na fakcie, który opisuje
**bramkę**, a nie **skutek**.

---

## 2. Co zmierzono WYKONANIEM (fakty, nie odczyt)

Wszystko poniżej przez `GameCore` + prawdziwy `Ticker`. ⚠ **Ticker liczy civYears** — 40 „lat" to
3,3 roku gry; pierwszy przebieg dał fałszywe zero, dopóki tego nie policzyłem.

| # | co | wynik |
|---|---|---|
| **M1** | `_launchFoundOutpost` przy ZERZE kolonii, statek **zadokowany, idle** | `canAfford=true` przy `ms.resourceSystem=null` ⇒ start **DARMOWY**; po tickach **kolonie gracza 0 → 1** |
| **M1b** | to samo, statek zadokowany **gdzie indziej** (przeżywa utratę) | **0 → 1** |
| **M3** | misja `colony` **w locie** w chwili utraty wszystkiego | **0 → 1**, statek skonsumowany (`żyje=false`) |
| **M4b** | zwiad (`recon`) po przylocie | `mission=recon` `phase=orbiting_body` `status=on_mission` — **i tak zostaje po kolejnych 60 latach gry** (misja **bezterminowa**) |
| **M5** | dzisiejszy predykat na 6 konfiguracjach | **`ok=true` w KAŻDEJ**, łącznie z dokiem i dryfem |

**Trzy trasy odwrotu przy zerze kolonii są ŻYWE** (M1/M1b, M3 + audyt warp §3):

1. **`mission.type === 'colony'` w locie** → `_processColonyArrival` zakłada kolonię (M3).
2. **`mission.type === 'found_outpost'` w locie** → `_processFoundOutpostArrival` zakłada placówkę (M1).
3. **Przepływ obcego układu** (`interstellar_jump` → `exploration`/`foreign_recon` w `orbiting_body`)
   → przycisk „Kolonizuj" (`FMO:7449` + `:7517-7541`) → `_startForeignColonize` (audyt warp, zmierzone).

**Trasa `_launchColony` OD ZERA jest martwa** (`:648`, twardo, keeper `ai_capture_last_stand` T2). ✅ D9.

---

## 3. 🔴 ZNALEZISKO, KTÓREGO NIE ZAMAWIANO — nieutwardzony BLIŹNIAK bramki D9

`_launchColony` (`:648`) — **twarda** bramka: `if (!this.resourceSystem || !canAfford(...)) return;`
`_launchFoundOutpost` (`:744`) — **miękka**: `if (this.resourceSystem) { this.resourceSystem.spend(totalCost); }`
`canFoundOutpost` (`:242`) — **miękka**: `if (resSys) canAfford = resSys.canAfford(totalCost);`
(bez magazynu `canAfford` zostaje `true` z inicjalizacji ⇒ `check.ok` przechodzi).

⇒ **Przy odpiętym magazynie założenie PLACÓWKI jest darmowe i działa** (M1: 0 → 1). To dokładnie ta
sama miękka bramka, którą AC-8 utwardziło w `_launchColony`, z tym samym komentarzem w kodzie
(*„dawałoby darmowy start i cicho odwracało tę decyzję"*) — tyle że **bliźniak został nietknięty**.
⚠ Ta sama klasa co `removeColony:667` w bloku P0: *nieutwardzony bliźniak jest ŻYWY, nie teoretyczny*.

**Osiągalność z UI** (nie tylko z silnika): `FLEET_ACTIONS.found_outpost.canExecute` (`FleetActions.js:248`)
wymaga `docked` + `idle` + zdolności cargo + techu `exploration` + `_checkPad`. ⚠ `_checkPad` (`:33-37`)
dla **małego kadłuba zwraca `true` bez sprawdzania czegokolwiek**, a dla większego pyta o port
**koloni z `vessel.colonyId`** — czyli po utracie o ex-dom, który dziś należy do wroga i port ma.
Dalej `_openOutpostBuildingPicker` (`FMO:2709`) bierze magazyn z `_getVesselColony` — **stację
(depot) albo tę samą kolonię wroga**. ⇒ trasa jest wąska, ale **realna i klikalna**.

⚠ Kolejka `pendingOutpostOrders` **nie jest czwartą dziurą**: `_tickPendingOutpostOrders`
(`ColonyManager.js:2003`) kończy na `EventBus.emit('expedition:foundOutpostRequest')` ⇒ wpada w ten
**sam** chokepoint. Jedno utwardzenie zamyka obie ścieżki.

---

## 4. Projekt predykatu — i dlaczego NIE pyta o paliwo ani o trasę

**Pytanie, na które ma odpowiadać:** *czy ten konkretny statek ma DZIŚ wyjście kończące się kolonią gracza.*

```
COLONY_OUTLET_MISSIONS = { 'colony', 'found_outpost' }              // PRZYLOT tworzy kolonię
FOREIGN_FLOW_MISSIONS  = { 'interstellar_jump', 'exploration', 'foreign_recon' }   // panel obcego układu

hasLiveRecolonizationPath(v):
    types = [ v.mission?.type , v._suspendedMission?.type ]         // ⚠ OBA, patrz gotcha (a)
    (1) którykolwiek w COLONY_OUTLET_MISSIONS                      → true   (BEZ wymogu habitatu)
    (2) canColonize(v) AND którykolwiek w FOREIGN_FLOW_MISSIONS    → true
    inaczej                                                        → false
```

**Zmierzone na prototypie (M5) — 6 konfiguracji, wszystkie zgodne z projektem:**

| konfiguracja | `mission` | dziś | prototyp |
|---|---|---|---|
| zadokowany (gdziekolwiek) | `null` | ✅ liczy | ❌ **nie liczy (FIX)** |
| dryf po `moveToPoint` | `null` | ✅ liczy | ❌ **nie liczy (FIX)** |
| orbita po zwiadzie (**bezterminowa**, M4b) | `recon` | ✅ liczy | ❌ **nie liczy (FIX)** |
| misja `colony` w locie | `colony` | ✅ | ✅ |
| misja `found_outpost` w locie | `found_outpost` | ❌ **nie liczyła** | ✅ **(luka domknięta)** |
| po warpie, panel obcy | `exploration` | ✅ | ✅ |
| misja `colony` zawieszona rozkazem ruchu | `move_to_point` | ✅ | ✅ (przez `_suspendedMission`) |

### Cztery rozstrzygnięcia projektowe, każde kupione pomiarem

**(a) ⚠ `??` JEST TU BŁĘDEM — muszą być OBA pola.** Rozkaz ruchu **podmienia** `vessel.mission`,
a prawdziwą chowa w `vessel._suspendedMission` (`MovementOrderSystem.js:156`). Prototyp napisany jako
`v.mission ?? v._suspendedMission` **przepuścił zawieszoną misję `colony` jako `false`** (zmierzone) —
bo `mission` jest prawdziwe (`move_to_point`) i fallback nigdy nie strzela. To jedyny **fałszywy
negatyw**, jaki znalazłem w projekcie predykatu, i wyszedł dopiero na pomiarze.

**(b) BRAK terminu PALIWOWEGO — świadomie.** Paliwo jest pobierane **z góry przy starcie**
(`VesselManager.js:429-432`), a stranding *„emituje wyłącznie sygnał — niczego nie blokuje"*
(`:521-524`). Statek na misji **doleci niezależnie od stanu baku**. Co więcej, `_redirectInterstellarVessel`
paliwo **klampuje do zera zamiast odmawiać** (Finding 103). ⇒ termin paliwowy dokładałby **fałszywe
negatywy** na jedynych żywych trasach. „Czy paliwa wystarczy" jest tu **niepytalne**, bo silnik o to nie pyta.

**(c) BRAK terminu TRASY/ZASIĘGU.** Trasa liczona jest przy starcie i zamrożona w misji; przylot jest
sterowany zegarem (`_checkArrivals:1451`). Nie ma czego sprawdzać po fakcie.

**(d) Klasyfikujemy po TYPIE MISJI, nie po `status`/`position.state`.** Bo `status='on_mission'` +
`state='orbiting'` opisuje **i** zwiadowcę zaparkowanego na wieczność (M4b — nic nie może), **i** statek
w obcym układzie z żywym panelem (może wszystko). Stan ich nie rozróżnia; typ misji tak.
⚠ **Odrzucona alternatywa „licz każdy statek z żywą misją" (`mission != null`)** — prostsza o jeden
termin, ale **M4b ją zabija**: zwiadowca-kolonizator orbituje z `mission=recon` bezterminowo, więc
limbo zostałoby otwarte, tylko w innym kształcie.

### Czystość modułu — bez nowych zależności

⚠ `mission` i `_suspendedMission` to **POLA STATKU**, nie systemy. Predykat czyta je tak samo, jak dziś
czyta `modules`, `isWreck`, `canDropTroops`. `ColonyManager._tickPlayerViability:311` **już dziś podaje
całe encje** (`[...vesselManager._vessels.values()]`), więc **call-site nie wymaga ani jednej zmiany**,
a `PlayerViability.js` zostaje czysty (jeden import, `canColonize`) — zgodnie z nagłówkiem modułu.

⚠ **Nazwa też jest częścią defektu:** `hasColonyCapableShip` mówi *capability*, a ma znaczyć
*opportunity*. Proponowana nazwa `hasLiveRecolonizationPath`. Zmiana jest darmowa — grep pokazuje
**zero** konsumentów poza tym plikiem (keeper importuje wyłącznie `canReverseFate`/`describeNoReversal`).

---

## 5. ⛔ SCOPE STOP — druga zmiana jest DECYZJĄ, nie implementacją

> **Zlecenie mówiło: zatrzymaj się, jeśli wyjdzie więcej niż jedna/dwie funkcje. Wyszło DOKŁADNIE
> na tej granicy — i druga funkcja leży w innym pliku oraz zmienia REGUŁĘ GRY, nie kod.**

**Te dwie zmiany są SPRZĘŻONE i nie wolno wpuścić samej pierwszej.** Jeśli zawęzimy predykat, a
`_launchFoundOutpost` zostawimy miękki, to gracz mający **zadokowany frachtowiec** dostanie
`game:over`, **choć trasa placówki była żywa** (M1: 0 → 1). To jest **fałszywy negatyw** — dokładnie
ta klasa błędu, którą właściciel nazwał gorszą od dzisiejszej.

### DECYZJA D-111 — czy „start z zera zabroniony" (D9) obejmuje PLACÓWKĘ?

- **W1 — REKOMENDOWANE: TAK. Utwardzić `_launchFoundOutpost` bliźniaczo do `_launchColony`.**
  Kod zaczyna mówić to, co mówi podpisana decyzja. ⚠ **Zasięg zmiany jest chirurgiczny:** przy ≥1 koloni
  `canFoundOutpost` już dziś odmawia przez `check.canAfford`, więc **zachowanie zmienia się WYŁĄCZNIE
  przy `resourceSystem == null`** — czyli dokładnie w stanie zera kolonii. Zwykła gra: **bit w bit**.
  ⇒ Predykat zostaje czysty i mały; trzy żywe trasy to konsekwentnie „to, co JUŻ ruszyło".
- **W2 — NIE. Placówka to świadoma deska ratunku.**
  Wtedy predykat musi liczyć też **zadokowane** frachtowce, a to wymaga wiedzy o porcie
  (`hasSpaceportAt`), techu i zawartości magazynu stacji — czyli albo **koniec czystości** modułu, albo
  **trzecia zmieniona funkcja** (`_tickPlayerViability` liczy flagę i wstrzykuje ją do migawki).
  ⚠ Dodatkowo staje się to **nierozstrzygalne**: przy pustym depocie picker idzie w `pending`
  (`FMO:2723`), a zlecenie ląduje w kolejce **koloni wroga** — czyli „może" zależy od stanu, którego
  predykat nie widzi. **Odradzam.**
- **W3 — ODŁÓŻ CAŁOŚĆ.** 111 zostaje otwarte. Uczciwa opcja, jeśli właściciel nie chce dziś ruszać D9.
  ⚠ **Nie wolno** wziąć „tylko predykatu" bez D-111 — patrz akapit o sprzężeniu.

**Budżet przy W1:** `PlayerViability.js` (1 predykat + 1 gałąź powodu) · `MissionSystem._launchFoundOutpost`
(1 warunek) · keeper. **Zero migracji save (v101), zero nowych kluczy i18n** (`detail` to token audytowy,
nie tekst UI).

---

## 6. Fałszywy alarm — analiza, o którą zlecenie prosiło wprost

**Zabezpieczenie STRUKTURALNE, ważniejsze od wszystkich poniższych:** predykat jest w ogóle pytany
**tylko przy `getPlayerColonies().length === 0`** (`ColonyManager.js:308`), a **placówka też liczy się
jako kolonia**. ⇒ scenariusz z zlecenia — *„gracz ma jeszcze inną kolonię, więc zaraz wyda rozkaz"* —
**nigdy nie dociera do predykatu**. Fałszywy alarm może się urodzić wyłącznie przy dosłownym zerze.

| ryzyko | werdykt |
|---|---|
| Zawieszona misja `colony` (rozkaz ruchu) | **domknięte** terminem `_suspendedMission` (§4a) — zmierzone |
| Zadokowany frachtowiec + żywa trasa placówki | **domknięte przez W1**; przy W2/W3 **otwarte** (§5) |
| Kolonizator zaparkowany, gracz „zaraz coś wyda" | **nie jest fałszywym alarmem:** przy zerze kolonii nie ma czego wydać — `_launchColony` odmawia twardo (Finding 106) |
| Nowa trasa kolonizacji dodana w przyszłości | **realne ryzyko wyliczanki.** Mitygacja: komentarz przy obu zbiorach + keeper pilnujący, że każdy producent misji kończącej się kolonią jest w zbiorze |
| Misja `colony` do ciała, które zginęło w locie | fałszywy **pozytyw**, **ograniczony**: przylot rozlicza misję, statek parkuje, predykat gaśnie, karencja startuje. Bezpieczny kierunek |
| D1 (gracz klika kolonię AI → magazyn wroga → start „od zera") | poza zakresem; a i tak **nie kończy się fałszywym negatywem**: udany start tworzy misję `colony`, którą predykat liczy |

⚠ **Znany, ŚWIADOMIE ZOSTAWIONY fałszywy pozytyw — gałąź DESANTU.** `hasDropCapableShip` +
`hasTransportableTroops` zostają **istnieniowe** (podpisane D9, reguły 1 i 3 w nagłówku modułu).
Zmierzone: `transferColony` **w ogóle nie dotyka jednostek naziemnych** (przepisuje tylko `tile.owner`),
więc oddziały gracza **przeżywają** na zdobytym ciele. ⇒ **jeśli gracz ma gdziekolwiek statek z
`drop_pods` I jakikolwiek żywy oddział, gra nadal się nie skończy.** To nie jest przeoczenie tego planu —
to inna, wcześniej podpisana decyzja. ⚠ **Właściciel musi to wiedzieć przed gate'em**, inaczej naprawa
111 zostanie na żywo odczytana jako niedziałająca. Ewentualne zawężenie tej gałęzi = **osobny podpis**
i trudniejszy pomiar (pytanie „czy da się załadować oddział z ciała wroga" jest otwarte).

---

## 7. Diagnostyka — powód musi rozróżniać DWA różne światy

Dziś `describeNoReversal` zna tylko `no_colony_ship`. Po zawężeniu ten sam token opisywałby dwa
zupełnie różne stany: *„nie ma żadnego kadłuba"* oraz *„kadłub jest, ale zaparkowany"*. Gate mierzyłby
wtedy ciszę tam, gdzie system ma coś do powiedzenia — a to jest reguła, którą arc W3 zapisał wprost.

⇒ `recolonization` dostaje **dwa** pola: `hull` (kadłub z habitatem istnieje) i `ship` (istnieje ŻYWA
trasa). Token: `no_colony_ship` przy `!hull`, **`colony_ship_no_route`** przy `hull && !ship`.
⚠ `detail` ląduje na ekranie końca gry, a ten ekran **nie umie zawijać tekstu** (Finding 112).
Najdłuższy nowy ciąg: `no_drop_ship+no_ground_troops+colony_ship_no_route` = **49 znaków**, czyli
praktycznie tyle samo co dotychczasowy rekord tego ekranu — **nie pogarsza 112, ale i nie naprawia**.

---

## 8. Keeper — dwie asercje trzeba ŚWIADOMIE ODWRÓCIĆ

`src/testing/smoke/ai_capture_last_stand_smoke.mjs` **pinuje dziś defekt**:

- **T4** — `canReverseFate({ vessels:[colo] }).ok === true` dla gołego `{ modules:['habitat_pod'] }`
  (statek bez żadnej misji). **Odwrócić** + dołożyć wariant z żywą misją jako kontrolę pinu.
- **T5 KONTROLA PINU A** — „statek kolonizacyjny wstrzymuje koniec gry **BEZTERMINOWO** (3× karencja)"
  na statku **zadokowanym bez misji**. To jest dosłownie zdanie z Findingu 111. **Odwrócić:**
  zaparkowany → gra się **kończy**; kontrolą pinu zostaje **ten sam statek z misją `colony`** (i tam
  „bezterminowo" jest prawdą).

⚠ Precedens świadomego odwracania keepera jest w tym repo (`deploy_seams` T1/T2/T4,
`s34c_z9_transfer_dispose`) — **odwrócenie musi być opisane w komentarzu keepera**, inaczej następna
sesja przywróci defekt „naprawiając regresję".

**Nowe przypadki (proponowane, wszystkie wykonaniem na `GameCore`):**
`colony` w locie → 0→1 i predykat `true` · `found_outpost` w locie → 0→1 i predykat `true` (⚠ **statek
bez habitatu** — pilnuje, że gałąź (1) nie wymaga modułu) · `recon`-orbita (M4b) → predykat `false`
mimo `status='on_mission'` · zawieszona `colony` → `true` (**pin na `??`**, §4a) · przy W1: start
placówki od zera **ODMÓWIONY**, kolonie 0 → 0 (bliźniak T2) · kontrola pinu: przy żywej koloni start
placówki **DZIAŁA** (utwardzenie nie wyłącza mechaniki).

---

## 9. Warunki podpisu

1. ☐ **D-111 rozstrzygnięte** (W1 / W2 / W3). Bez tego nie zaczynamy — W1 i W2 dają **inny predykat**.
2. ☐ Zgoda na **odwrócenie T4 + T5A** w keeperze (to nie jest regresja, to jest naprawa pinu).
3. ☐ Przyjęcie do wiadomości §6 — **gałąź desantu zostaje istnieniowa**, więc po naprawie gra nadal
   może się nie kończyć przy „statek desantowy + ocalały oddział".
4. ☐ Potwierdzenie, że `no_colony_ship` → `colony_ship_no_route` w `detail` jest OK (§7).
5. ☐ Karencja **zostaje 12 civYears** (`ColonyManager:1293`) — rekomendacja: nie ruszać. Predykat mierzy
   teraz „trasa żyje", a każda nowo powstała trasa (przylot warpu, start misji) **natychmiast** zeruje licznik.

**Plan wykonania po podpisie:** 1 commit kodu (predykat + powód + przy W1 bramka placówki) →
1 commit keepera → sweep + `check-i18n` → **live-gate**. Zero migracji (v101).

**Live-gate (minimum, na ŚWIEŻEJ partii):**
(§1) stracić wszystko z **zaparkowanym** kolonizatorem ⇒ po ~1 roku wyświetlanym pada ekran końca gry,
a `player:noReversalPossible` niesie `colony_ship_no_route` ·
(§2) **kontrola pinu:** to samo z kolonizatorem **w locie na misji `colony`** ⇒ gra się **nie kończy**,
a przylot daje kolonię (`getPlayerColonies()` 0 → 1) ·
(§3) przy W1: przycisk placówki z zadokowanego frachtowca przy zerze kolonii ⇒ **odmowa z powodem**,
misji przed/po **0/0** · (§4) zwykła gra: budowa placówki przy żywej koloni **bez zmian**.
⚠ **Dowodem jest SKUTEK, nie bramka** (lekcja Findingu 106): liczyć kolonie i misje, nie klikalność.
⚠ **`KOSMOS.debugLog` nie zna zdarzeń floty ani misji** — śladu szukać w Dzienniku oraz w
`player:noReversalPossible` (ten JEST w `TRACKED_EVENTS`), a odczyt zbierać **w tej samej karcie**
(debugLog nie przeżywa restartu sceny — Finding 114).

---

## 10. Świadomie POZA zakresem

Gałąź desantu (§6) · **D1-D6** z `COLONY_OWNERSHIP_GUARD_PLAN.md` · **VESSEL_ORDERS P0-P5** (naprawi
*przesłankę* — zaparkowany statek odzyska realne rozkazy — ale **nie dotknie predykatu**; po tamtym arcu
zbiory z §4 trzeba będzie **przejrzeć ponownie**, nie przepisać) · **Finding 102/107** (kolonizacja
„obca" gubi lock załogi i osierocą desant — ta sama trasa, inny defekt) · **Finding 103** (przekierowanie
po warpie omija bramkowanie startu) · **Finding 106** (ślepy zaułek trasy zadokowanej — po W1 zostaje
ślepy **zgodnie z D9**, ale UI nadal nie mówi dlaczego) · **112/113** (ekran końca gry: brak zawijania,
zahardkodowany polski) · rozważenie, czy `transferColony` powinien cokolwiek robić z jednostkami
naziemnymi gracza (§6, obserwacja bez werdyktu).
