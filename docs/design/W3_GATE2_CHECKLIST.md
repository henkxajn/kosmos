# W3 — GATE 2: OKRĘTY AI WYCHODZĄ Z DOMU (checklista live)

**Slice:** W3 (ofensywne AI) · **Commity:** `1e57d1b` (W3-3, dominacja przeżywa wczytanie) ·
`4724e46` (W3-4, rozkaz uderzenia + D6 + naprawa `_holdAtHome`)
**Plan:** `docs/design/W3_PLAN.md` · **Poprzedni gate:** `W3_GATE1_CHECKLIST.md` (ZDANY 2026-08-17)
**Stan przed gate'em:** sweep **141/141 OK, 0 FAIL** · `check-i18n` **PASS** (pl = en = 3241) ·
`w3_attack_dispatch` **35/35** · `w3_dominance_persist` **16/16** · zapis **v101, bez migracji**

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

**L1 — kim jesteś i co masz (po STEMPLU, nie po nazwie):**

`KOSMOS.colonyManager.getPlayerColonies().map(c => [c.planetId, c.name])`

Oczekiwane: **Bastion** i tylko Bastion. To jest jedyny prawidłowy sposób zapytania „co
należy do mnie" — `getAllColonies()` zwraca kolonie WSZYSTKICH właścicieli.

**L2 — wrogie okręty, też po stemplu:**

`Array.from(KOSMOS.vesselManager._vessels.values()).filter(v => v.ownerEmpireId === 'emp_sandbox_enemy').map(v => [v.id, v.name, v.serviceState])`

Zapisz sobie `id` jednego z nich — to Twój napastnik. Trzeci element to stan służby;
do uderzenia potrzebujesz `active`.

---

## 2. SEDNO — rozkaz uderzenia rodzi MISJĘ ATAKU

- [ ] Wydaj wrogiemu okrętowi rozkaz uderzenia na Bastion:

`KOSMOS.debug.issueOrder('<vesselId>', { type: 'attack', targetBodyId: '<planetId Bastionu>', bypassFuelCheck: true })`

- [ ] Zwrotka to **`{ ok: true, orderId: 'mo_N' }`**.

**L3 — czym naprawdę jest ten rozkaz:**

`KOSMOS.movementOrderSystem.listActive().map(o => [o.id, o.type, o.status])`

- [ ] Typ rozkazu to **`attack`**, status `active`. Rejestr mówi prawdę o zamiarze.

**L4 — i czym jest misja pod nim:**

`KOSMOS.vesselManager.getVessel('<vesselId>').mission.type`

- [ ] Wynik **`'attack'`**. To jest **CAŁE** brakujące ogniwo: dokładnie tego typu wymaga
      `EnemyAttackHandler`, i dokładnie tego żaden rozkaz AI nie potrafił dotąd wyprodukować.

- [ ] Na mapie 3D okręt **rusza z miejsca i leci** ku Bastionowi (to nie jest teleport —
      D4 mówi: prawdziwa podróż, bo gracz ma to **zobaczyć nadlatujące**).

⚠ Jeśli zwrotka to `{ ok: false, reason: 'vessel_in_reserve' }` — trafiłeś na kadłub w magazynie.
To POPRAWNE zachowanie (§5); weź okręt ze stanem `active` z L2.

---

## 3. Przylot KOŃCZY SIĘ BITWĄ

- [ ] Przyspiesz czas i poczekaj na przylot (ETA odczytasz z
      `KOSMOS.vesselManager.getVessel('<vesselId>').mission.arrivalYear`, bieżący rok z
      `KOSMOS.timeSystem.gameTime`).

- [ ] Bitwa **wybucha sama** po dotarciu — bez żadnej dalszej akcji z Twojej strony.

**L5 — ślad audytowy, filtrowany po RODZAJU (nigdy po tekście):**

`KOSMOS.debugLog.query({ kind: 'battle:resolved' }).length`

- [ ] Licznik **wzrósł**. (Ścieżka orbitalna, jak w GATE 1, daje **jeden** wpis na bitwę —
      podwójny wpis był właściwością DSCS, nie tej ścieżki.)

**L6 — i że to poszło do KSIĘGI, a nie obok niej:**

`KOSMOS.warSystem.getWarWith('emp_sandbox_enemy')`

- [ ] `battles.length` urosło, `exhaustion` się ruszyło. To jest W1-4 + W3-2 pracujące pod
      spodem — uderzenie AI od pierwszego dnia jest **księgowane**, nie jest osobną, cichą ścieżką.

---

## 4. Dominacja orbitalna PRZEŻYWA WCZYTANIE (W3-3)

To jest defekt, który psuł funkcję zbudowaną NA NIM: wróg wygrywał bitwę nad Twoją planetą
i trzymał orbitę — a po zapisie i wczytaniu ta wiedza **znikała**, bo klucz nie był
zadeklarowany w `createDefaultState` i `restore` wyrzucał go bez słowa.

**L7 — kto trzyma orbitę:**

`KOSMOS.gameState.get('orbitalDominance')`

- [ ] Jest wpis dla układu, w którym stoczyłeś bitwę, z `controllerId` **zwycięzcy**.

**L8 — co na to bramka desantu:**

`KOSMOS.warSystem.playerHasOrbitalDominance('<planetId Bastionu>')`

- [ ] Gdy orbitę trzyma WRÓG → **`false`** (desantu nie ma).
      Gdy trzymasz Ty → `true`.

- [ ] **Zapisz grę, F5, wczytaj.** Powtórz **L7** i **L8**.
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
| 1. Sandbox: wojna, okręty obu stron, własność czytana po stemplu | |
| 2. **Rozkaz `attack` rodzi misję `attack`** i okręt fizycznie leci | |
| 3. **Przylot kończy się BITWĄ** i bitwa trafia do księgi wojny | |
| 4. **Dominacja orbitalna przeżywa zapis → F5 → wczytanie** | |
| 5. Rezerwa nie przyjmuje rozkazów (`vessel_in_reserve`, komunikat po ludzku) | |
| 6. Garnizon AI potrafi wrócić do stolicy | |
| 7. Brak regresji, konsola czysta | |

**GATE 2:** ☐ ZDANY ☐ ZDANY WARUNKOWO ☐ NIEZDANY

---

## Gdyby coś poszło nie tak

- **`issueOrder` zwraca `invalid_type`** → gra wczytała starą wersję plików. Twardy reload
  (Ctrl+Shift+R) — Live Server bywa uparty przy cache'u modułów ES.
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
