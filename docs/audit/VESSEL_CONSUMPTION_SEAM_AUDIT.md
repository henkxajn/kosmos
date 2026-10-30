# ZUŻYCIE STATKU POZA WALKĄ — audyt (faza A) i domknięcie (faza B)

> **Findingi 582 · 102 · 107** (✅ zamknięte) **· 584 · 585** (✅ nowe, zamknięte w tym samym commicie) **· 583 · 586 · 587**
> (otwarte). Rejestry macierzyste: 582 i 583–587 — `docs/design/VESSEL_ORDERS_PLAN.md` (§„Findingi 578–582”,
> §„Findingi 583–587”); 102 i 107 — `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` (pochodzenie:
> `docs/audit/WARP_COLONIZE_ROUTE_AUDIT.md`).
> **Faza A** (read-only): 2026-10-30, kotwica `37cb526`; pomiary w odłączonym `git worktree` w scratchpadzie (prawdziwy
> rdzeń gry, prawdziwy skok warp, prawdziwa rekrutacja) — zero zapisów w repo. Zatrzymana w kroku 2.
> **Faza B**: odpowiedzi właściciela Q1–Q5 + „stare zapisy” (2026-10-30); kod `fa69ae8` na `37cb526`.
> **Bramka właściciela — testy 1–5 PASS 2026-10-30** (klient EN, drzewo autora). Save **v101 bez migracji**, bez flagi
> (rollback = `git revert`).

## 1. Zlecenie

Jeden szew — „statek zużyty albo usunięty poza walką” — i trzy defekty na nim. Od 578 `_startForeignColonize` jest
osiągalne zwykłą grą (PPM → Kolonizuj), więc trzy stare findingi trafiają w normalną rozgrywkę:
- **102** — załoga statku kolonizacyjnego zostaje zablokowana na zawsze (nie wraca do gospodarki);
- **107** — jednostki naziemne z ładowni desantowej zostają osierocone;
- **582** — usunięcie emituje `vessel:docked` tylko po to, żeby zdjąć sprite, a dwaj narratorzy Dziennika robią z tego
  „wylądował” i „wrócił do bazy”.

Poza zakresem: 581, semantyka ładunku (wyłącznie zapis stanu), ekonomia załóg i utrzymania, kaskada etykiet 282, każda
ścieżka bojowa.

## 2. Kto usuwa statek poza walką (faza A, krok 1; numery linii na `37cb526`)

| producent | wołany przez | załoga | oddziały w ładowni | koloniści na pokładzie | zdarzenie |
|---|---|---|---|---|---|
| `VesselManager._startForeignColonize:3544` (surowe `_vessels.delete` `:3618`) | kolonizacja obca | **nierozliczona (102)** | **osierocone (107)** | stają się nową kolonią | `vessel:docked` `:3619` |
| `VesselManager.destroyVessel:1233` | wszystko niżej | zwolniona, typowana (`:1242`) | giną `transport_lost` (`:1245`) | **nierozliczeni** | `vessel:docked` `:1258` |
| ↳ `MissionSystem` `:2070` / `:2047` | kolonizacja normalna / upgrade placówki | ↑ + przestarzałe `unlockPops` | ↑ | odczytani przedtem, stają się nową kolonią | ↑ |
| ↳ `MissionSystem` `:2070` / `:1879` / `:2674` (+ `consumeShip:2678`) | katastrofy (kolonizacyjna / górnicza / zwiadu) | ↑ + zabija POP kolonii domowej | ↑ | przepadają | ↑ |
| ↳ `ColonyManager._disbandVessel:2540` | rozbiórka (🗑) | ↑ | ↑ | przepadają | ↑ + `fleet:disbanded` |
| ↳ `ColonyManager.removeColony:750` / `transferColony:874` | statki w hangarze kolonii zniszczonej / przejętej (odczyt ze źródła) | ↑ | ↑ | przepadają | ↑ |
| `_tickWreckCleanup:2040`, `DirectorFirstContact._despawn:244` | sprzątanie wraku (po walce), odlot sondy AI | — | — | — | `vessel:destroyed` |

`ExpeditionSystem` (cztery kolejne `destroyVessel`) — martwy kod bez importerów. `vessel:docked` miał pięciu słuchaczy:
dwa narratory Dziennika (`UIManager:1170` „↩ {0} — returned to base”, `:1584` „has landed”), zdjęcie sprite'u
(`ThreeRenderer:829`), puls dokowania (`:1130`) i zwolnienie orbity (`OrbitalSpaceSystem:80`).

## 3. Ścieżka wzorcowa — kolonizacja normalna (faza A, krok 2)

Sonda kładła przed każdą akcją dwa wpisy-świadki w księdze kolonii domowej, których akcja nie powinna dotknąć: załogę
rozmieszczonego okrętu i garnizon na ziemi.

- **Załoga (D-2):** zwalniana do kolonii domowej przez `destroyVessel`, natychmiast, bez względu na odległość.
- **Koloniści:** dokładnie populacja startowa nowej kolonii (2 załadowanych → 2).
- **Oddziały w ładowni (D-3):** giną `transport_lost`, rozliczane tabelą śmierci (piechota szturmowa: 0,3 POP ginie od
  razu, 0,3 wraca po 2 civY). Nie są osierocone — ale giną przy pokojowym lądowaniu.
- **Ładunek:** przepada ze statkiem przy nowej kolonii i upgradzie, dostarczany przy migracji (tylko zapis stanu).
- **Dziennik:** „↩ … returned to base” i „↩ … has landed” (oba fałszywe), potem „🏙 New colony”.

### 3a. Wyciek na samej ścieżce wzorcowej → STOP → 584

Po każdym udanym przylocie statku kolonizacyjnego `MissionSystem` wołał `unlockPops(exp.crewCost = 8, undefined)` —
`crewStrata` nigdy nie jest ustawiane, więc to nietypowane zdjęcie proporcjonalne: do 8 POP z worka blokad kolonii
domowej.

| przypadek | blokady domu przed → po | poprawnie | wywołania zarejestrowane na księdze domu |
|---|---|---|---|
| nowa kolonia (`:2103`) | 2,6 → **0** | 1,9 | `releaseCrew(0.4)` · `killCrew(0.3)` · `unlockPops(8)` |
| upgrade placówki (`:2046`) | 2,6 → **0** | 1,9 | to samo `unlockPops(8)` |
| migracja (`:1989`, statek przeżywa) | 2,6 → **0** | 2,6 | `unlockPops(8)`; zdejmuje też blokadę załogi statku, który przeżył |
| kontrola, bez świadków | 0,4 → 0 | 0 | to samo wywołanie — **bez świadków wygląda poprawnie** |

Znikające 1,9 to załoga okrętu 0,4 (dalej w służbie), garnizon 1,2 (dalej na ziemi) i oczekujący zwrot oddziału 0,3 —
te jednostki nie trzymały już POP, a ich późniejsze zwolnienia nie miały czego odjąć. Pochodzenie: `be24960`
(2026-03-11) przeniósł blokadę załogi ze startu misji na budowę statku i zostawił te zdjęcia; W2-4 naprawił identyczne
nietypowane zdjęcie w `_disbandVessel`, ale `MissionSystem` był poza zakresem W2. Nie było go w żadnym rejestrze.

### 3b. Katastrofy → 583

Gałęzie katastrof (`:1873-74`, `:2080-81`, `:2669-70`) robią to samo zdjęcie plus `removePop(null, 8|2|2)`. Zmierzona
katastrofa statku kolonizacyjnego: kolonia domowa **7,6 → 0,3 POP** (ludzie łącznie 9,63 → 0,33) — zginął każdy cały
POP, jakiego miała, choć żaden nie był na pokładzie; 2 kolonistów na pokładzie przepadło; prawdziwa załoga została
*zwolniona*, nie zabita. Bazowa szansa katastrofy **2 %**.

## 4. Ścieżka obca i rozbiórka wobec wzorca (faza A, krok 3)

**Kolonizacja obca** (prawdziwy skok warp, potem PPM na ciało; predykat UI zwrócił to ciało):
- **102 potwierdzony:** zero wywołań księgi — 0,4 POP załogi zablokowane na zawsze.
- **107 potwierdzony:** oddział zostaje `in_cargo` bez statku — trzyma blokadę 0,6 i kosztuje 2 Kr/civY utrzymania.
- **582 potwierdzony:** „🏙 New colony”, potem dwie fałszywe linie.
- Świadkowie przeżywają — ta ścieżka nie ma przestarzałego zdjęcia.

**Rozbiórka** (`fleet:disbandRequest` → `_disbandVessel` → `destroyVessel`):
- **102 obalony dla `destroyVessel`:** załoga zwolniona poprawnie, świadkowie przeżywają.
- **582 potwierdzony:** dwie fałszywe linie plus „🗑 Vessel decommissioned”.
- **NOWE (585):** koloniści na pokładzie znikają (2 → 0) — `_disbandVessel` zwraca ładunek, ale nic nie obsługuje
  `vessel.colonists`, a okno potwierdzenia nie ostrzega.
- Oddziały na pokładzie giną (`transport_lost`), choć statek stoi przy własnej kolonii.

**Kontrola bojowa** (`_turnIntoWreck`): załoga zabita, oddziały zabite, bez `vessel:docked`, Dziennik „⚰ Crew died”.

Linie Dziennika w fazie A emulowane ze słuchaczy `UIManager` (nie ładuje się pod node); linie ścieżki obcej widziane na
żywo już na bramce 578 (a7).

## 5. Decyzje właściciela (2026-10-30)

- **Q1 = (a)** — poszerzenie slice'u: trzy zdjęcia `unlockPops(exp.crewCost)` na ścieżkach sukcesu usunięte; księga
  załogi statku jest jedyną księgą. Zachowanie POP na NORMALNEJ ścieżce przypięte świadkami (załoga okrętu + garnizon +
  oczekujący zwrot) — czerwone na kotwicy, zielone po. → **584**.
- **Q2** — poza zakresem, osobny finding **583 🔴** (nie 🟠): katastrofy zabijają POP domu, który nie wsiadł, gubią
  kolonistów i zwalniają załogę zamiast ją zabić; zapisany pomiar 7,6 → 0,3 i szansa 2 %. Następny w kolejce.
- **Q3 = alternatywa** — oddziały WYSIADAJĄ na kolonię, przy której statek jest zużywany (nowa kolonia przy kolonizacji
  i upgradzie, własna przy rozbiórce), istniejącą ścieżką wyładunku transportowca. Klauzula: jeśli tej ścieżki nie da
  się wywołać z `destroyVessel` bez nowej mechaniki — STOP, rezerwa = zmierzone domyślne (`transport_lost`) w tym
  slice'ie, a „wysiadanie przy zużyciu” jako własny finding. Ścieżki bojowe bez zmian (jedna przypięta jako kontrola).
  → zaszła rezerwa, §6.
- **Q4 = tak** — koloniści na pokładzie dołączają do kolonii gracza, przy której statek stoi (zadokowany albo na
  orbicie), gdy jest usuwany; inaczej bez zmian. Bez zmiany okna dialogowego. → **585**.
- **Q5** — NEW zdarzenie `vessel:removed { vesselId, reason }`, reason ∈ colonized | outpost_upgraded | dismantled |
  colony_lost | consumed (katastrofy emitują to, co dotąd — poza zakresem); `vessel:docked` przy usunięciu już nie
  leci. Okablowanie: zdjęcie sprite'u, zwolnienie orbity, narratorzy Dziennika wg powodu (reużycie 🏙 / 🗑; nowy klucz
  tylko dla powodu bez linii — wtedy jeden PL+EN). `vessel:destroyed` zostaje bojowe.
- **Stare zapisy** — jednorazowa naprawa 107 przy wczytaniu (jednostka `in_cargo` bez żywego statku → reguła Q3 na
  ostatnim znanym ciele albo śmierć `transport_lost`), przypięta osobno, zliczana w raporcie. Wycieki 102 zostają jak
  W2 decyzja 8.
- **Po bramce** — rezerwa Q3 i 586 przyjęte; do 586 dopisane wywołanie nr 2 (koloniści znikają przy rozbiórce przy
  placówce albo stacji); wywołania nr 1–6 (§7) potwierdzone.

## 6. Q3 — dlaczego rezerwa, a nie wysiadanie

Ścieżka wyładunku transportowca (`CargoLoadModal` „Wyładuj” → `cargoUnloadRefusal` + `unloadGroundUnit(vessel, unit,
planetId, unit.q, unit.r)`) kładzie jednostkę na współrzędnych, które miała na ciele ZAŁADUNKU (Finding 349). Siatki
heksów różnią się per ciało (generator map: ok. 36–244 heksów, kształt zwężany), więc na nowej kolonii jednostka
wylądowałaby na oceanie albo poza mapą. Placówki podniesione do kolonii nie mają `colony.grid` (siatka jest wyłącznie
w `buildingSystem._grid`), więc nie ma gdzie szukać wolnego heksu. Poprawne wysiadanie wymaga rozmieszczenia na mapie
CELU — nowej mechaniki ⇒ klauzula STOP zaszła: oddziały giną ze statkiem jak na ścieżce wzorcowej, a „wysiadanie przy
zużyciu” → **586**.

## 7. Wykonanie (faza B, `fa69ae8`)

- `VesselManager.destroyVessel(id, { reason = 'consumed', legacyDockedEmit = false })` — JEDEN szew:
  `_settleCrewOnLoss(vessel, 'released')` → `_settleColonistsOnRemoval` (Q4; pomijane przy `legacyDockedEmit`) →
  `_killCargoGroundUnits` (Q3, rezerwa) → wypięcie z `colony.fleet` → usunięcie z rejestru →
  `vessel:removed { vesselId, vessel, reason, atBodyId }` (`:1283`). Przy `legacyDockedEmit: true` — dawne
  `vessel:docked` i koniec.
- `_settleColonistsOnRemoval` (`:1292`) — gospodarz = kolonia przy `position.dockedAt`, wyłącznie PEŁNA kolonia gracza
  z `civSystem`; statek AI, placówka i stacja — bez zmian; koloniści dołączają przez `unloadColonists`.
- `_startForeignColonize` (`:3693`) — po założeniu kolonii `vessel.colonists = 0` (ludzie są już w nowej kolonii, bez
  podwójnego liczenia), potem `destroyVessel(…, { reason: 'colonized' })` zamiast surowego usunięcia.
- `MissionSystem` — trzy `unlockPops(exp.crewCost)` usunięte (komentarze „Finding 584” w miejscu); upgrade placówki →
  `outpost_upgraded` (kolonistów zeruje istniejąca linia przed szwem), nowa kolonia → `colonized` (koloniści zerowani
  defensywnie); katastrofy (`:1879`, `:2070`, `:2677`) → `legacyDockedEmit: true` (granica 583), ich złożone zdjęcia
  nietknięte.
- `ColonyManager` — `removeColony` / `transferColony` → `colony_lost` (statki niszczone PRZED zmianą właściciela, więc
  koloniści zostają z kolonią — giną z nią albo zostają przy przejęciu); `consumeShip` → `consumed`; `_disbandVessel` →
  `dismantled`.
- Słuchacze: `ThreeRenderer:835` (sprite + fokus kamery, bez pulsu doku), `OrbitalSpaceSystem:91` (`releaseOrbit`),
  `UIManager:1178` (narrator przez NEW `utils/VesselRemoval.js` — zbiór powodów + `removalJournalKey`).
- 107 w starych zapisach — `VesselManager.repairCargoOrphansAfterLoad()` (`:1341`), wołane w bloku wczytania
  `GameScene` (`:2387`) zaraz po odtworzeniu jednostek naziemnych: sierota, której ciało załadunku jest kolonią jej
  właściciela, wysiada transportową ścieżką wyładunku (współrzędne pochodzą z TEJ SAMEJ mapy, więc ścieżka jest tam
  poprawna); inna ginie `transport_lost`. Wynik w `_lastCargoOrphanRepair { disembarked, killed }`.
- i18n — jeden klucz `log.vesselLostWithColony` PL+EN („✖ {0} lost with colony {1}”).

### Wywołania w ramach decyzji (potwierdzone przez właściciela po bramce)

1. **Q4 obejmuje `colony_lost`** — koloniści z hangaru dołączają do kolonii przed zmianą właściciela; oddziały na tych
   statkach giną `transport_lost` (lista Q3 nie obejmuje utraty kolonii).
2. **Q4 pomija placówki i stacje** — placówka nie ma populacji, więc koloniści zadokowani tam dalej znikają → **586**.
3. **Katastrofy zachowują dzisiejsze zachowanie** przez jawne `legacyDockedEmit: true`; domyślnym dla każdego nowego
   wołającego jest `vessel:removed`. Jedynym żywym wołającym `consumeShip` jest dawna gałąź katastrofy zwiadu — ona
   emituje teraz `vessel:removed{consumed}`.
4. **Dziennik** — kolonizacja i upgrade: istniejąca linia 🏙 (`colony:founded`); rozbiórka: 🗑 (`fleet:disbanded`);
   `consumed` bez linii (wołający ma meldunek katastrofy); `colony_lost` — jedyny nowy klucz.
5. **Naprawa 107** — sierota na kolonii swojego właściciela wysiada (współrzędne z tej samej mapy), inna ginie.
6. **„Oczekujący zwrot oddziału” jako świadek** — to udział zwrotu oddziału z samego statku kolonizacyjnego (0,3), bo
   przy rezerwie oddział ginie przy przylocie.

### Testy

- NEW keeper `src/testing/smoke/vessel_consumption_smoke.mjs` **82/82**: C1 kolonizacja normalna (świadkowie: 1,9 po
  przylocie, 1,6 po 2,5 civY) · C2 upgrade placówki · C3 migracja (blokady bez zmian, prawdziwy dok emituje
  `vessel:docked`) · C4 kolonizacja obca przez prawdziwy skok warp i PPM (102 / 107 / 582, bez podwójnego liczenia) ·
  C5 rozbiórka (585) · C6 przejęcie kolonii · C7 `consumeShip` · C8 KONTROLA bojowa (`_turnIntoWreck`, sprzątanie wraku
  `vessel:destroyed`) · C9 granica 583 · C10 naprawa 107 + pin montażu w `GameScene` · C11 okablowanie (zwolnienie
  orbity wykonaniem; renderer, `UIManager`, helper, i18n) · C12 `unlockPops(exp.crewCost` w `MissionSystem` dokładnie
  raz (gałąź katastrofy).
- Fail-first na `37cb526` (odłączony `git worktree`): **42 PASS / 40 FAIL** — czerwone wyłącznie piny naprawy (C1a/e/f/i,
  C2a–c, C3a, C4a–c/e/f/i/j, C5b–e, C6a–c, C7a/b, C10a–c/e–h, C11a/c/f–h/j–l, C12a); kontrole zielone po obu stronach.
- Bateria 8 mutantów, każdy zabity przez swoje piny i przywrócony bit w bit: M1 bez rozliczenia kolonistów (C5b, C5c,
  C6a) · M2 kolonizacja obca bez zerowania kolonistów (C4h, C4i) · M3 katastrofa traci zachowanie sprzed 582 (C9a, C9b)
  · M4 przestarzałe `unlockPops` wraca do migracji (C3a, C12a) · M5 naprawa 107 zabija każdą sierotę (C10a, C10b, C10f)
  · M6 naprawa 107 ignoruje własność (C10a, C10c, C10f) · M7 `destroyVessel` emituje też `vessel:docked` (sześć pinów) ·
  M8 `destroyVessel` nie zwalnia załogi (sześć pinów).
- Sąsiedzi bez zmian: `foreign_actions` 77, `ai_capture_last_stand` 48, `ship_panel_hud` 127, `system_scope_orders` 31,
  `w2_crew_ledger` 65, `w2_deploy_model` 27, `w2_reserve_upkeep` 27, `deploy_seams` 38, `w2_deploy_ui` 23,
  `w2_ai_mobilization` 39, `w2_migration_v101` 21, `g1c_pop_loss` 86, `ground_unit_loss` 29, `sb2b_wreck_cargo` 17,
  `sb2b_wreck_still` 11, `load_colonists` 27.
- Sweep **352/352, 0 FAIL, 29 advisory** — drzewo autora i czysty worktree LF (patch przez `git apply`); `check-i18n`
  PASS (pl = en = 3401).
- Sondy (`probe-vessel-consumption*.mjs`, `probe-gate-helpers.mjs`) biegły w worktree w scratchpadzie i nie weszły do
  repo — zakres commitu kodu podpisał właściciel; ich liczby są w tym dokumencie. Jednolinijkowce bramki (pomocnik
  `__g`) sprawdzone wykonaniem na silniku przed przekazaniem.

## 8. Bramka właściciela 2026-10-30 — testy 1–5 PASS (drzewo autora, klient EN)

1. **Kolonizacja obca** — blokady 3,6 → 2,9, ludzie 132,94 → 132,64, statek zniknął, brak `ORPHAN`; zdarzenia
   `groundUnit:destroyed · gu_1 · transport_lost` + `vessel:removed · Gate-F · colonized`, **bez `vessel:docked`** dla
   Gate-F; „🏙 New colony: Nekkar d”; nowa kolonia — ludzie 2.
2. **Kolonizacja normalna ze świadkami** (14 okrętów-świadków + załadowane jednostki) — blokady 5,2 → 4,5 przy
   przylocie → 4,2 po zwrocie, oczekujący `gu_4:0.3` → `[]`, wszyscy świadkowie nietknięci; GJ-2653 f — ludzie 2.
3. **Rozbiórka** — blokady 5,2 → 4,5, ludzie 130,697 → 134,397 (4 kolonistów na pokładzie, +3,7);
   `vessel:removed · dismantled` + `transport_lost`, bez `vessel:docked`, brak `ORPHAN`.
4. **Kontrola bojowa** — wyłącznie `vessel:wrecked`, linia ⚰, blokady i ludzie −0,4, `isWreck` true.
5. **Naprawa 107 przy wczytaniu** — `_lastCargoOrphanRepair {disembarked:['gu_6'], killed:[]}`, jednostka bezczynna,
   brak `ORPHAN`.

Odstępstwa (żadne nie blokuje):
- `__load` uruchomione dwa razy na Gate-N i Gate-D (2 jednostki / 4 kolonistów na pokładzie) — oczekiwania przeliczone,
  zmierzone wartości zgodne.
- Gate-N poleciał do `sys_046` zamiast startu z domu i tam zaparkował (blokady stałe); test 2 powtórzony statkiem
  Gate-N2 z doku domowego.
- Linia 🗑 brzmi „Vessel decommissioned: hull_medium” — id kadłuba zamiast nazwy statku. Ze źródła PRE-EXISTING →
  **587** (bez kodu).
- Wrak `v_31` zachowuje `serviceState 'active'` przy `isWreck` true — ścieżka bojowa, poza zakresem. **Już znane**:
  to przesłanka Findingu **425** (`AI_STRIKES_BACK_PLAN.md` §425 — wrak przechodzi bramki `orbiting` i „w służbie”;
  425 zamknął tylko `redispatchFromOrbit`). Nie zgłaszane ponownie; pozostałych konsumentów `isInService` tu nie
  przeglądano.
- Lista świadków pokazuje `Kolonista:0.4` — to `v_26`, zużyty STARĄ ścieżką obcą na bramce 578: **żywy wyciek 102
  potwierdzony w grze**, nienaprawialny (W2 decyzja 8 — tej blokady nie da się odróżnić od innych w księdze kolonii).

## 9. Granice dowodu

- Okablowanie `ThreeRenderer`, `UIManager` i `GameScene` pinowane źródłowo (te pliki nie importują się pod node); linie
  Dziennika i wywołanie naprawy 107 potwierdziła bramka (testy 1, 3, 5). Zdjęcia sprite'u bramka nie odczytywała osobno.
- Linia `colony_lost` (`log.vesselLostWithColony`) — nie widziana w grze (bramka nie ćwiczyła utraty kolonii); pokrywa
  ją keeper C6 + C11.
- Ścieżka `consumeShip` — wyłącznie keeper C7.
- Osiągalność 586 (b) — rozbiórka przy placówce albo stacji — niezmierzona: `_disbandVessel` wymaga stanu `docked`
  i stoczni w kolonii `vessel.colonyId` (`ColonyManager:2481-2491`).
- Wycieki 102 w istniejących zapisach zostają (W2 decyzja 8) — świadek `Kolonista:0.4` w §8.

## 10. Lekcja

**Usunięcie statku poza walką idzie przez JEDEN szew — `destroyVessel` — a `vessel:docked` nie jest zdarzeniem
usunięcia.** Zużycie udawało dok, bo dok miał już słuchacza, który zdejmował sprite; ten sam sygnał miał jednak dwóch
narratorów, którzy opowiadali o statku, którego już nie było. Drugi usuwacz obok szwu (`_startForeignColonize`) pominął
całe rozliczenie — dwie implementacje tej samej czynności to dwie różne listy sprzątania.

**Ścieżka wzorcowa też jest hipotezą.** Zlecenie kazało odczytać D-2 / D-3 z działającej ścieżki — a ta sama gubiła
POP, i bez świadków (niezależnych wpisów w księdze) nietypowane zdjęcie wyglądało poprawnie (kontrola 0,4 → 0).
