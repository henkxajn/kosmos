# MAP VESSEL PANEL — panel statku z Rejestru nad mapą 3D (Wariant A, „panel mode")

> **Podpisane 2026-09-07.** Save **v101, bez migracji**. Kill-switch `FEATURES.mapVesselPanel`
> (default **ON**; OFF = dzisiejszy `FleetGroupPanel` **bit w bit**).
> Rejestr macierzysty findingów: `VESSEL_ORDERS_PLAN.md`.
> Audyt wejściowy: ten dokument, §1 (pomiary wykonane PRZED planem, read-only).

---

## §0 Jedno zdanie

Klik w statek na mapie 3D ma otwierać **TEN SAM** prawy panel co Rejestr (info + pełny zestaw
akcji z pickerem i modalami) — nie kopię przycisków, tylko **tę samą instancję
`FleetManagerOverlay`**, rysowaną nad zamkniętym overlayem.

⚠ **Powód, dla którego reuse instancji bije ekstrakcję komponentu przy tym konkretnym wymaganiu:**
właściciel zażądał „jedno źródło prawdy, **identyczne z konstrukcji**". Wyodrębniony komponent daje
jedno źródło, ale **dwa miejsca wywołania**, które muszą się nie rozjechać na geometrii i stanie.
Ta sama instancja nie może się rozjechać, bo jest tym samym obiektem w tej samej klatce.

---

## §1 Punkt wyjścia — co ZMIERZONO przed planem

| pytanie | pomiar |
|---|---|
| czy `_drawRight` jest sparametryzowany layoutem? | **TAK** — `_drawRight(ctx, x, y, w, h, …)` (`FMO:7091`), i **już dziś renderuje się w DWÓCH szerokościach w produkcji**: `RIGHT_W`=200 (`:783`) i `REGISTRY_RIGHT_W`=300 (`:767`). Komentarz `:45` mówi to wprost. |
| czy modale są wolnostojące? | **TAK, decydująco** — `CargoLoadModal`, `ColonistLoadModal`, `OutpostBuildingPicker`, `ModalInput`, `BodyPickerModal`: **ZERO** odwołań do `overlayManager` / `_hitZones` / `isAnyOpen` / `FleetManager`. Promise-owe, biorą `(vessel, colony)`. |
| czy picker celu wymaga klikania po mapie? | **NIE** — `FEATURES.commandTacticalMap = false`, a `map_planet` ma `case` (`FMO:2467`) i **ZERO producentów**. Picker to czysta, przewijalna LISTA. *(To była jedyna rzecz, która mogła ten slice zatopić.)* |
| ile stanu panelu jest lokalne? | ~10 pól, **wszystkie lokalne**: `_missionConfig` (35 użyć), `_targetScrollOffset`, `_cachedTargets`/`Key`, `_rightScrollY`, `_rightContentH`, `_rightViewH`, `_rightScrollVesselId`, `_missionCfgScrollKey`. Wejście = `_selectedVesselId`. |
| czy zdarzenie selekcji już istnieje? | **TAK** — `ui:selectionChanged {vesselId, vesselIds, prevVesselId}`; klik w statek na mapie 3D **już** woła `setSelectedVesselId` (`GameScene:5882-5883`), CTRL+klik → `toggleSelection` (`:5882`). Wrogie statki **wykluczone u źródła** (`:5881`, `!isEnemyVessel`, „P1.2 semantyka"); klik w pustkę → `clearSelection()`. |
| czy `_drawRight` daje się prowadzić headless? | **TAK** — zmierzone: `fmo._drawRight(ctx, 1600, 100, 300, 800, …)` na atrapie `ctx` zwraca **9 stref**, w tym `action` z `["orbit","transport"]` dla `hull_medium` w stanie `docked`+`idle`. |
| czy rysowanie FMO „zamkniętego" psuje `isAnyOpen()`? | **NIE, strukturalnie** — `OverlayManager.isAnyOpen()` to `this.active !== null` (`:106`), pole **rozłączne** z `FMO._visible` (`:366/512/531/567`). |

**Co JEST splecione (jedna rzecz, nie wiele):** `this._hitZones` (36 użyć w domknięciu) plus router
`_handleHit` (`FMO:1789`) — **122 gałęzie `case`**, z których panel potrzebuje ~30. Oraz to, że
`_drawRight` jest **multiplekserem**: sześć gałęzi-rodzeństwa przed treścią statku (detal floty
`_selectedFleetId`, ship picker `_pendingSendSystemId`, raport wraku, detal wroga, podpowiedź „brak
wyboru", dopiero potem statek).

---

## §2 Wariant C — decyzja właściciela

**A teraz, B (ekstrakcja `VesselActionPanel`) później, jako osobny arc, TYLKO jeśli kształt obroni
się na live-gate.** Wycena ekstrakcji (z granic metod, nie z diffa): **≈2 400 linii** przeniesienia
(≈610 gałąź statku + ≈1 340 helpery renderu + ≈427 handlery/modale), FMO 9 195 → ~6 800.
⚠ To **4× największy carve w historii tego repo** (C8, `7201670`, 545 linii — i tamten był świadomie
izolowany właśnie dlatego, że 450 linii w pliku 9 700-liniowym uznano za ryzykowne). Wariant A
kosztuje **≈150 linii nowego kodu** i jest odwracalny flagą.

---

## §3 Decyzje podpisane (D-MVP-*)

| # | decyzja | treść |
|---|---|---|
| **D-MVP-1** | **Wariant A** | `UIManager` woła `fmo._drawRight(...)` przy geometrii panelu, gdy overlay ZAMKNIĘTY i zaznaczony DOKŁADNIE 1 nie-wrogi statek. Klik → wąskie `fmo.handleVesselPanelClick(x,y)` → istniejące `_handleHit`. |
| **D-MVP-2** | **kill-switch** | `FEATURES.mapVesselPanel`, default **ON**. OFF ⇒ `FleetGroupPanel` przy N≥1 **bit w bit jak dziś** (żadnej innej różnicy). |
| **D-MVP-3** | **mutex po LICZBIE** | `vesselIds.length`: 0 → nic · 1 → panel statku · ≥2 → `FleetGroupPanel`. Klucz to **liczba**, nie droga dojścia (`removeFromSelection` 2→1 też ląduje na 1). |
| **D-MVP-4** | **czyszczenie stref** | `_hitZones` czyszczone PRZED rysowaniem panelu; router przyjmuje **wyłącznie** strefy z TEGO rysowania. |
| **D-MVP-5** | **wymuszenie gałęzi** | Przed `_drawRight`: `_selectedFleetId = null`, `_pendingSendSystemId = null`. Bez tego mapa może pokazać detal floty albo ship picker. |
| **D-MVP-6** | **`_rightScrollY` WSPÓLNY** | Scroll dzielony między overlay a panel mapy dla tego samego statku — **zachowanie zamierzone**, nie skutek uboczny. Pinowane (P-scroll), żeby nikt go „nie naprawił". |
| **D-MVP-7** | **`isAnyOpen()` nietknięte** | Panel nie ustawia `_visible` ani `overlayManager.active`. Pinowane. |
| **D-MVP-8** | **footer-3 przez WSPÓLNE źródło** | Odwrót / → Flota / Dokuj dołączone do panelu — ale **NIE jako kopie**. Patrz §6. |
| **D-MVP-9** | **Dokuj z mapy = tylko WŁASNY UKŁAD** | `sameSystemOnly` w wspólnym helperze; panel mapy przekazuje `true`. Istniejące panele `false` = **dzisiejsze zachowanie bit w bit**. Patrz §7. |
| **D-MVP-10** | **255/256/257 POZA slice'em** | Nie implementujemy tu. 255 rusza bramkę `_issueMoveToPoint` (dotyczy KAŻDEGO rozkazu punktowego) — nie może dzielić promienia rażenia z tym slice'em. |
| **D-MVP-11** | **154 poprawiane W MIEJSCU** | Commit docs, ten arc. Zapisana konsekwencja („rozkaz odpadnie na `target_other_system`") jest **nieprawdziwa** — patrz §7. |
| **D-MVP-12** | **wrogi statek poza zakresem** | Selekcja mapy wyklucza wrogów u źródła (`GameScene:5881`), więc gałąź `_drawEnemyDetails` nie dotyczy panelu mapy. Bez zmian w tamtej ścieżce. |

---

## §4 Cztery ryzyka Wariantu A — każde z własnym pinem

| # | ryzyko | mitygacja | pin |
|---|---|---|---|
| **R1** | wspólna, mutowalna tablica `_hitZones` między dwiema powierzchniami | powierzchnie **rozłączne** (panel rysuje tylko gdy `!isAnyOpen()`), `_drawRight` i tak repopuluje co klatkę; dodatkowo jawny reset przed rysowaniem (D-MVP-4) | **P5** — po otwarciu pełnego overlaya dokładnie **jedna** strefa `action:orbit` (`count === 1`, nie `>= 1`) |
| **R2** | `_drawRight` może wejść w gałąź floty / ship-pickera | wymuszenie gałęzi (D-MVP-5) | **P7** — przy ustawionym `_selectedFleetId` panel MAPY dalej renderuje gałąź statku; kontrola: w overlayu ten sam stan renderuje detal floty |
| **R3** | `_rightScrollY` dzielony | zachowanie **zamierzone** (D-MVP-6) | **P-scroll** — scroll ustawiony na mapie jest widoczny po otwarciu overlaya dla tego samego statku; reset przy zmianie statku (`_rightScrollVesselId`) dalej działa |
| **R4** | rysowanie „zamkniętego" FMO psuje `isAnyOpen()` | strukturalnie bezpieczne (§1) — pola rozłączne | **P-open** — po rysowaniu panelu `overlayManager.isAnyOpen() === false` **i** `fmo.isVisible === false` |

---

## §5 Mutex multi-select

```
ui:selectionChanged → vesselIds.length
   0  → nic            (klik w pustkę = clearSelection, już wpięte)
   1  → panel statku   (pełna powierzchnia Rejestru)
  ≥2  → FleetGroupPanel (agregat grupy + fan-out)
```

**Bez foldu.** Fold znaczyłby albo puszczanie akcji per-statek na N statków (połowa wymaga celu —
bezsens), albo degradację panelu do sześciu przycisków grupy, czyli do tego, co już jest.

⚠ **Punkty wpięcia w `UIManager` (zmierzone):** konstrukcja `:333-361` · `isOverUI` `:1720-1723`
i `:1763-1765` · `handleClick` PRZED `overlayManager` `:1795-1804` · `handleMouseMove` `:1956-1960` ·
`draw` PO `overlayManager` `:2150-2156`. Panel statku wchodzi **w tej samej kolejności co
`fleetGroupPanel`**, z bramką `vesselIds.length === 1`; `fleetGroupPanel` dostaje komplementarną
bramkę `>= 2`.

---

## §6 Footer-3 — ODPOWIEDŹ na pytanie właściciela: czy dołożenie tworzy kopię?

**Zmierzone, per akcja. Odpowiedź jest RÓŻNA dla każdej z trzech.**

| akcja | dziś | naiwne dołożenie | werdykt |
|---|---|---|---|
| **Odwrót** | `FleetGroupPanel:470-472` — **2 linie**: pętla `mos.issueOrder(v.id, {type:'retreat'})` | 2 linie | ✅ **NIE jest kopią.** Jedynym źródłem jest `MovementOrderSystem`, a pod nim `resolveShelterOrderSpec` (slice RETREAT_TARGET, `aeef035`) — jedno źródło doboru celu dla WSZYSTKICH trzech producentów odwrotu. Dołożenie to wywołanie, nie duplikat. |
| **→ Flota** | `FleetGroupPanel:405-436` — **~32 linie** (modal → createFleet → pętla addMember → toast → `setSelectedFleetId`) | **kopia #2** | ⚠ **BYŁABY kopią.** Wymaga wyciągnięcia. |
| **Dokuj** | `FleetGroupPanel:479-500` **oraz** `FleetCommandPanel:465-487` | **kopia #3** | 🔴 **JUŻ DZIŚ SĄ DWIE, niemal znak w znak** — ten sam `getDockTargets()` → `showBodyPickerModal` → pętla `issueOrder({type:'dock'})` → ten sam klucz `fleetGroup.dockFailed`. Trzecia byłaby trzecią. |

### Rozstrzygnięcie (D-MVP-8): NEW `src/ui/VesselGroupActions.js`

Dwa wolnostojące helpery (zero importu paneli), konsumowane przez **trzy** powierzchnie:

```
assignVesselsToFleet(vesselIds)            ← FleetGroupPanel · panel mapy
openDockPicker(vesselIds, { sameSystemOnly })  ← FleetGroupPanel · FleetCommandPanel · panel mapy
```

⚠ **Ten slice nie DODAJE bliźniaka — USUWA jednego.** Bilans duplikacji jest **ujemny**: dock spada
z 2 kopii do 1 źródła, „→ Flota" zostaje przy 1 źródle zamiast urosnąć do 2, Odwrót nigdy kopią nie
był. To jest wprost odpowiedź na warunek właściciela: *„nie dodajemy piątego nieutwardzonego
bliźniaka, żeby zamknąć slice o tym, że nie ma dwóch paneli"*.

---

## §7 Finding 256 — bramka `sameSystemOnly`, i dlaczego NIE naprawia się tu w całości

**Zmierzone (realny `MovementOrderSystem`):**

```
dock: statek sys_061 -> kolonia sys_home   | {"ok":true,"orderId":"mo_4"} | _pendingDock = p_home
KONTROLA dock: wlasny uklad                | {"ok":true,"orderId":"mo_5"} | _pendingDock = p_home
```

Mechanizm: `getDockTargets()` (`BodyName.js:47`) listuje `getPlayerColonies()` **bez terminu
układu**, a `_issueDock` (`MovementOrderSystem:449`) **zrzuca `targetBodyId`** przed wywołaniem
`_issueMoveToPoint` i ustawia `_pendingDock` dopiero PO sukcesie ⇒ bramka W3-4b nigdy tego nie widzi.

**W tym slice:** helper przyjmuje `sameSystemOnly`; panel mapy przekazuje **`true`** (filtr przez
`systemIdOf` — stacje mają `systemId`, `Station.js:47`; kolonie przez `EntityManager`). Dwie
istniejące powierzchnie przekazują **`false`** = zachowanie dzisiejsze **bit w bit**.

⚠ **Flaga jest UCZCIWYM SZWEM, nie tchórzostwem:** `false` konserwuje ZMIERZONE zachowanie istniejącej
powierzchni (zmiana jej to zadanie 256, nieподpisane), a `true` gwarantuje, że **nowa** powierzchnia nie
przemyca defektu. Naprawa 256 = przełączenie jednego argumentu + usunięcie flagi.

### Finding 154 — poprawka W MIEJSCU (D-MVP-11)

Rejestr mówi: *„rozkaz odpadnie na `target_other_system`"*. **Nieprawda.** Zmierzone:

```
statek w sys_061, goly punkt (jak grpReturn)   | {"ok":true,"orderId":"mo_1"}
   ...ten sam cel, ale z targetBodyId          | {"ok":false,"reason":"target_other_system"}
```

Wszystkie trzy produkcyjne ścieżki „Powrót do bazy" podają **goły `targetPoint` bez `targetBodyId`**,
a bramka W3-4b stoi WEWNĄTRZ `if (bodyId)` (`MovementOrderSystem:815-826`) ⇒ rozkaz **przechodzi**.
Potem `_pendingReturnDock` → `FleetSystem._maybeAutoDockOnReturn:645` **teleportuje bezwarunkowo**:

```
systemId = sys_061   (NIE ZMIENIONY)
position = {"state":"orbiting","dockedAt":"p_home","x":110,"y":0}
dockedAt wskazuje cialo z ukladu sys_home, statek stempluje sys_061 => NIESPOJNE
```

Statek „zadokowany" przy ciele, którego w jego układzie NIE MA, z przepisanym `colonyId` — **i to
idzie do zapisu**. Ta sama klasa co `_freezeAsStationary` w arcu RETREAT_TARGET.
⚠ To jest wzorzec z memory `registry-may-describe-the-trap-not-the-bug`: wpis opisywał konsekwencję
ŁAGODNIEJSZĄ niż rzeczywista.

---

## §8 Plan commitów

| # | commit | treść | i18n | zapis |
|---|---|---|---|---|
| **1** | `docs(258)` | ten plan + **poprawka 154 w miejscu** + rejestracja **255/256/257** jako osobnych przyszłych slice'ów | — | v101 |
| **2** | `feat(258): panel statku z Rejestru nad mapą 3D` | adapter + `handleVesselPanelClick` + 6 punktów wpięcia + `FEATURES.mapVesselPanel` + mutex + cztery piny ryzyk + keeper | — | v101 |
| **3** | `refactor(258): footer-3 przez wspólne źródło` | NEW `VesselGroupActions.js`; `FleetGroupPanel` i `FleetCommandPanel` przepięte (dock: **−1 kopia**); footer panelu mapy; `sameSystemOnly` | ewent. reuse `fleetGroup.*` | v101 |

**Separowalność (3):** tak — commit 2 dowozi pełny panel Rejestru na mapie i jest testowalny bez
footera. Commit 3 to wyłącznie trzy przyciski + zwinięcie istniejącej duplikacji.
**Per commit:** sweep + `check-i18n` + explicit-path staging + `git status` pokazany właścicielowi.

---

## §9 Keeper `map_vessel_panel_smoke` — kształty i KONTROLE NIEJAŁOWOŚCI

Pinowany **wykonaniem** (FMO importuje się pod node; `_drawRight` prowadzalny na atrapie `ctx` — oba
zmierzone).

| pin | kształt | kontrola anty-jałowa (**obowiązkowa**) |
|---|---|---|
| **P1** | zbiór stref panelu MAPY ≡ zbiór stref prawej kolumny OVERLAYA dla tego samego statku (po `type` + `data.actionId`, bez x/y) | zbiór **niepusty ORAZ zawiera `action` o oczekiwanych id** — baseline zmierzony: `["orbit","transport"]`. *Dwa puste panele też są „identyczne".* |
| **P2** | klik `action:transport` na panelu MAPY dochodzi do `_openCargoThenTarget` (szpieg na wejściu do modalu — modal jest async/DOM, **nie** asertować powstania misji) | ten sam klik w akcję `!ok` **nie robi nic**, a akcja `ok` **zrobiła wywołanie** — inaczej martwy router przechodzi |
| **P3** | po `action:colonize` → `_missionConfig.step === 'select'`; kolejne rysowanie emituje ≥1 strefę `select_target` | fixture **kwalifikujący się**, z asercją **≥1 celu** — statek niekwalifikujący daje pustą listę i pin przeszedłby jałowo |
| **P4** | N==1 → panel statku rysuje, `FleetGroupPanel` nie; N==2 → odwrotnie | **oba kierunki**, każdy z asercją, że TEN DRUGI panel wyprodukował **niepusty** zbiór stref |
| **P5** | po otwarciu overlaya dokładnie **jedna** strefa `action:orbit` | `count === 1`, nie `>= 1` |
| **P6** | zbiór stref prawej kolumny FMO **niezmieniony** vs golden sprzed zmiany | golden sam musi być niepusty |
| **P7** | wymuszenie gałęzi (R2) | kontrola: w overlayu ten sam `_selectedFleetId` renderuje detal floty |
| **P-open** | `isAnyOpen() === false` i `fmo.isVisible === false` po rysowaniu panelu | kontrola: po `open()` oba są `true` |
| **P-scroll** | `_rightScrollY` wspólny (D-MVP-6) | kontrola: zmiana statku dalej resetuje scroll (`_rightScrollVesselId`) |
| **P-flag** | `mapVesselPanel: false` ⇒ panel nie rysuje **i** `FleetGroupPanel` rysuje przy N==1 | kontrola: przy `true` odwrotnie |

**Commit 3 dokłada:** P8 (footer-3 renderuje się i dyspozycjonuje przez **wspólne** helpery — pin
źródłowy: zero duplikatu bloku w panelu mapy) · P9 (`sameSystemOnly: true` odsiewa cel z obcego
układu; kontrola: `false` go zachowuje — dowód, że filtr działa, a nie że lista jest pusta).

---

## §10 Granica dowodu — nazwana z góry

- Zweryfikowane wykonaniem: **`_drawRight` headless**, nie pełne `FMO.draw()`. P1/P6 prowadzą
  `_drawRight` bezpośrednio.
- **Modale DOM nie są pinowane** — P2 kończy się na wejściu do modalu. Faktyczne UI modali,
  całościowe rysowanie overlaya i ergonomia pickera na mapie = **live-gate**.
- Nie twierdzimy niczego o ścieżce wroga ani o wrakach (wykluczone z selekcji u źródła).

---

## §11 Świadomie POZA zakresem

- **255** (goły `targetPoint` omija bramkę + `_pendingReturnDock` teleportuje) — własny podpis;
  dotyka `_issueMoveToPoint`, czyli **każdego rozkazu punktowego w grze**.
- **256** (pełna naprawa `getDockTargets` + `_issueDock`) — tu tylko bramka nowej powierzchni (§7).
- **257** (`countActionable` bez terminu `isInService`; wyniki `issueOrder` połykane) — zostaje na
  `FleetGroupPanel`, żywy przy N≥2.
- **Wariant B** (ekstrakcja `VesselActionPanel`, ≈2 400 linii) — osobny arc, tylko po live-gate.
- **Powrót** — panel Rejestru go nie ma, więc przy **N==1 znika**; ale `grpReturn` żyje przy **N≥2**,
  a `bgReturn` i `fleetReturnBase` (`FMO:3806`) są nietknięte. ⚠ „Nigdzie nie ma Powrotu" **nie jest**
  darmową konsekwencją tego slice'u — to osobna decyzja.

---

## §11a Live-gate 2026-09-07 — wynik i co z niego wyszło

Rdzeń PASS (krok 2: panel nad mapą pokazuje DOKŁADNIE powierzchnię Rejestru). Trzy zgłoszenia:

| # | zgłoszenie | rozstrzygnięcie |
|---|---|---|
| ① | „przy N≥2 rysują się dwa panele" | **NIE defekt adaptera** — `fleetGroupPanel.draw` ma jedno miejsce wywołania, a obie bramki czytają ten sam `_mapSurface()` w tej samej klatce. Realny problem: powrót przycisku „Powrót" przy N≥2 i **rozjazd słownika akcji** N==1 vs N≥2 ⇒ **A1** (`e591172`). Inwariant renderu dostał pin **P11** (nic go dotąd nie pilnowało). |
| ③ | klik w panel nie jest pochłaniany | **ZAMKNIĘTE** (`aaf0b54`) — consume-on-rect-hit + płyta tła. Piny **P12** (fail-first) i **P-plate**. |
| ② | „akcje celowane nie dochodzą do dyspozycji (*Ship unavailable*)" | **NIE mieści się w tej fladze** — odmawia identycznie z Rejestru i z Dowództwa. ⇒ **Finding 259**, własny slice, kierunek podpisany. ⚠ **Root cause USTALONY po rundzie 2:** `orbiting` + `idle` wypada MIĘDZY dwie bramki (`isRedispatch` chce `on_mission`, `dispatchOnMission` chce `docked`) → `_abortLaunch` → „Statek niedostępny". `cargoMax` **nieistotny** — kontrola pokazała obie kolumny identyczne. |

**Zarejestrowane, NIEZREALIZOWANE:**
- **Finding 259** 🔴 — macierz akcji (dok = najbogatszy zestaw, a z mapy nieklikalny), sześć miejsc
  `mission.shipUnavailable`, `_launchTransport:865` `isRedispatch` jako istniejący wzorzec, kolizja
  i18n PL. **Nie jest bramkowane flagą `mapVesselPanel`.**
- **Finding 260** ⚪ — polish ④: kółko myszy niepodpięte (maszyneria scrolla istnieje, brakuje trasy
  i wąskiego wejścia — lustra `handleVesselPanelClick`) + panel nieprzesuwalny (`FloatingPanel` /
  `PanelDock` mają trzech konsumentów, ten panel nie jest jednym z nich).

**Dorobek pinów po live-gate'cie** (keeper `map_vessel_panel_smoke` 66 → 118): P11 (render-mutex),
P-A1, P12 (③), P13 + P13-src (integracja end-to-end na prawdziwym `MissionSystem`, fixture
z populacji OSIĄGALNEJ z mapy), P-plate. Nagłówek keepera niesie lekcję „fixture musi pochodzić
z populacji osiągalnej na nowej powierzchni".

⚠ **Do live-gate'u rundy 2:** flaga ON, statek **ORBITUJĄCY** — zadokowanego NIE DA SIĘ kliknąć
na mapie (`ThreeRenderer:4783`/`:1185`). ⚠ Ale panel przyjmuje go z **Outlinera i z Taba**
(`Outliner:668`, `GameScene:4702` → `setSelectedVesselId`, bez wymogu sprite'a) — jeśli krok gate'u
ma mierzyć KLIK NA MAPIE, statek musi być orbitujący.

---

## §12 Live-gate (do wykonania przez właściciela, po commicie 2 i po 3)

1. Klik w statek na mapie → panel z **pełnym** zestawem akcji (Transport / Kolonizuj / Załaduj
   kolonistów / Placówka widoczne wg modułów).
2. **Transport** → modal cargo → picker celu (lista) → WYŚLIJ → misja startuje.
3. **Kolonizuj** → modal kolonistów → picker → potwierdzenie.
4. **Placówka** → picker celu → OutpostBuildingPicker.
5. CTRL+klik drugiego statku → panel znika, pojawia się `FleetGroupPanel` (mutex).
6. Odznaczenie do jednego → wraca panel statku.
7. Otwarcie Dowództwa (`K`) → prawa kolumna identyczna; zamknięcie → panel mapy wraca.
8. `mapVesselPanel: false` → dzisiejsze zachowanie.
9. (po 3) Odwrót / → Flota / Dokuj z footera; Dokuj **nie pokazuje** ciał z obcego układu.
10. Brak błędów w konsoli.
