# W3 — GATE 2: OKRĘTY AI WYCHODZĄ Z DOMU (checklista live) — **WYDANIE 2**

**Slice:** W3 (ofensywne AI) · **Commity:** `1e57d1b` (W3-3, dominacja przeżywa wczytanie) ·
`4724e46` (W3-4, rozkaz uderzenia + D6 + naprawa `_holdAtHome`) ·
`369adfc` (**W3-4b-1**, uderzenie międzygwiezdne leci przez SKOK) ·
`cb815cd` (**W3-4b-2**, księga bierze układ CELU + koniec obrońcy-widmo)
**Plan:** `docs/design/W3_PLAN.md` · **Poprzedni gate:** `W3_GATE1_CHECKLIST.md` (ZDANY 2026-08-17)
**Stan przed gate'em:** sweep **142/142 OK, 0 FAIL** · `check-i18n` **PASS** (pl = en = 3242) ·
`w3_cross_system_attack` **42/42** · `w3_attack_dispatch` **35/35** ·
`w3_dominance_persist` **16/16** · zapis **v101, bez migracji**

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

Zapisz `id` jednego z nich — to Twój napastnik. Potrzebujesz `serviceState: 'active'`,
a do uderzenia **międzygwiezdnego** także `warpFuel.max > 0` (to jest filtr z D4 — nigdy po
nazwie szablonu).

⚠ **Jeśli napastnik jest w TYM SAMYM układzie co Bastion**, ten boot nie testuje tego, co trzeba.
Wymuś scenę międzygwiezdną: `KOSMOS.orderService.issueWarp('<vesselId>', '<innySystemId>')`,
poczekaj na przylot, dopiero potem §2. Układy do wyboru:
`KOSMOS.galaxyData.systems.map(s => s.id).slice(0, 12)`

---

## 2. SEDNO — uderzenie MIĘDZYGWIEZDNE zaczyna się od SKOKU

**L3 — najpierw dowód, że goły rozkaz NIE UDAJE, że umie to zrobić:**

`KOSMOS.movementOrderSystem.issueOrder('<vesselId>', { type: 'attack', targetBodyId: '<planetId Bastionu>', bypassFuelCheck: true })`

- [ ] Zwrotka **`{ ok: false, reason: 'target_other_system' }`**.
      To jest naprawa z wydania 1: rozkazy ruchu są wewnątrzukładowe i teraz mówią to wprost,
      zamiast lecieć w losowe miejsce własnego układu.

**L4 — właściwa dźwignia (fasada, która umie złożyć skok z podejściem):**

`KOSMOS.orderService.issueAttack('<vesselId>', { targetBodyId: '<planetId Bastionu>' })`

- [ ] Zwrotka **`{ ok: true, composite: true }`** — „composite" znaczy: NAJPIERW skok.

**L5 — co robi statek TERAZ:**

`KOSMOS.vesselManager.getVessel('<vesselId>').mission.type`

- [ ] Wynik **`'interstellar_jump'`**. Okręt naprawdę leci między gwiazdami — D4: gracz ma to
      **zobaczyć sensorami**, a nie zastać pod planetą.

**L6 — a zamiar czeka zapisany:**

`KOSMOS.vesselManager.getVessel('<vesselId>').pendingOrder`

- [ ] `{ kind: 'attack', targetId: '<Bastion>', targetSystemId: 'sys_home', … }`.
      Pole jest serializowane, więc uderzenie **przeżyje zapis w locie**.
- [ ] Na mapie galaktyki (STRATCOM) widać okręt w warpie.

⚠ Jeśli L4 zwróci `{ ok: false, reason: 'not_warp_capable' }` albo `dispatch_failed` — wybrany
kadłub nie ma baku warp. Wróć do L2 i weź taki z `warpFuel.max > 0`.
⚠ Jeśli zwrotka to `{ ok: false, reason: 'vessel_in_reserve' }` — to kadłub w magazynie.
Zachowanie POPRAWNE (§5); weź okręt ze stanem `active`.

---

## 3. Przylot → uderzenie → BITWA (łańcuch domyka się SAM)

- [ ] Przyspiesz czas i poczekaj na koniec skoku (ETA:
      `KOSMOS.vesselManager.getVessel('<vesselId>').mission.arrivalYear`, bieżący rok:
      `KOSMOS.timeSystem.gameTime`).

**L7 — po wyjściu z warpu (JEDNO polecenie, cztery fakty):**

`(v => [v.systemId, v.mission?.type, v.mission?.targetId, v.pendingOrder])(KOSMOS.vesselManager.getVessel('<vesselId>'))`

- [ ] `systemId` = **`sys_home`** (statek JEST w Twoim układzie),
      `mission.type` = **`'attack'`** (fasada sama wydała uderzenie po przylocie),
      `mission.targetId` = **Bastion**, `pendingOrder` = **`null`** (zamiar skonsumowany —
      dostawa jednokrotna, bez ryzyka podwójnego rozkazu).

- [ ] Okręt leci teraz ku Bastionowi **wewnątrz** Twojego układu — widać go na mapie 3D
      i (jeśli jest w zasięgu) w sensorach.

- [ ] Bitwa **wybucha sama** po dotarciu — bez żadnej dalszej akcji z Twojej strony.

**L8 — ślad audytowy, filtrowany po RODZAJU (nigdy po tekście):**

`KOSMOS.debugLog.query({ kind: 'battle:resolved' }).length`

- [ ] Licznik **wzrósł**. (Ścieżka orbitalna, jak w GATE 1, daje **jeden** wpis na bitwę —
      podwójny wpis był właściwością DSCS, nie tej ścieżki.)

**L9 — i że to poszło do KSIĘGI, a nie obok niej:**

`KOSMOS.warSystem.getWarWith('emp_sandbox_enemy')`

- [ ] `battles.length` urosło, `exhaustion` się ruszyło. To jest W1-4 + W3-2 pracujące pod
      spodem — uderzenie AI od pierwszego dnia jest **księgowane**, nie jest osobną, cichą ścieżką.

**L10 — ⚠ NAPRAWA Z WYDANIA 1: w KTÓRYM układzie zapisała się bitwa:**

`(w => KOSMOS.gameState.get('battles.' + w.battles[w.battles.length - 1])?.location)(KOSMOS.warSystem.getWarWith('emp_sandbox_enemy'))`

- [ ] `systemId` to **układ CELU** (`sys_home`), a `planetId` to Bastion — **jeden układ
      odniesienia w całym rekordzie**. W wydaniu 1 było tu `systemId` NAPASTNIKA obok
      `planetId` z Twojego układu: rekord wewnętrznie sprzeczny.

**L11 — i kto naprawdę bronił:**

`KOSMOS.warSystem.hasPlayerPresenceInSystem('sys_home')`

- [ ] **`true`** — bitwa odbyła się tam, gdzie faktycznie coś masz.
- [ ] Kontrola: `KOSMOS.warSystem.hasPlayerPresenceInSystem('<układ napastnika>')` → **`false`**.
      Tam bitwy być NIE MOŻE (przed naprawą właśnie tam się „odbyła", przeciw obrońcy-widmo).

---

## 4. Dominacja orbitalna PRZEŻYWA WCZYTANIE (W3-3)

To jest defekt, który psuł funkcję zbudowaną NA NIM: wróg wygrywał bitwę nad Twoją planetą
i trzymał orbitę — a po zapisie i wczytaniu ta wiedza **znikała**, bo klucz nie był
zadeklarowany w `createDefaultState` i `restore` wyrzucał go bez słowa.

**L12 — kto trzyma orbitę:**

`KOSMOS.gameState.get('orbitalDominance')`

- [ ] Jest wpis dla **`sys_home`** (układ bitwy) z `controllerId` **zwycięzcy** —
      i **NIE MA** wpisu dla układu napastnika. To druga połowa naprawy z wydania 1.

**L13 — co na to bramka desantu:**

`KOSMOS.warSystem.playerHasOrbitalDominance('<planetId Bastionu>')`

- [ ] Gdy orbitę trzyma WRÓG → **`false`** (desantu nie ma).
      Gdy trzymasz Ty → `true`.

- [ ] **Zapisz grę, F5, wczytaj.** Powtórz **L12** i **L13**.
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
| 1. Sandbox: wojna, okręty obu stron, **napastnik w INNYM układzie** niż cel | |
| 2. **Goły rozkaz odmawia (`target_other_system`), fasada robi SKOK** (`composite: true`) | |
| 3. **Po wyjściu z warpu misja sama staje się `attack` → BITWA** i trafia do księgi | |
| 3b. **Bitwa i dominacja zapisane w układzie CELU**, obecność gracza `true` | |
| 4. **Dominacja orbitalna przeżywa zapis → F5 → wczytanie** | |
| 5. Rezerwa nie przyjmuje rozkazów (`vessel_in_reserve`, komunikat po ludzku) | |
| 6. Garnizon AI potrafi wrócić do stolicy | |
| 7. Brak regresji, konsola czysta | |

**GATE 2:** ☐ ZDANY ☐ ZDANY WARUNKOWO ☐ NIEZDANY

⚠ **Wznów od §2.** Sekcje 4-7 są niezmienione względem wydania 1; jeśli przeszły Ci wtedy,
odhacz je bez powtarzania — poza §4, która **musi** zostać powtórzona, bo teraz sprawdza także,
że dominacja siedzi we WŁAŚCIWYM układzie.

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
