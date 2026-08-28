# VO-3b — rozkaz domyka się i ZWALNIA statek (D-VO1b)

> **Status:** PODPISANY 2026-08-26 (D-VO1b-1 … D-VO1b-6). Save **v101, zero migracji**.
> Slice arca **VESSEL_ORDERS**; rodzic decyzji: `VESSEL_ORDERS_PLAN.md` §3.1.3 (D-VO1b = **W1 ROZDZIELONE**).
> **To JEDYNA zmiana balansu w całym arcu** — dlatego osobny commit i własny **GATE B2** mierzący
> TEMPO, nie poprawność.

**Jedno zdanie.** `vessel.movementOrder` **nigdy nie jest zerowane w kodzie produkcyjnym**, więc
domknięty rozkaz zostaje na statku na zawsze — a trzy pule (uderzeniowa AI, doktrynalna AI,
logistyczna gracza) bramkują SAMO ISTNIENIE tego pola. Skutek: **okręt po PIERWSZYM ukończonym
rozkazie już nigdy nie wraca do żadnej z nich.**

---

## §1 Inwentarz — cztery przejścia terminalne, zero zerowań

| przejście | miejsce | co ustawia | co NIE robi |
|---|---|---|---|
| `completed` (pursue/intercept) | `MOS._completeOrder:1434-1437` | `status`, `completedYear`, `_byVessel.delete` | — |
| `completed` (przylot: moveToPoint / goToPOI / **attack**) | `MOS._onVesselArrived:2039-2042` | j.w. + **`mission=null`, `status='idle'`** | — |
| `blocked` | `MOS._blockAndCancel:1518-1521` | `status`, `blockReason` | — |
| `cancelled` | `MOS.cancelOrder:1792-1794`, `_onVesselWrecked:2076` | `status`, `blockReason` | — |

Jedyne `movementOrder = null` w repo: fabryka (`Vessel.js:278`), `SaveMigration` (default),
`SpawnTestEnemy:670` (debug). **W produkcji ani jednego.**

⚠ **MARKER PRZEŻYWA ZAPIS.** `VesselManager.serialize:1326-1334` robi pełną głęboką kopię ze
`status`, a `_indexExistingOrders:116` poprawnie pomija nie-`active` — więc **indeks jest czysty,
a lepki marker zostaje**. Wykluczenie z pul jest trwałe przez całą partię i przez wszystkie zapisy.
(To zarazem SPROSTOWANIE potocznej diagnozy „po wczytaniu `_byVessel` jest puste, więc rozkazy giną" —
patrz Finding 140.)

---

## §2 Konsumenci — przejrzane WSZYSTKIE 29 plików czytających `movementOrder`

**Bramkują `status` (odporne; VO-3b ich nie dotyka):** `ThreeRenderer:5122` (stożek predykcji) ·
`VesselManager:2191` (`isOrderControlled`) · `OrderTargetInfo:64` · `TooltipContent:94` ·
`NavPeekProviders:265` · `FleetPictureLogic:237,476` · `FleetGroupPanelLogic:113` (`countActionable`) ·
`FMO:8225` (label — chowa `completed`/`cancelled`) · `FMO:8301` (przycisk anuluj) ·
`TacticalDockLogic:156` (`active`|**`blocked`**) · `MOS` wewnętrznie (`:362`, `:1901`).

**Czytają samo istnienie albo `type` — mylą się dziś:**

| # | konsument | skutek lepkiego markera |
|---|---|---|
| 1 | `DirectorOffensive:83` | 🔴 okręt AI **na zawsze** poza pulą uderzeniową |
| 2 | `DirectorDoctrine:270` | 🟠 na zawsze poza pulą doktrynalną |
| 3 | `TransportOrderSystem:550` | 🟠 **Finding 119** — statek gracza na zawsze poza pulą logistyczną |
| 4 | `FleetGroupPanelLogic:86` (`orderKey`) | 🟠 **Finding 137** — panel pokazuje domknięty rozkaz jako bieżący |
| 5 | `FMO:3898` | 🟠 badge `[own]` („player override") świeci wiecznie |
| 6 | `DSCS:217` (`isPlayerIntent`) | 🟠 martwy `engage` na zawsze omija team-up gather |
| 7 | `DSCS:811` | 🟠 martwy `engage` wiecznie priorytetyzuje cel |
| 8 | `VCS:201` (`_hasEngageIntentBetween`) | 🟠 lustro #6 (gałąź uśpiona flagą, ale utrzymywana) |
| 9 | `DSCS:938` (`isRetreating`, **D-FDd**) | 🔴 marker odwrotu nie wygasa — **Z1** |
| 10 | `VesselManager:1783` (`PURSUE_DRAIN_MULT`) | ⚪ **UŚPIONE** — `enduranceDrainActive:false` daje early-return (`:1768`); ożyje przy M3 |
| 11 | `ThreeRenderer:5809` (`_orderLineColor`) | ⚪ kosmetyka |
| 12 | `MovementOrderCancellation:31` | ⚪ zwraca `mos_rejected` zamiast `no_order` |

⚠ **D-VO1b-6: NIE dotykamy żadnego z tych predykatów.** Wszystkie są poprawne pod warunkiem, że
marker mówi prawdę. Naprawiamy ŹRÓDŁO, nie dwunastu czytelników.

---

## §3 POMIARY WYKONANE PRZED KODEM (sondy w scratchpadzie, poza repo)

Na **produkcyjnym** `DirectorOffensive.launchStrike` i prawdziwym łańcuchu
`vessel:arrived → MOS._onVesselArrived`.

⚠ **Pierwsza sonda wyszła JAŁOWO i złapała to kontrola.** Punkt docelowy snapował się przez
`VesselManager._findBodyNearPoint` do ciała z OBCEGO układu (**Finding 138, zaobserwowany na żywo**),
wszystkie rozkazy odpadły na `target_other_system`, a pula została na 4 — czyli sonda mierzyłaby
ciszę. Powtórzone z jawnym `targetBodyId` (obejście udokumentowane w rejestrze).

### Pomiar 1 — mechanizm (pula uderzeniowa)

```
start:                     strikeReady 4
po 1 domkniętym rozkazie:  strikeReady 0     ← lepkie
po ręcznym wyzerowaniu:    strikeReady 4     ← kontrola pinu
```

### Pomiar 2 — ⚠ KOREKTA TEZY PLANU RODZICA

**Uderzenie cross-system NIE zakłada `movementOrder`.** `OrderService.issueAttack` idzie
w `_beginComposite` → statek dostaje `pendingOrder` + misję `interstellar_jump`, marker zostaje
`null` (ZMIERZONE). Marker zakłada dopiero **DRUGI ODCINEK**: `_maybeDeliver:255-259` wydaje
`type:'attack'` przez MOS, gdy statek jest już w układzie celu.
⇒ **rajder kończy uderzenie ZAPARKOWANY W UKŁADZIE GRACZA, z domkniętym markerem.** To jest reżim,
w którym mieszka cała zmiana tempa — i to jest źródło **Z2**.

### Pomiar 3 — TEMPO w tym reżimie (3 rajdery w układzie gracza, 10 odpaleń reguły)

```
A. DZIŚ:       3 uderzenia   [3,0,0,0,0,0,0,0,0,0]   odmowy: no_warp_capable_hull ×9
B. PO VO-3b:  30 uderzeń     [3,3,3,3,3,3,3,3,3,3]   odmowy: BRAK
                                                     paliwo: NIETKNIĘTE (bypassFuelCheck)
>>> SUFIT: ×10 — i NIC tego nie hamuje
```

⚠ **To SUFIT, nie realizowana częstość.** Sonda woła akcję wprost, omijając `roll` i cooldown.
W żywej grze hamulcem jest `DirectorRuleData:250-254`: **`cooldown: 5.0 lat`** + `roll` 20 % start /
+15 pp rok / cap 100 %, × mod agresji (`DirectorSystem:175-176` egzekwuje). Uczciwe przełożenie:

> **dziś:** jeden kadłub AI dostarcza **dokładnie JEDNO** uderzenie w całym swoim życiu.
> **po VO-3b:** ta sama trójka uderza **raz na 5 lat bez końca** — z pozycji wysuniętej, bez skoku
> i bez paliwa.

### Pomiar 4 — strona gracza (Finding 119), pojedynczy czynnik wyizolowany

Predykat puli wymaga TAKŻE `state==='docked'`, więc dokuję statek w obu wariantach — inaczej
mierzyłbym dwie rzeczy naraz:

```
frachtowiec (cargoMax 1200) w puli przed rozkazem:   1
po domkniętym rozkazie:                              0     ← Finding 119
zadokowany + marker ZOSTAJE:                         0
zadokowany + marker ZEROWANY:                        1     ← jedyna zmienna to marker
```

⚠ **Pula doktrynalna NIE wraca od samego zerowania** (zmierzone 4 → 0 → **0**): `DirectorDoctrine:269`
wymaga dodatkowo `dockedAt === capitalId`, a po locie statek stoi gdzie indziej. **Efekt VO-3b jest
skoncentrowany w `DirectorOffensive`** — to ZAWĘŻA ryzyko balansowe i jest dobrą wiadomością dla B2.

### Pomiar 5 — marker odwrotu (wejście do Z1)

```
isRetreating w locie:          true
status rozkazu po przylocie:   completed
isRetreating PO PRZYLOCIE:     true    ← DSCS._allOutsideOf czyta BEZ bramki statusu
isRetreating po wyzerowaniu:   false
```

---

## §4 Decyzje PODPISANE (D-VO1b-1 … D-VO1b-6)

| id | decyzja | wariant |
|---|---|---|
| **D-VO1b-1** | Zerować przy **WSZYSTKICH** stanach terminalnych (`completed`/`blocked`/`cancelled`), nie tylko `completed` — inaczej pule zostają zatkane przez anulowane rozkazy | **podpisane** |
| **D-VO1b-2** | **Archiwizacja przed czyszczeniem**: `vessel.lastOrder` (**RUNTIME-ONLY, NIE serializowane** ⇒ zero migracji) zachowuje `blockReason` i resztę — Finding 139 mówi, że to **jedyny ślad**, kto anulował rozkaz | **podpisane** |
| **D-VO1b-3** | **NIE zerować w trakcie AKTYWNEGO STARCIA** (`dscs._findActiveEncounterContaining`) — obrona świeżo zamkniętego D-FDd (Z1) | **podpisane** |
| **D-VO1b-4** | **Z2 POZA ZAKRESEM**, ale **jawnie nazwane w wyniku GATE B2** — nie ukryte | **podpisane** |
| **D-VO1b-5** | **Prawdomówna odmowa**: pusta `strikeReadyVessels` dostaje własny powód, nie `no_warp_capable_hull` | **podpisane** |
| **D-VO1b-6** | Zakres: **tylko zerowanie + archiwum**. Żadnego dotykania predykatów pul | **podpisane** |

---

## §5 Kształt

**JEDEN punkt zwalniania — `MovementOrderSystem._releaseOrder(vessel, order)`**, wołany ze
**wszystkich czterech** miejsc terminalnych z §1. Zero logiki rozproszonej po czterech ścieżkach:

```
_releaseOrder(vessel, order):
    vessel.lastOrder = order          # D-VO1b-2, runtime-only archiwum (blockReason przeżywa)
    if _inActiveEncounter(vessel):    # D-VO1b-3 — Z1
        _pendingRelease.add(vessel.id)   # odroczenie, NIE pominięcie
        return
    vessel.movementOrder = null
```

**Odroczenie musi mieć dokończenie** — inaczej D-VO1b-3 produkuje nową klasę lepkiego markera
(dokładnie ten defekt, który zamykamy). `MOS._tick` przemiata `_pendingRelease` i zwalnia, gdy
statek nie jest już w starciu. ⚠ Sweep jest **warunkiem koniecznym poprawności**, nie optymalizacją.

**D-VO1b-5** — `DirectorOffensive.launchStrike` rozdziela dwa różne stany świata:
`no_warp_capable_hull` (naprawdę nie ma kadłuba ze skokiem) vs **`no_idle_hull`** (kadłuby są, ale
żaden nie jest wolny). Dziś oba mówią to pierwsze — i to zaślepiłoby GATE B2.

**Bez zmian:** predykaty pul (D-VO1b-6) · `_byVessel` (już dziś czyszczony poprawnie) · serializacja
(`lastOrder` runtime-only) · dwanaście konsumentów z §2 (naprawiają się same, gdy marker mówi prawdę).

---

## §6 Poza zakresem (świadomie)

- 🔴 **Z2 — rajder AI jako STAŁA BAZA WYSUNIĘTA.** Po pierwszym uderzeniu okręt stoi przy planecie
  gracza; `strikeReadyVessels` nie pyta o `dockedAt` ani o układ macierzysty, a `issueAttack` w tym
  samym układzie leci z `bypassFuelCheck`. Po VO-3b uderza co cooldown **bez powrotu do domu, bez
  tankowania i bez ryzyka przechwycenia na własnej granicy**. To zmiana JAKOŚCIOWA modelu wojny,
  bliźniak Z1 z arca F-D („uciekinier AI parkuje nad kolonią gracza na zawsze").
  ⚠ **ŚWIADOMIE ZAAKCEPTOWANE przez właściciela jako konsekwencja TYMCZASOWA** (podpis 2026-08-26),
  do zamknięcia osobnym slice'em **„AI wraca po ataku"**. **D-VO1b-4: MUSI zostać jawnie nazwane
  w wyniku GATE B2 — nie wolno go tam przemilczeć.**
- 🟠 **Z3 — `pendingOrder` to DRUGIE pole tego samego kształtu** (`DirectorOffensive:84`). Zeruje je
  `_maybeDeliver`, ale ścieżki odmowy composite'u trzeba przejrzeć — reguła nieutwardzonego bliźniaka.
  **Filed; nie wchodzi w ten commit.**
- **Finding 138** (`_findBodyNearPoint` bez terminu układu) — pre-existing, potwierdzony sondą.
- **Odmrożenie endurance** (`enduranceDrainActive`) — konsument #10 z §2 ożyje przy M3.

---

## §7 Keepery i GATE B2

- **NEW `vo3b_order_clear_smoke.mjs` — FAIL-FIRST.** Trzy pule (liczby z §3), archiwum `lastOrder`
  z `blockReason`, wszystkie cztery przejścia terminalne, **Z1: uciekinier w TRWAJĄCYM starciu NIE
  traci markera** + kontrola pinu (po starciu traci), odroczony sweep.
- ⚠ **`w3_attack_dispatch` T2 (`:176`) — ŚWIADOME ODWRÓCENIE.** Asercja brzmi dziś
  `movementOrder?.status === 'completed'`, ale jej **INTENCJĄ** jest „rozkaz nie zostaje aktywny na
  zawsze w indeksie MOS". Nowy pin utrzymuje intencję: `movementOrder === null` **i**
  `_byVessel.size === 0`. Powód odwrócenia wpisany w nagłówku pliku (wzór `deploy_seams`,
  `ai_capture_last_stand` T4/T5).
- **Finding 140** — VO-3b to wyznaczone miejsce na **pin ŹRÓDŁOWY** hooka re-indeksu
  (`GameScene:2109-2110`): wywołanie istnieje, stoi **PO** `vesselManager.restore`, nie jest
  zagnieżdżone w bramce. Czytany kod **BEZ komentarzy**, z kontrolą pinu (wzór `colony_ownership_load` T8).
- **GATE B2 (LIVE, mierzy TEMPO nie poprawność):** uderzenia i desanty na 100 lat wyświetlanych,
  **z rozkładem powodów odmowy** (D-VO1b-5), porównane z przebiegiem sprzed VO-3b. Do wyniku
  **obowiązkowo** dopisać obserwację Z2 (D-VO1b-4).
  ⚠ **Headless tego NIE zmierzy:** `src/testing/headless/GameCore.js` **nie montuje** ani
  `MovementOrderSystem`, ani Directora, ani DSCS/EAH/Proximity (grep: zero trafień). Sufit z §3
  mierzy poziom REGUŁY; realizowaną częstość daje wyłącznie żywa gra.

**Save:** v101, **zero migracji** (`lastOrder` runtime-only).

**i18n: ZERO nowych kluczy — ZMIERZONE, wbrew pierwotnemu założeniu tego planu.** `no_idle_hull`
jedzie kanałem `director:strikeRefused`, który (a) jest już w `DebugLog.TRACKED_EVENTS` (`:87`) i
(b) **nie ma ANI JEDNEGO konsumenta w UI** (grep poza `DirectorOffensive`/`DebugLog`/testami: jedno
trafienie i to w komentarzu `GameScene:638`). To kanał AUDYTU, nie powierzchnia gracza — dodanie
kluczy PL+EN dorzuciłoby martwy słownik. ⚠ Reguła z W3 („nowy powód odmowy dołącza do
`TRACKED_EVENTS` w tym samym commicie") jest spełniona **z urzędu**: śledzona jest NAZWA ZDARZENIA,
a nie lista powodów.

---

## §8 Wynik wdrożenia (2026-08-26)

`MOS._releaseOrder` + `_inActiveEncounter` + `_pendingRelease` (sweep w `_tick`) · **sześć** punktów
terminalnych wpiętych (`_completeOrder`, `_onVesselArrived`, `_blockAndCancel`, `cancelOrder`,
`_onVesselWrecked`, `_indexExistingOrders`) · `DirectorOffensive._warpCapableHulls` + rozdzielenie
`no_idle_hull` / `no_warp_capable_hull`.

⚠ **`_onVesselWrecked` zwalnia WPROST, z pominięciem odroczenia** — martwy kadłub nie jest już
uciekinierem, którego `_allOutsideOf` miałby liczyć, a wrak wiszący w `_pendingRelease` przez
trwające starcie byłby wyciekiem.

**Potwierdzenie ścieżką PRODUKCYJNĄ (ta sama sonda, po naprawie):** kolumna „DZIŚ" (bez ręcznego
zerowania) **3 → 30 uderzeń** w 10 rzutach — sufit ×10 zrealizowany przez kod, nie przez symulację.

**Keepery:** `vo3b_order_clear` **30/30** · `w3_attack_dispatch` **37/0** (T2 odwrócone, intencja
oryginału zachowana osobną asercją) · `vessel_orders_seams` **46/0** (⚠ **S4 i S4b ODWRÓCONE** —
nagłówek keepera nakazuje przepisać wiersz tabeli, nie kasować testu; kontrola pinu podkłada teraz
MARTWY marker i dowodzi, że konsument został nietknięty — D-VO1b-6). Sweep **174/174 OK, 0 FAIL** ·
`check-i18n` PASS.

## §9 GATE B2 — WYNIK (2026-08-26): **zdany CZĘŚCIOWO, świadomie**

**✅ SEDNO D-VO1b potwierdzone na żywym silniku:** domknięty rozkaz zwalnia `movementOrder`,
archiwum `lastOrder` wypełnione, a kadłub **wraca do puli uderzeniowej** (`strikeReadyVessels`
0 → 1). Przed VO-3b w tym miejscu było `0` na zawsze.

**✅ Z1 (D-VO1b-3) potwierdzone POŚREDNIO i nieplanowanie:** podczas realnej bitwy gracz
zaobserwował rozkaz w stanie `completed` z **nietkniętym markerem** — czyli odroczenie zadziałało
dokładnie tam, gdzie miało (obrona D-FDd). Sweep `_pendingRelease` dokończył zwolnienie po starciu.

**⬜ NIE ZMIERZONO — realizowana częstość** (rzut + `cooldown 5 lat` przez 100 lat wyświetlanych).
Świadoma decyzja właściciela: to **strojenie tempa, nie poprawność** — do naturalnej rozgrywki.
⚠ Dodatkowy powód, dla którego i tak nie dałoby się tego zmierzyć w tej partii: **produkcja
okrętów AI stoi** (patrz niżej), więc flota istniała wyłącznie z dźwigni debugowej.

**⚠ Z2 — NAZWANE JAWNIE, zgodnie z D-VO1b-4:** rajder AI po uderzeniu **parkuje w układzie gracza
i bije co cooldown bez powrotu do domu**, bez tankowania i bez ryzyka przechwycenia na własnej
granicy. Przyjęte przez właściciela jako konsekwencja TYMCZASOWA; zamyka to osobny slice
**„AI wraca po ataku"**.

**Trzy rzeczy wyszły przy okazji i NIE należą do VO-3b:**
- 🟠 **produkcja okrętów AI stoi na głodzie komodytów** — `startShipBuild` zwraca `queued`
  (nie stać koloni), a `ORDER_TTL_DISPLAYED_YEARS = 3.0` kasuje zlecenie po trzech latach
  (`director:orderExpired`), cicho. Ta sama rodzina co stall kitów placówek zmierzony w `docs/BALANS_PHASE2_AI.md`
  §4.1/§4.2/§5 — z tą różnicą, że tamta połowa (PLACÓWKI) została w BALANS Phase 3 zapisana
  jako naprawiona (`startingPops` 24, reguła housing, porzucanie stuck), a ta (OKRĘTY) jest
  obserwacją PO tych fiksach. A/B z 2026-08-28 potwierdziło: strona placówkowa **nie cofnęła
  się** (imperia bez placówki 8/16 → 1/16), a nienaprawiony został **transport** — Finding 178
  (`VESSEL_ORDERS_PLAN.md`), kandydat na warunek wstępny tego wpisu.
- 🟠 **Finding 155** — Dziennik myli zwycięzcę, gdy gracz jest agresorem wojny (rejestr
  `VESSEL_ORDERS_PLAN.md`).
- ⚪ **A/B kolonizacji AI** (HEAD vs `5d3c022`, 2 seedy × 45 gy): liczby **identyczne**
  (5 ciał, 1. placówka 7 gy, naruszenia 11/24) ⇒ **żaden z dzisiejszych commitów nie ruszył
  tempa ekspansji AI**. Podejrzenie regresji ZAMKNIĘTE pomiarem.
  ⚠ **Próba 2-seedowa.** Panel **8-seedowy** z 2026-08-28 daje medianę **3 ciała** i **39/96**
  naruszeń — „5 ciał" nie jest tempem ekspansji AI, tylko artefaktem małej próby. Nie cytować
  tej liczby jako tempa. Pomiar: **Finding 178**, `VESSEL_ORDERS_PLAN.md` §Findings z A/B
  ekonomii AI.
