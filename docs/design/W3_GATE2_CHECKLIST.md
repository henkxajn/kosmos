# W3 — GATE 2: OKRĘTY AI WYCHODZĄ Z DOMU (checklista live) — **WYDANIE 2**

**Slice:** W3 (ofensywne AI) · **Commity:** `1e57d1b` (W3-3, dominacja przeżywa wczytanie) ·
`4724e46` (W3-4, rozkaz uderzenia + D6 + naprawa `_holdAtHome`) ·
`369adfc` (**W3-4b-1**, uderzenie międzygwiezdne leci przez SKOK) ·
`cb815cd` (**W3-4b-2**, księga bierze układ CELU + koniec obrońcy-widmo) ·
`a7b84bd` (**W3-4c**, dźwignia rajdera + `same_system`)
**Plan:** `docs/design/W3_PLAN.md` · **Poprzedni gate:** `W3_GATE1_CHECKLIST.md` (ZDANY 2026-08-17)
**Stan przed gate'em:** sweep **143/143 OK, 0 FAIL** · `check-i18n` **PASS** (pl = en = 3242) ·
`w3_raider_lever` **24/24** · `w3_cross_system_attack` **42/42** · `w3_attack_dispatch` **35/35** ·
`w3_dominance_persist` **16/16** · zapis **v101, bez migracji**

> ### ⚠ CO SIĘ ZMIENIŁO OD PRÓBY z 2026-08-18 (blokada narzędziowa)
>
> Miałeś rację, że nie tknąłeś paliwa ręcznie. Sceny międzygwiezdnej **nie dało się postawić**
> żadną zwalidowaną dźwignią: Sandbox stawia wyłącznie FRG-3 (`warpFuel.max: 0` — celowy brak
> baku w katalogu), a `spawnEnemyAttack` przy domyślnej sile ląduje na `hull_medium`, też bez baku.
> **§1 dostał nową dźwignię `L3` (`spawnEnemyRaider`)** — jedno wywołanie stawia rajdera zdolnego
> do skoku, z pełnym bakiem, w innym układzie, z właścicielem wziętym z AKTYWNEJ wojny.
> Reszta gate'u bez zmian; wznawiasz od §1 L3, potem §2.
>
> Druga nota (`issueWarp` do własnego układu) też załatwiona: powód to teraz kanoniczny
> **`same_system`**, nie `dispatch_failed`. Świadomie **nie** dokładałem `already_in_system` —
> stała, mapowanie w UI i tekst PL/EN („Statek już tu jest") istniały od dawna, a druga nazwa
> na to samo zdarzenie byłaby drugim słownikiem.

> ### ⚠ DLACZEGO WYDANIE 2 — przeczytaj, zanim wznowisz
>
> Wydanie 1 przerwałeś na realnym defekcie i miałeś rację. **Sekcje §2/§3 zostały przepisane:
> teraz WYMAGAJĄ, żeby napastnik startował z INNEGO układu niż cel.** To nie jest utrudnienie —
> to jest scenariusz PODSTAWOWY (stolica AI prawie nigdy nie dzieli układu z graczem), a wydanie 1
> testowało go tylko przez przypadek konfiguracji.
>
> Co było zepsute i jest naprawione (reprodukcja headless 1:1 z Twoją obserwacją):
> rozkazy ruchu są **wewnątrzukładowe** (gwiazda każdego układu stoi w (0,0)), a identyfikatory
> ciał są **globalne** — więc `attack` na planetę z innego układu leciał do JEJ współrzędnych
> odmierzonych od **własnej** gwiazdy i meldował się jako zadokowany przy ciele, którego w tym
> układzie nie ma. Bitwa i dominacja księgowały się dla układu **napastnika**.
>
> **Odpowiedź na Twoje pytanie „czemu obrona Bastionu biła się w sys_025": nie biła się.**
> `_buildPlayerBattleUnit` dla układu, w którym gracz nie ma niczego, nie mówi „nie ma obrońcy" —
> **fabrykuje jednostkę-widmo o 100 HP i ZERO broni** (`playerVesselsToBattleUnit` na pustej
> liście). AI wygrało z workiem treningowym, a księga obciążyła Cię udziałem przegranego.
> Teraz: układ bierze się z **CELU**, a bez gracza w układzie **bitwy w ogóle nie ma**.

> **CO TU SPRAWDZAMY, w jednym zdaniu:** czy wrogi okręt potrafi **wyjść z domu z zamiarem
> uderzenia** i czy przylot **naprawdę kończy się bitwą** — po raz pierwszy w historii tej gry.
>
> Do W3-4 nie potrafił. Cały potok uderzenia orbitalnego istniał i był poprawny (batchowanie,
> automatyczne wypowiedzenie wojny, księgowanie, dominacja, wraki), ale `EnemyAttackHandler`
> bramkuje go na `mission.type === 'attack'`, a jedynym producentem tej misji w całym drzewie
> był **cheat debugowy**. Równolegle jedyny żywy kanał rozkazów AI budował `move_to_point`.
> Te dwa fakty nigdy nie zostały złączone: flota AI mogła dolecieć nad Twoją planetę i **NIC**
> się nie działo.

⚠ **ZAKRES — przeczytaj, zanim zaczniesz.** Ten gate sprawdza **MECHANIZM** uderzenia
(rozkaz `attack` → lot → bitwa) oraz dwie naprawy, które jadą razem z nim (dominacja
przeżywająca wczytanie, bramka rezerwy). **Nie sprawdza, KOGO i KIEDY AI wybierze na cel** —
regułę wyboru celu dowozi **W3-5** i to ona dokłada §8 (autonomia) do tej samej listy.
Dziś cel wskazujesz Ty, dźwignią debugową; silnik ma udowodnić, że **umie go wykonać**.

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia · **nigdy nie filtruj Dziennika po WYŚWIETLANYM TEKŚCIE** — filtruj po rodzaju
zdarzenia (grasz po angielsku, polski grep zwróci pustkę przy wpisie widocznym na ekranie) ·
⚠ **kolonie i statki wybieraj po STEMPLU WŁASNOŚCI, nigdy po nazwie** (§Findings 20 — na tym
GATE 1 utknął).

**Walidacja one-linerów:** wszystkie polecenia poniżej **WYKONANE** na żywym silniku przed
wpisaniem tutaj (`GameCore` + prawdziwe `MovementOrderSystem`/`WarSystem`/`ColonyManager`).
Wyjątkiem są dźwignie `KOSMOS.debug.*` i Sandbox, które żyją tylko w przeglądarce — te są
przepisane z GATE 1, gdzie zadziałały.

---

## 0. Przygotowanie

- [ ] **CC nie pracuje.** Żadnego równoległego zapisu do repo.
- [ ] Odśwież grę (Live Server), otwórz konsolę (F12).
- [ ] ⚠ **Zrób kopię bieżącej gry do pliku** (menu ☰ → „Zapisz do pliku").

---

## 1. Środowisko: SANDBOX BOJOWY

Ten sam grunt co w GATE 1 — wojna jest wypowiedziana, obie strony mają **prawdziwe okręty**,
flagi walki są włączone.

- [ ] Ekran tytułowy → uruchom **Sandbox Bojowy**.

**L1 — kim jesteś, co masz i W KTÓRYM UKŁADZIE (po STEMPLU, nie po nazwie):**

`KOSMOS.colonyManager.getPlayerColonies().map(c => [c.planetId, c.name, KOSMOS.vesselManager._findEntity(c.planetId)?.systemId])`

Oczekiwane: **Bastion** i tylko Bastion, z układem. To jest jedyny prawidłowy sposób zapytania
„co należy do mnie" — `getAllColonies()` zwraca kolonie WSZYSTKICH właścicieli.
⚠ `KOSMOS.entityManager` **nie istnieje** — układ ciała czyta się przez
`KOSMOS.vesselManager._findEntity(id)?.systemId` (sprawdzone).

**L2 — wrogie okręty: id, UKŁAD, stan służby, bak warp:**

`Array.from(KOSMOS.vesselManager._vessels.values()).filter(v => v.ownerEmpireId === 'emp_sandbox_enemy').map(v => [v.id, v.name, v.systemId, v.serviceState, v.warpFuel?.max])`

- [ ] Zobaczysz trzy **Łowcy** z `warpFuel.max: 0`. **To jest POPRAWNE, nie usterka:** Sandbox
      stawia `frigate_system_defender`, a ten okręt ma w katalogu **CELOWY brak baku warp** —
      z założenia nie opuszcza swojego układu. Do sceny obronnej idealny, do ofensywnej ślepy.

**L3 — DŹWIGNIA GATE'U: rajder zdolny do skoku, postawiony poza Twoim układem**

Jedno wywołanie stawia całą scenę. Nie edytuj paliwa ani pozycji ręcznie — nie trzeba i nie wolno.

`KOSMOS.debug.spawnEnemyRaider({ autoOrder: false })`

- [ ] Zwrotka niesie **`warpCapable: true`**, `warpFuel: { current: N, max: N }` (bak PEŁNY),
      `systemId` **inny** niż Twój, oraz `empireId` = **`emp_sandbox_enemy`** (właściciel idzie
      za AKTYWNĄ WOJNĄ — dokładnie ta pomyłka zafałszowała kiedyś kontrolę w GATE 1).
- [ ] Zapisz `vesselId` ze zwrotki — to Twój napastnik na resztę gate'u.
- [ ] Pole `nextStep` w zwrotce podaje gotowe polecenie do §2 L4.

⚠ `autoOrder: false` zostawia rajdera bezczynnego, żebyś mógł przejść kroki §2 ręcznie.
Bez tego argumentu dźwignia **od razu** wydaje uderzenie prawdziwą ścieżką (skok → uderzenie) —
przydatne do zwykłej zabawy, nieprzydatne, gdy chcesz zobaczyć każdy etap.
⚠ Równoważne wejście, jeśli masz w palcach starą nazwę: `KOSMOS.debug.spawnEnemyAttack({ warpCapable: true, autoOrder: false })`.
⚠ Opcje: `{ empireId, systemId, templateId, targetBodyId, distanceAU }`. `templateId` domyślnie
`frigate_laser_escort`; podanie szablonu bez baku (np. `frigate_system_defender`) zwróci
**`warpCapable: false`** i czerwony wpis w konsoli — dźwignia sprawdza kontrakt, nie zakłada go.

---

## 2. SEDNO — uderzenie MIĘDZYGWIEZDNE zaczyna się od SKOKU

**L4 — najpierw dowód, że goły rozkaz NIE UDAJE, że umie to zrobić:**

`KOSMOS.movementOrderSystem.issueOrder('<vesselId>', { type: 'attack', targetBodyId: '<planetId Bastionu>', bypassFuelCheck: true })`

- [ ] Zwrotka **`{ ok: false, reason: 'target_other_system' }`**.
      To jest naprawa z wydania 1: rozkazy ruchu są wewnątrzukładowe i teraz mówią to wprost,
      zamiast lecieć w losowe miejsce własnego układu.

**L5 — właściwa dźwignia (fasada, która umie złożyć skok z podejściem):**

`KOSMOS.orderService.issueAttack('<vesselId>', { targetBodyId: '<planetId Bastionu>' })`

- [ ] Zwrotka **`{ ok: true, composite: true }`** — „composite" znaczy: NAJPIERW skok.

**L6 — co robi statek TERAZ:**

`KOSMOS.vesselManager.getVessel('<vesselId>').mission.type`

- [ ] Wynik **`'interstellar_jump'`**. Okręt naprawdę leci między gwiazdami — D4: gracz ma to
      **zobaczyć sensorami**, a nie zastać pod planetą.

**L7 — a zamiar czeka zapisany:**

`KOSMOS.vesselManager.getVessel('<vesselId>').pendingOrder`

- [ ] `{ kind: 'attack', targetId: '<Bastion>', targetSystemId: 'sys_home', … }`.
      Pole jest serializowane, więc uderzenie **przeżyje zapis w locie**.
- [ ] Na mapie galaktyki (STRATCOM) widać okręt w warpie.

⚠ Jeśli L5 zwróci `{ ok: false, reason: 'not_warp_capable' }` albo `dispatch_failed` — wybrany
kadłub nie ma baku warp. Wróć do L2 i weź taki z `warpFuel.max > 0`.
⚠ Jeśli zwrotka to `{ ok: false, reason: 'vessel_in_reserve' }` — to kadłub w magazynie.
Zachowanie POPRAWNE (§5); weź okręt ze stanem `active`.

---

## 3. Przylot → uderzenie → BITWA (łańcuch domyka się SAM)

- [ ] Przyspiesz czas i poczekaj na koniec skoku (ETA:
      `KOSMOS.vesselManager.getVessel('<vesselId>').mission.arrivalYear`, bieżący rok:
      `KOSMOS.timeSystem.gameTime`).

**L8 — po wyjściu z warpu (JEDNO polecenie, cztery fakty):**

`(v => [v.systemId, v.mission?.type, v.mission?.targetId, v.pendingOrder])(KOSMOS.vesselManager.getVessel('<vesselId>'))`

- [ ] `systemId` = **`sys_home`** (statek JEST w Twoim układzie),
      `mission.type` = **`'attack'`** (fasada sama wydała uderzenie po przylocie),
      `mission.targetId` = **Bastion**, `pendingOrder` = **`null`** (zamiar skonsumowany —
      dostawa jednokrotna, bez ryzyka podwójnego rozkazu).

- [ ] Okręt leci teraz ku Bastionowi **wewnątrz** Twojego układu — widać go na mapie 3D
      i (jeśli jest w zasięgu) w sensorach.

- [ ] Bitwa **wybucha sama** po dotarciu — bez żadnej dalszej akcji z Twojej strony.

**L9 — ślad audytowy, filtrowany po RODZAJU (nigdy po tekście) — NAJPIERW CAŁY pierścień:**

`[KOSMOS.debugLog.query({}).length, KOSMOS.debugLog.query({ kind: 'battle:resolved' }).length]`

- [ ] Drugi licznik **wzrósł**. (Ścieżka orbitalna daje **jeden** wpis na bitwę; podwójny wpis
      to właściwość DSCS — surowy emit + zaksięgowany, patrz GATE 1 L4.)

⚠ **Pierwszy licznik jest tu po to, żeby odróżnić dwie różne rzeczy** (zmierzone: pierścień mieści
**10 000** wpisów, a gra generuje ~48/rok gry, czyli ~1 700 przez trzy lata wyświetlane — **wyparcie
starych wpisów jest WYKLUCZONE** w sesji tej długości):
- pierwszy licznik **mały/zerowy** → pierścień został **wyczyszczony** (robi to KAŻDY reload —
  jeśli robiłeś już §4 z F5, to jest poprawne i nie ma czego szukać) albo `DebugLog` stracił
  subskrypcję;
- pierwszy licznik **duży**, a drugi **zero** → to **dziura w śladzie audytowym**, nie eviction.
  Zapisz obie liczby — to wtedy osobny commit.

**L10 — i że to poszło do KSIĘGI, a nie obok niej:**

`KOSMOS.warSystem.getWarWith('emp_sandbox_enemy')`

- [ ] `battles.length` urosło, `exhaustion` się ruszyło. To jest W1-4 + W3-2 pracujące pod
      spodem — uderzenie AI od pierwszego dnia jest **księgowane**, nie jest osobną, cichą ścieżką.

⚠ **Jeśli z JEDNEGO przylotu wypadną DWIE bitwy — to nie są dwie rundy.** Zweryfikowane w kodzie:
jedno starcie księguje się **dokładnie raz** (`_finalizeBattle` zamyka je flagą `isActive=false`),
więc rundy NIE napędzają wyczerpania. Dwie bitwy = dwa STARCIA, a mechanizm to
**odwrót-i-ponowne-podejście**: AI wycofuje się przy ≤20 % HP, odwrót księguje się jako
**PRZEGRANA z żywym okrętem**, a cooldown starcia (1 rok) mieści się w kilkuletnim podejściu.
Potwierdzisz to jednym odczytem — w PIERWSZYM rekordzie:

`(w => KOSMOS.gameState.get('battles.' + w.battles[0])?.result?.retreated ?? KOSMOS.gameState.get('battles.' + w.battles[0])?.retreated)(KOSMOS.warSystem.getWarWith('emp_sandbox_enemy'))`

- [ ] Jeśli wyjdzie `'A'` (albo `'B'`) — potwierdzone, to był odwrót, nie osobna runda.

**L11 — ⚠ NAPRAWA Z WYDANIA 1: w KTÓRYM układzie zapisała się bitwa:**

`(w => KOSMOS.gameState.get('battles.' + w.battles[w.battles.length - 1])?.location)(KOSMOS.warSystem.getWarWith('emp_sandbox_enemy'))`

- [ ] `systemId` to **układ CELU** (`sys_home`). W wydaniu 1 był tu `systemId` NAPASTNIKA obok
      `planetId` z Twojego układu — rekord wewnętrznie sprzeczny.

⚠ **Kształt reszty rekordu MÓWI, KTÓRA ŚCIEŻKA walczyła** — obie są poprawne (zmierzone):
- `planetId: '<Bastion>'`, `point: null` → **bitwa orbitalna nad planetą**
  (`EnemyAttackHandler`): rajder doleciał nad kolonię i zmierzył się z jej obroną.
- `planetId: null`, `point: {x,y}` → **starcie w przestrzeni** (`DeepSpaceCombatSystem`):
  rajder został **przechwycony w drodze** przez Twoje okręty i nie dotarł nad planetę.
  To NIE jest usterka zapisu — to inna, równie prawdziwa historia tego samego przylotu.

**L12 — i kto naprawdę bronił:**

`KOSMOS.warSystem.hasPlayerPresenceInSystem('sys_home')`

- [ ] **`true`** — bitwa odbyła się tam, gdzie faktycznie coś masz.
- [ ] Kontrola: `KOSMOS.warSystem.hasPlayerPresenceInSystem('<układ napastnika>')` → **`false`**.
      Tam bitwy być NIE MOŻE (przed naprawą właśnie tam się „odbyła", przeciw obrońcy-widmo).

---

## 4. Dominacja orbitalna PRZEŻYWA WCZYTANIE (W3-3)

To jest defekt, który psuł funkcję zbudowaną NA NIM: wróg wygrywał bitwę nad Twoją planetą
i trzymał orbitę — a po zapisie i wczytaniu ta wiedza **znikała**, bo klucz nie był
zadeklarowany w `createDefaultState` i `restore` wyrzucał go bez słowa.

**L13 — kto trzyma orbitę:**

`KOSMOS.gameState.get('orbitalDominance')`

- [ ] Jest wpis dla **`sys_home`** (układ bitwy) z `controllerId` **zwycięzcy** —
      i **NIE MA** wpisu dla układu napastnika. To druga połowa naprawy z wydania 1.

**L14 — co na to bramka desantu:**

`KOSMOS.warSystem.playerHasOrbitalDominance('<planetId Bastionu>')`

- [ ] Gdy orbitę trzyma WRÓG → **`false`** (desantu nie ma).
      Gdy trzymasz Ty → `true`.

- [ ] **Zapisz grę, F5, wczytaj.** Powtórz **L13** i **L14**.
- [ ] ⚠ **Obie odpowiedzi TE SAME co przed reloadem.** Przed W3-3 mapa wracała pusta, a bramka
      desantu spadała do reguły „pusta orbita = wolna droga" i po cichu oddawała Ci orbitę,
      której nie odbiłeś (albo kazała drugi raz wygrywać tę samą bitwę).

---

## 5. Kadłub w REZERWIE nie przyjmuje rozkazów (D6)

Dziura w zbiorze wykluczeń W2: `issueOrder` nie sprawdzało służby, a pościg startuje z pominięciem
bramkowanej ścieżki wysyłki — więc menu PPM potrafiło latać **magazynem**: darmowy okręt wojenny,
zero załogi, 10 % utrzymania.

- [ ] Weź WŁASNY okręt i wycofaj go ze służby: `KOSMOS.debug.withdrawVessel('<vesselId>')`
- [ ] Odczekaj **jeden wyświetlany miesiąc** (mobilizacja trwa 1.0 civYear) i sprawdź:
      `KOSMOS.vesselManager.getVessel('<vesselId>').serviceState` → **`'stored'`**
- [ ] Teraz spróbuj wydać mu rozkaz — PPM na mapie **albo** wprost:

`KOSMOS.debug.issueOrder('<vesselId>', { type: 'moveToPoint', targetPoint: { x: 0, y: 0 } })`

- [ ] Zwrotka: **`{ ok: false, reason: 'vessel_in_reserve' }`**.
- [ ] To samo dla **Ścigaj** z menu PPM (to była realna dziura, nie teoria).
- [ ] Komunikat w interfejsie jest **po ludzku** (grasz po angielsku: *„Hull in reserve — crew it
      first (Deploy)"*), a nie surowym kodem `vessel_in_reserve`.
- [ ] `KOSMOS.debug.deployVessel('<vesselId>')` + miesiąc → ten sam okręt **przyjmuje** rozkaz.
      (Bez tego kroku „odmowa" jest nieodróżnialna od zepsutego rozkazu.)

---

## 6. Garnizon AI potrafi wrócić do domu (naprawa `_holdAtHome`)

Doktryna „obrona domu" działała wyłącznie dla okrętów, które **i tak już stały w domu**: rozkaz
powrotu szedł bez punktu docelowego, walidator go odrzucał, a okręt wypadał z doboru. Keeper tego
nie łapał, bo spawnował garnizon już zadokowany przy stolicy.

- [ ] W konsoli **nie ma** ostrzeżeń `[DirectorDoctrine] rozkaz odrzucony` z powodem
      `missing_target_point`.
- [ ] (Opcjonalnie, w zwykłej grze z żywym Directorem) okręty AI z rosteru `defend_home`, które
      znalazły się poza stolicą, **wracają** do niej zamiast dryfować.

---

## 7. Brak regresji

- [ ] Zwykła gra wstaje, kolonie liczą, czas płynie.
- [ ] **Twoje** rozkazy działają jak dotąd: „Leć do", Ścigaj, Zaangażuj, Powrót, Dokuj.
- [ ] Bitwy lądują w Dzienniku na kanale **Walka** (nie „system").
- [ ] Konsola bez `TypeError`.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Sandbox: wojna, okręty obu stron, **rajder z dźwigni L3 stoi w INNYM układzie** (bak pełny) | |
| 2. **Goły rozkaz odmawia (`target_other_system`), fasada robi SKOK** (`composite: true`) | |
| 3. **Po wyjściu z warpu misja sama staje się `attack` → BITWA** i trafia do księgi | |
| 3b. **Bitwa i dominacja zapisane w układzie CELU**, obecność gracza `true` | |
| 4. **Dominacja orbitalna przeżywa zapis → F5 → wczytanie** | |
| 5. Rezerwa nie przyjmuje rozkazów (`vessel_in_reserve`, komunikat po ludzku) | |
| 6. Garnizon AI potrafi wrócić do stolicy | |
| 7. Brak regresji, konsola czysta | |

**GATE 2:** ☑ **ZDANY 2026-08-18** (wyd. 2, prowadzony przez Filipa) ☐ ZDANY WARUNKOWO ☐ NIEZDANY

Łańcuch uderzenia miedzygwiezdnego udowodniony NA ŻYWO od poczatku do konca: gola odmowa
(`target_other_system`) → fasada sklada (`composite: true`) → `interstellar_jump` z zamiarem
w `pendingOrder` (`awaiting_warp`) → przylot konsumuje zamiar (`null`) → podejscie ~2.7 roku
(zmierzone deltami pozycji) → bitwa → ksiega bierze uklad CELU (`sys_home`) → asymetria co do
cyfry (7,2/1,6 = dwie przegrane rajdera po 9/2 x 0,4) → obecnosc gracza `[true, false]`, zero
obronmcy-widmo → wrak w ukladzie bitwy → dominacja TYLKO dla `sys_home` (`controllerId: player`)
i **bit w bit identyczna po zapisie/F5/wczytaniu**. §5 pokryte keeperami (brak kadlubow gracza
w Sandboksie), §6/§7 czysto.

Trzy pytania domkniete POMIAREM — `W3_PLAN.md` §A1-A3: ksztalt `location` mowi, KTORA sciezka
walczyla (obie poprawne) · eviction pierscienia WYKLUCZONY (10 000 pojemnosci vs ~48 wpisow/rok
gry) · rundy NIE ksieguja sie osobno (jedno starcie = jedna bitwa), wiec wycena pokoju w W4 jest
bezpieczna. Trzy znaleziska z przebiegu: §Findings 32 (przylot AI oglaszany jako wlasny), 33
(nawigacja w obcych ukladach — asymetria WARSTWY WIDOKU), 34 (samotny rajder nie skruszy bronionej
kolonii → regula W3-5 ma preferowac eskadry).

⚠ **Wznów od §1 L3** (nowa dźwignia stawia scenę), dalej §2. Sekcje 4-7 są niezmienione
względem wydania 1; jeśli przeszły Ci wtedy, odhacz je bez powtarzania — poza §4, która
**musi** zostać powtórzona, bo teraz sprawdza także, że dominacja siedzi we WŁAŚCIWYM układzie.

---

---

## 8. AUTONOMIA — AI wybiera cel SAMO (W3-5, `07c1087`)

> **CO TU SPRAWDZAMY, w jednym zdaniu:** czy obce imperium potrafi **SAMO** wskazać Twoją
> kolonię, zebrać eskadrę i posłać ją przez pół galaktyki — bez jednej dźwigni z Twojej strony.
>
> §§2-7 dowiodły, że silnik UMIE wykonać uderzenie, gdy cel wskażesz Ty. To jest ta sama scena
> bez Ciebie: reguła `strike_player_target` w katalogu Directora, z własnym rzutem, cooldownem
> i trzema powodami odmowy, które widać w audycie.

⚠ **To jest sekcja NAJDŁUŻSZA W CZASIE.** Reguła próbuje **raz na rok wyświetlany** (20 % + 15 pkt),
ma **5 lat cooldownu** i wymaga jednocześnie: wojny, celu w zasięgu i okrętu zdolnego do skoku.
Puść grę na szybkim tempie i wracaj do L15/L16 — albo użyj dźwigni z L18, jeśli chcesz zobaczyć
sam skutek bez czekania.

**L15 — czy reguła ma dziś z czego wybierać (zanim zaczniesz czekać):**

`KOSMOS.directorOffensive.countReachableTargets('emp_sandbox_enemy')`

- [ ] Liczba **≥ 1**. Zero **NIE jest usterką** — znaczy, że Twoja kolonia leży poza przestrzenią
      roszczoną i poza powłoką graniczną tego imperium, więc reguła słusznie milczy (zasięg
      stawia REGUŁA, nie bak — §Findings 27). Zmierzone w sondzie: przy 4 ziarnach gracz wpadał
      w zasięg w **2 z 8** par (ziarno × imperium).

**L16 — co reguła by wybrała i czy uzna cel za broniony:**

`(t => t && ({ ciało: t.body.id, układ: t.systemId, wartość: t.value, bronione: t.defended }))(KOSMOS.directorOffensive.pickTarget('emp_sandbox_enemy'))`

- [ ] Wskazuje **Bastion**. `bronione: true` gdy masz wieżę/siatkę obronną **albo** uzbrojony
      okręt w układzie — wtedy AI **musi** zebrać 2+ okręty (§Findings 34: samotny rajder
      przegrał u Ciebie dwa razy i oddał 7,2 własnego wyczerpania).

**L17 — czym imperium dysponuje (dobór po WŁASNOŚCI, nie po nazwie szablonu):**

`KOSMOS.directorOffensive.strikeReadyVessels('emp_sandbox_enemy').map(v => [v.name, v.warpFuel?.max])`

- [ ] Lista **pusta na starcie Sandboxu** — i to jest poprawne: trzy Łowcy to FRG-3 bez baku warp.
      Reguła nie ma czym uderzyć, dopóki imperium nie zbuduje eskorty (L2 nacisku) albo dopóki
      nie dołożysz jej dźwignią.

**L18 — DŹWIGNIA (opcjonalna): daj imperium eskadrę i zobacz decyzję bez czekania**

`KOSMOS.debug.spawnEnemyRaider({ autoOrder: false }); KOSMOS.debug.spawnEnemyRaider({ autoOrder: false })`

⚠ Dwa wywołania, bo cel broniony wymaga eskadry. Rajder ląduje w INNYM układzie — a reguła i tak
sama sprawdzi, czy Twoja kolonia jest w jej zasięgu.

**L19 — czy reguła odpaliła (ślad audytu, filtr po RODZAJU):**

`[KOSMOS.debugLog.query({ kind: 'director:strikeLaunched' }).length, KOSMOS.debugLog.query({ kind: 'director:strikeRefused' }).map(e => e.data.reason)]`

- [ ] Pierwsza liczba **≥ 1** = uderzenie ruszyło z decyzji AI.
- [ ] Druga lista pokazuje, **dlaczego reguła milczała** wcześniej. Trzy powody, wszystkie
      normalne: `no_target_in_reach` (gracz poza strefą) · `no_warp_capable_hull` (imperium ma
      tylko FRG-3) · `insufficient_squadron` (cel broniony, a okręt jeden).
      ⚠ **Pusta lista + zero uderzeń = reguła w ogóle nie doszła do akcji** — wtedy sprawdź L15
      (zasięg) i to, czy trwa wojna: `KOSMOS.warSystem.listActive().length`.

**L20 — rzut jest zasolony ziarnem galaktyki (pin, którego zabrakło przy pierwszym kontakcie):**

`(s => [s, KOSMOS.gameState.get('director.rules')])(KOSMOS.galaxyData.seed)`

- [ ] Widać ziarno i stan reguł (`attempts`, `lastAttemptYear`, `lastFiredYear` per imperium).
- [ ] ⚠ **Dowód rozjazdu między partiami** wymaga DRUGIEJ gry: zacznij nową (inne ziarno) i
      porównaj rok pierwszego `director:strikeLaunched`. Zmierzone offline na 4 ziarnach:
      **4 różne układy** pierwszej odpalającej próby (`emp_001`/`emp_002`), przy regułach BEZ
      soli — **1 układ na 4 ziarna**. To jest różnica, której pierwszy kontakt nie miał.

**L21 — uderzenie AI leci PRAWDZIWĄ ścieżką (a nie fabrykowaną misją):**

`Array.from(KOSMOS.vesselManager._vessels.values()).filter(v => v.ownerEmpireId === 'emp_sandbox_enemy').map(v => [v.name, v.systemId, v.mission?.type, v.pendingOrder?.kind])`

- [ ] Okręty w drodze mają `interstellar_jump` + `pendingOrder.kind: 'attack'`, a po skoku
      `attack`. To ta sama ścieżka, którą sprawdziłeś ręcznie w §2/§3.

**L22 — i kończy się bitwą zaksięgowaną tam, gdzie trzeba:**

- [ ] Powtórz **L10** (układ bitwy = układ CELU) i **L13** (dominacja dla `sys_home`).
- [ ] W Dzienniku **NIE MA** modala „dotarłeś do nowego układu" przy przylocie wroga
      (to była §Findings 32 — naprawione w `61bdffe`; obcy przylot ma być kontaktem sensorowym,
      nie Twoim popupem, a widoczność dowozi W3-7).

---

## Wynik §8

| pozycja | wynik |
|---|---|
| 8a. Reguła ma cel w zasięgu (albo milczy z podanego powodu) | |
| 8b. **Uderzenie ruszyło Z DECYZJI AI** (`director:strikeLaunched` ≥ 1) | |
| 8c. Odmowy są czytelne w audycie (`director:strikeRefused` z powodem) | |
| 8d. Eskadra przeciw celowi bronionemu (2+), nie samotny rajder | |
| 8e. Lot prawdziwą ścieżką (skok → uderzenie → bitwa w układzie celu) | |
| 8f. Brak fałszywego modala „twojego" przylotu przy przylocie wroga | |

**GATE 2 §8 (autonomia):** ☐ ZDANY ☐ ZDANY WARUNKOWO ☐ NIEZDANY

---

## Gdyby coś poszło nie tak

- **`issueOrder` zwraca `invalid_type`** → gra wczytała starą wersję plików. Twardy reload
  (Ctrl+Shift+R) — Live Server bywa uparty przy cache'u modułów ES.
- **`issueAttack` zwraca `target_other_system`** → to znaczy, że wołasz `movementOrderSystem`,
  nie `orderService`. Skok składa WYŁĄCZNIE fasada.
- **Po skoku `mission.type` dalej `interstellar_jump`** → statek nie doleciał (sprawdź
  `arrivalYear`) albo jest w trasie wielo-skokowej. Okręt AI dostaje skok POJEDYNCZY —
  jeśli cel wymaga przesiadki, wybierz bliższy układ startowy.
- **Bitwa w złym układzie** → to jest dokładnie defekt naprawiony w `369adfc`/`cb815cd`;
  jeśli wróci, zacznij od `EnemyAttackHandler._resolveBatchedBattle` (skąd bierze `systemId`).
- **`vessel_in_reserve` przy okręcie, który miał lecieć** → to nie usterka, tylko D6. Sprawdź
  `serviceState`; kadłub w magazynie ma najpierw dostać załogę (`deployVessel`).
- **`ok: true`, ale okręt stoi** → sprawdź `mission.arrivalYear` względem
  `KOSMOS.timeSystem.gameTime`; przy dużym dystansie ETA potrafi być liczone w latach.
- **Przylot bez bitwy** → sprawdź `mission.type` (musi być `attack`) i czy okręt ma stempel
  właściciela (`ownerEmpireId`) — **statek bez stempla czyta się jako statek GRACZA**, a gracz
  sam siebie nie atakuje (lekcja Director Slice 1, V3c).
- **`orbitalDominance` puste po reloadzie** → to jest dokładnie defekt, który naprawia W3-3;
  jeśli wróci, wróć do `createDefaultState` w `GameState.js`.

---

## Czego ten gate świadomie NIE sprawdza

- **Wyboru celu przez AI** — regułę dowozi **W3-5**; dopiero wtedy pytamy, czy AI trafia raz na
  rok wyświetlany, czy druga galaktyka wybiera **inaczej** (pin ziarna), i czy parytet ją ucisza.
- **Desantu AI po wygranej bitwie** — wejście z bitew `vessel_group` to **W3-6**.
- **Tego, że gracz zostanie o wszystkim POWIADOMIONY** — S25 jest mandatem **W3-7**; dziś część
  zdarzeń dalej przechodzi jako tło (a utrata kolonii jako natywny alert systemu Windows).
