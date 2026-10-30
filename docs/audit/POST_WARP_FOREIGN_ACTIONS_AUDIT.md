# AKCJE OBCE PO SKOKU WARP — audyt (faza A) i domknięcie (faza B)

> **Findingi 578 · 579 · 580** (✅ zamknięte) **+ 581 · 582** (otwarte, zgłoszone przy bramce).
> Rejestr macierzysty: `docs/design/VESSEL_ORDERS_PLAN.md` §„Findingi 578–582”.
> **Faza A** (read-only): 2026-10-29, kotwica `f1554c9`; pomiary na kopii `git archive` w scratchpadzie — zero zapisów
> w repo (Live Server nie przeładował karty właściciela).
> **Faza B**: decyzje właściciela D-1…D-5 + odpowiedzi A1/A2 (2026-10-29); kod `56e66b4` na `da9827c` — równoległa sesja
> SM-1 zacommitowała w trakcie (pliki rozłączne), fail-first powtórzony na nowej kotwicy, kotwicę przekazał właściciel.
> **Bramka właściciela (a)–(f) PASS 2026-10-30** (klient EN). Save **v101 bez migracji**, bez flagi (rollback = `git revert`).

## 1. Zgłoszenie

- **S1** — kolonizator po skoku warp stoi przy ciele zbadanym teleskopem (`explored`); „Kolonizuj” nie ma ani w menu PPM,
  ani w pickerze rejestru floty.
- **S2** — statek naukowy w tym samym położeniu: brak skanu ciała; pojawia się rozkaz „skanuj układ”, a statek nic nie robi.

## 2. Trzy stany statku po skoku (zmierzone — sonda `src/testing/headless/probe-post-warp-actions.mjs`)

| stan | skąd się bierze | kształt | co oferowały panel statku i rejestr (na `f1554c9`) |
|---|---|---|---|
| **A** | przylot | `interstellar_jump` / `in_system`, `on_mission`, `orbiting`, `dockedAt = null` (obrzeża układu) | „🔭 Przełącz widok”, Transport, wyłączone „Zmień cel”; statek naukowy — wyłączony „Pełny Skan” (zajęty) |
| **B** | PPM „Lecisz do planety” albo ruch cross-system d2 | `orbiting`, `idle`, `mission = null`, `dockedAt = ciało` | **brak „Kolonizuj” i „Recon”**; „Pełny Skan” aktywny i nic nie robi; panel obcy zamknięty (`_isForeignRedirectClickable = false`) |
| **C** | wiersz zakładki Atlas przy zaznaczonym statku (`_redirectInterstellarVessel`) | `exploration` / `orbiting_body`, `targetId = ciało` | „Kolonizuj”, „Recon ciała”, „Recon układu” — **wszystko działa** |

Dodatkowy pomiar: te same akcje obce wołane WPROST na statku w stanie B działają (ciało przeanalizowane, kolonia
założona) — backend był sprawny, problemem była wyłącznie dostępność w UI.

## 3. Hipotezy

| | werdykt | dowód |
|---|---|---|
| **H1** stary `systemId` po skoku (bramki z `7d4f9a7`) | **martwa** | po prawdziwym skoku `systemId`, `systemIdOf` i `_resolveSystemId` wskazują układ docelowy; `_getValidTargets` — 35/35 celów z układu docelowego; `_missionTargetOutOfSystem` i `_findNearestUnexplored` poprawne w obie strony; bramki 138/142 w porządku |
| **H2** misja przylotu jako „zajęty” | **częściowo, nie przyczyna** | w stanie A misja przylotu wyłącza „Pełny Skan” i odrzuca `survey` / `colonize` („Statek niedostępny”) — ale tych akcji i tak nie ma w ofercie dla statku na orbicie; misja jest jedynym kluczem przekierowania z Atlasu, więc zostaje |
| **H3** status ciała | **martwa dla kolonizacji** | teleskop (`startBodyScan` → `_tickBodyScans`) ustawia `explored = true`; `canLaunchColony.exploredOk` i przycisk obcy to akceptują; `survey` z projektu odmawia ciałom zbadanym |
| **H4** gdzie ginie skan | **potwierdzona → 579** | pierwsze ciche wyjście: `VesselManager._completeFullScan:1437-1441` — ciało bez siatki kolonii ⇒ `return` bez zdarzenia i bez wpisu |

## 4. Przyczyna — 578

Akcje obce kluczował **KSZTAŁT MISJI** `exploration` / `orbiting_body` (`ShipPanelHudLogic.js:210`, `409f82b`; bliźniak
`FleetManagerOverlay.js:7742`, `1324955`). Jedynym producentem tego kształtu jest `VesselManager._redirectInterstellarVessel`,
a jego jedynym żywym wejściem w UI od **253 f-A** (`5264a4b`, 2026-09-05 — usunięcie list ciał z panelu obcego układu)
jest wiersz zakładki **Atlas**. Na rodzicu (`a082899`) panel przylotu miał klikalne przekierowanie dla każdego ciała.

⚠ **Oba zamienniki, na które powołał się `5264a4b` („usunięcie jest DARMOWE, bo zdolność «leć do innego ciała» ma dwie
inne drogi”), były martwe w chwili cięcia:**
- klik ciała na mapie taktycznej — mapa wyłączona od `6b3590f` (`commandTacticalMap: false`);
- rozkaz ruchu cross-system d2 — kończy się w stanie B, bez misji, czyli bez akcji obcych.

Pin f-3 `foreign_panel_slim_smoke` świecił zielono, bo wołał handler kliknięcia WPROST — tej strefy żadna mapa nie rysuje.

Korekty opisu objawu: PPM nigdy nie miał opcji „Kolonizuj” (historia pliku), a rejestr nie oferował nigdy kolonizacji
ani skanu statkowi na orbicie (wszystkie 34 wersje `FleetActions.js`) — zaprojektowaną drogą był zawsze panel obcy.

### Bramki na obu łańcuchach (blame; numery linii na `f1554c9`)
- **Odpowiadają za objaw** (wszystkie starsze niż `7d4f9a7`): przyciski obce na kształcie misji `ShipPanelHudLogic.js:210`
  (`409f82b`) i `FleetManagerOverlay.js:7742` (`1324955`); przekierowanie `VesselManager.js:3213-3215`; akcje tylko w doku
  `FleetActions.js:624`, `:656`; ruch kończący misję jako `mission = null` / `idle` `MovementOrderSystem.js:1073`,
  `:2287-2289`; „Pełny Skan” `VesselManager.js:1437-1441`.
- **Z `7d4f9a7`, zmierzone jako poprawne:** `VesselManager.js:493`, `:571`, `:3934-3939`; `FleetManagerOverlay.js:9277`;
  `MissionSystem.js:83-84`, `:285`, `:1326`, `:1664-1668`, `:2834-2835`; `FleetActions.js:106`.
- **Sprzężenie z naprawą:** `PlayerViability.js:68`, `:120-123` — predykat końca gry liczył kolonizator po TYPIE MISJI;
  po udostępnieniu „Kolonizuj” w stanie B dawałby fałszywy koniec gry (→ D-3).

## 5. 579 — „Pełny Skan” bez śladu

`_completeFullScan` przy ciele bez `colony.grid` (siatka istnieje wyłącznie dla kolonii — `ColonyManager._onColonyFounded`)
robił `return` bez zdarzenia i bez wpisu; `vessel:fullScanComplete` nie ma ani jednego subskrybenta. W stanie B przycisk
był aktywny.

## 6. 580 — recon CAŁEGO obcego układu wraca do stanu C bez `targetId`

`_tickForeignRecon` po ostatnim ciele wraca do `exploration` / `orbiting_body`, a rekord misji niesie `targets[]` zamiast
`targetId` ⇒ panel na kotwicy pisał „🌍 Na orbicie: {0}” i miał aktywny, martwy „Recon ciała” (`targetId = undefined`).
Wypłynęło w fazie B (pin D1-C2).

## 7. Decyzje właściciela

- **D-1** — predykat, nie lista ciał (253 zostaje); NADZBIÓR dzisiejszego warunku; jeden moduł, trzej konsumenci (panel
  statku, rejestr, `PlayerViability`); stan C bez zmian (pin kontrolny). Potwierdzenia: pierwszy człon = dzisiejszy warunek
  (stan C); dodatkowe człony stanu B — statek w służbie (bramka rezerwy W2) i ciało w układzie statku.
- **D-2 / A1** — akcje obce tylko poza śladem kolonii gracza; ślad PER STATEK: układ jest „u siebie”, gdy TEN statek może
  zadokować przy kolonii gracza (port na jej ciele albo kadłub mały) — `needsSpaceportForVessel` + `hasSpaceportAt`; trzy
  zmierzone wiersze przypięte jako kontrole. Powód: w układzie z dokowalną kolonią `_startForeignColonize` dawałby darmowy
  zestaw startowy zamiast normalnego startu (tańsza kolonizacja).
- **D-3** (Finding 111) — bezczynny kolonizator przy skolonizowalnym ciele (typ jak dla „Kolonizuj”, bez kolonii, bez
  wymogu `explored`) w stanie z akcjami obcymi = żywa trasa odbudowy; ten sam predykat.
- **D-4** — „Pełny Skan” bez siatki: GŁOŚNA odmowa w Dzienniku (jak inne odmowy), jeden nowy klucz PL+EN, bez wariantu
  „pusty wynik”.
- **D-5** — numery przy commicie. **A2** — równoległa sesja SM-1: wyłącznie własne ścieżki, staging po ścieżkach,
  przesunięta kotwica ⇒ STOP (zaszło; nowa kotwica `da9827c` od właściciela 2026-10-30).
- `fleet.clusterSwitch` 🔭 → 🗺 (PL+EN, tylko wartość — przycisk przełącza kamerę, nie skanuje).
- **Po bramce (2026-10-30):** A1 w układzie macierzystym zostaje jak podpisane, trasa przez stację → **581**; fallback 580
  zatwierdzony.

## 8. Wykonanie (faza B, `56e66b4`)

- NEW `src/utils/ForeignActions.js` — `foreignActionsBodyId(vessel, ctx)`, `foreignActionsAvailable`, `inColonyFootprint`,
  `isForeignColonizeType`, `foreignActionsContext(K)`. Kontekst wstrzykiwany; bez `colonyManager` ⇒ `null` ⇒ stan B
  zamknięty (fail-closed), stan C działa dalej.
- `ShipPanelHudLogic` (:210) i `FleetManagerOverlay._drawRight` (panel orbity obcego ciała) czytają predykat;
  `isForeignColonizeType` zastępuje dwie kopie reguły typu ciała; `_isForeignRedirectClickable` nietknięte.
- `PlayerViability` — `foreign` w `canReverseFate` / `hasLiveRecolonizationPath`; `ColonyManager._tickPlayerViability`
  podaje kontekst.
- `VesselManager` — odmowa „Pełnego Skanu” przy starcie i przy końcu (`_fullScanGrid` / `_refuseFullScan`, kanał
  `fleet` / `warn`, „<statek> (<powód>)”); i18n `vessel.reasonFullScanNoGrid` PL+EN; `fleet.clusterSwitch` 🔭 → 🗺.
- Skutek uboczny (świadomy): obce „📦 Rozładuj cargo” pojawia się także w stanie B — nadzbiór.

### D-2 — trzy zmierzone wiersze (sonda `src/testing/headless/probe-foreign-footprint-d2.mjs`)

| ślad w układzie | kadłub | po „Dokuj tutaj” | normalny start | akcje obce |
|---|---|---|---|---|
| pełna kolonia z portem | średni | `docked` | ✅ kolonia założona | brak (u siebie) |
| sama placówka, bez portu | średni | `orbiting` przy ciele placówki (`dockedAt = ciało`, `idle`) | ❌ „Statek musi być w hangarze” | zostają |
| sama placówka, bez portu | mały | `docked` | ✅ kolonia założona | brak (u siebie) |

### Testy

- NEW keeper `src/testing/smoke/foreign_actions_smoke.mjs` **77/77** — fail-first **36 PASS / 41 FAIL** w czystym
  `git worktree --detach` na `f1554c9` i na `da9827c` (każdy czerwony = pin naprawy; kontrole zielone po obu stronach).
- Bateria 7 mutantów, każdy przywrócony bit w bit i każdy zabity przez swoje piny: M1 ślad nigdy „u siebie”, M2 ślad per
  układ zamiast per statek, M3 kadłub mały traktowany jak średni, M4 bez fallbacku `dockedAt` (580), M5 koniec gry ignoruje
  predykat, M6 bez odmowy przy starcie (579), M7 rezerwa dopuszczona.
- `ai_capture_last_stand` T7 (D-3) **47/1 → 48/48**. Sąsiedzi = liczby kotwicy: `system_scope_orders` 31,
  `cross_system_targets` 8, `foreign_panel_slim` 16, `ship_panel_hud` 127, `cross_system_move_composite` 16,
  `cross_system_body_targets` 13, `warp_transit_order_gate` 49, `return_home_no_brick` 77, `return_actions_removed` 16,
  `foreign_recon_analyzed` 13, `systemid_integrity` 19, `warp_route_system` 35, `vessel_orders_seams` 46,
  `map_vessel_panel` 107, `vessel_status_label` 72.
- Sweep: worktree **350/350**, drzewo autora (`da9827c` + slice) **351/351**, 0 FAIL; `check-i18n` PASS (pl = en = 3400).

## 9. Bramka właściciela 2026-10-30 — (a)–(f) PASS

(a) kolonizacja po PPM w obcym układzie bez kolonii gracza (panel statku i rejestr) · (b) kontrola — trasa Atlas ·
(c) „Recon ciała” / „Recon układu” · (d) odmowa „Pełnego Skanu” w Dzienniku · (e) D-2 — brak akcji obcych przy
dokowalnej kolonii, normalny start · (f) predykat końca gry.

⚠ **Odstępstwo (a7) → 582.** `log(4)` nie pokazał linii „🏙 New colony”, tylko `↩ Kolonista has landed`,
`↩ Kolonista — returned to base` i dwie linie energii / brownoutu. Kolonia założona (`getColony('entity_1726')`,
`ownerEmpireId` null, `sys_046`), statek `v_26` zniknął. Ze źródła: linia założenia JEST w Dzienniku —
`_startForeignColonize` emituje `expedition:colonyFounded` → `createColony` → `colony:founded` (UIManager loguje linię
`life`) PRZED `vessel:docked`, więc stoi niżej niż obie linie floty, a dwie linie energii weszły między nią a nie
(pozycja ≥ 5; `log(10)` ją pokazuje). Obie linie floty są FAŁSZYWE: statek został zużyty, nie wylądował i nie wrócił —
`vessel:docked` służy tu do usunięcia sprite'u. → **582**.

`reg()` zwraca `foreign_recon_system` z celem `null` — z projektu: akcja na poziomie układu (strefa niesie tylko
`vesselId`, handler emituje `expedition:foreignRecon` z `targetId: null, scope: 'full_system'`).

⚠ **Skutek uboczny 578:** `_startForeignColonize` jest od tej chwili osiągalne NATURALNĄ drogą (stan B), a usuwa statek
surowym `_vessels.delete` zamiast `destroyVessel` ⇒ rośnie ekspozycja **102** (POPy załogi zablokowane na zawsze) i **107**
(jednostki w `troop_bay` osierocone) — szczegóły w rejestrze.

## 10. Granice dowodu

- Bramkę poziomu obserwatorium w sondach nadpisano (fixture bez budynku obserwatorium); sam zapis `explored` to kod
  produkcyjny.
- Warstwy rysujące panelu nie importują się pod node — model panelu i dyspozytor kliknięć są prawdziwe, rysunek
  potwierdziła bramka.
- Trasa przez stację w układzie bez portu (581) — odczyt ze źródła, niezmierzona.
- Pozycja linii założenia kolonii w Dzienniku (a7) — z kolejności w źródle, nie z odczytu karty właściciela.

## 11. Lekcja

**Akcje kontekstowe kluczuje PREDYKAT stanu statku, nigdy KSZTAŁT MISJI.** Kształt misji ma zwykle jednego producenta,
a kto schowa producenta, ten zabiera akcje razem z nim — 253 f-A zrobił to, powołując się na dwa zamienniki, które
zmierzone okazały się martwe w chwili cięcia. Usuwając powierzchnię „bo jest zamiennik”, zmierz zamiennik; pin
zamiennika musi przejść przez rysowaną strefę, nie przez handler wołany wprost.
