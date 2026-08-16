# W2 — GATE 1: migracja zapisu v100 → v101 (checklista live)

**Slice:** W2 (model rozmieszczenia) · **Commit:** `c9f728e` (`feat(save): migracja v100 → v101`)
**Plan:** `docs/design/W2_PLAN.md` · **Poprzednie commity slice'u:** `7f606b7` (W2-0) · `7db3043` (W2-1) · `3f35c36` (W2-1b) · `c4526b6` (W2-2)
**Stan przed gate'em:** sweep **132/132 OK, 0 FAIL** · `check-i18n` **PASS** · keeper migracji **21/21**

> **TO JEST PIERWSZY GATE W2 I IDZIE SAM.** Nie łączyć z żadnym innym sprawdzeniem —
> ani z rezerwą, ani z rozmieszczaniem, ani z UI. Tu weryfikujemy WYŁĄCZNIE to, że
> **zapis gracza przeżywa bump**.
>
> ⚠ **Dlaczego akurat ten gate jest osobno i dlaczego idzie pierwszy.**
> `TitleScene._prepareContinue` (`:413-420`) przy `saveData.error` woła
> `SaveSystem.clearSave()`. Migracja, która rzuci wyjątek albo popsuje dane przy drugim
> przebiegu, **KASUJE ZAPIS GRACZA** — bezpowrotnie, bo `kosmos_save_backup_v{N}` zostało
> wycofane w D2/E9 i jedyną gwarantowaną ścieżką ratunku jest plik `.json` na dysku.
> To jedyne nieodwracalne zdarzenie w tej grze.

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia. Wszystkie one-linery poniżej **WYKONANE** na żywym silniku przed wpisaniem tutaj.

---

## 0. Przygotowanie (2 minuty, ale bez tego kroku gate jest bez sensu)

- [ ] **CC nie pracuje.** Żadnego równoległego zapisu do repo.
- [ ] **Miej zapis v100 sprzed bumpu.** Jeśli grasz dalej na starym stanie — zanim otworzysz grę,
      zrób ręczną kopię pliku: menu ☰ → „Zapisz do pliku". To jest Twoja siatka bezpieczeństwa,
      niezależna od wszystkiego, co robi gra.
- [ ] Odśwież grę (Live Server), otwórz konsolę (F12).

**L4 — jaka wersja siedzi w slocie PRZED czymkolwiek:**

`JSON.parse(localStorage.getItem('kosmos_save_v1') ?? '{}').version`

Oczekiwane: **100** (albo `undefined`, jeśli slot pusty — wtedy krok 1 pomijasz i lecisz od 3).

---

## 1. Kopia przedmigracyjna — pojawia się, pobiera, jest jedna

Ścieżka z commita `0b9328d`, uzbrojona ponownie przez ten bump.

- [ ] Na ekranie tytułowym kliknij **„Kontynuuj"**.
- [ ] **Pojawia się okno `confirm`** z informacją, że zapis jest w wersji **100**, a gra używa
      **101**, i że nie da się tego cofnąć.
- [ ] Potwierdź → **pobiera się plik `.json`** z sufiksem **`przed-migracja`** w nazwie
      (np. `kosmos_..._r39_v100_przed-migracja.json`).
- [ ] Gra wczytuje się normalnie.
- [ ] **Wróć na ekran tytułowy i kliknij „Kontynuuj" ponownie → okna JUŻ NIE MA.**
      (Predykat `needsPreMigrationBackup(saveVersion, currentVersion)` — zweryfikowany:
      `(100, 101) = true`, `(101, 101) = false`.)

⚠ **Drugi, bardziej prawdopodobny wyzwalacz tego samego okna:** import pliku v100 z dysku
(menu ☰ → „Wczytaj z pliku"). Jeśli masz pod ręką stary plik — zaimportuj go i sprawdź, że
okno pojawia się także tam.

- [ ] Import pliku v100 → okno się pojawia → plik kopii się pobiera → gra wstaje.

---

## 2. Podwójne wczytanie — idempotencja na żywym zapisie

To jest sprawdzenie, przez które ten gate w ogóle istnieje (patrz ostrzeżenie u góry).

- [ ] Po migracji **zapisz** (menu ☰ → „Zapisz", albo poczekaj na autozapis) i **odśwież stronę**.
- [ ] Kliknij „Kontynuuj" **drugi raz**.
- [ ] Gra wstaje **bez żadnego błędu w konsoli** i **bez okna kopii** (jest już v101).
- [ ] **Zapis nadal istnieje** — nie zniknął, nie wyzerował się.

`JSON.parse(localStorage.getItem('kosmos_save_v1') ?? '{}').version`

Oczekiwane: **101**.

- [ ] W konsoli **NIE MA** ani `[SaveMigration] Save zbyt stary`, ani `missing_migration`,
      ani żadnego czerwonego wyjątku z `SaveMigration`.

---

## 3. Flota po migracji — wszystko jest W SŁUŻBIE

Sedno zasiewu: każdy statek ze starego zapisu **był** w służbie, więc po migracji musi taki zostać.
Gdyby cokolwiek wyszło jako `stored`, gracz obudziłby się z flotą, która nie broni, nie lata i nie wozi.

**L2 — rozkład stanów w całej flocie:**

`KOSMOS.vesselManager.getAllVessels().reduce((a,v)=>{const k=v.serviceState??'active';a[k]=(a[k]||0)+1;return a;},{})`

- [ ] Wynik to **wyłącznie** `{active: N}`, gdzie N = liczba Twoich statków. **Zero** `stored`,
      **zero** `mobilizing`.

**L1 — kontrolnie, licznik rezerwy:**

`KOSMOS.vesselManager.getAllVessels().filter(v => v.serviceState !== 'active').length`

- [ ] Wynik: **0**.

**L5 — księga załóg po grandfatheringu:**

`KOSMOS.vesselManager.getAllVessels().reduce((a,v)=>a+(v.crewLocked??0),0)`

- [ ] Wynik: **0** (decyzja 8 — stare kadłuby nie niosą księgi załogi; nowe, budowane po
      bumpie, będą ją miały).

- [ ] **Wizualnie:** flota na mapie 3D i w rejestrze (klawisz `K`) wygląda i zachowuje się
      dokładnie jak przed bumpem — te same statki, te same misje, te same trasy.

---

## 4. Nic się nie zmieniło poza tym, co miało

Bump ma być **niewidoczny** w rozgrywce. Cokolwiek innego drgnęło — to regresja, nie feature.

- [ ] Kolonie, populacja, kredyty, surowce — bez skoków.
- [ ] Statki w locie **kontynuują** swoje misje (nie zresetowały się, nie utknęły).
- [ ] Zlecenia transportowe (zakładka LOGISTYKA) działają dalej.
- [ ] Stacje orbitalne i ich magazyny bez zmian.
- [ ] Panel dyplomacji otwiera się i pokazuje te same relacje.
- [ ] **Konsola bez czerwonych błędów** przez cały przebieg.

**L3 — siła vs potencjał (nowy rozdział z W2-2; na starym zapisie MUSZĄ być równe):**

`(()=>{const t=KOSMOS.threatAssessment;return{sila:t.getStrength('player'),potencjal:t.getPotentialStrength('player'),rezerwa:t.getReserveStrength('player')}})()`

- [ ] `sila === potencjał`, `rezerwa === 0`. Tak wygląda flota bez magazynu — i tak ma
      wyglądać każdy zapis sprzed v101.

---

## 5. Rzecz, której NIE DA SIĘ sprawdzić headless (wpis wiążący z rejestru)

> **REJESTR, ORZECZENIE 2026-08-15:** `GameCore` nie montuje Directora, więc „okręt wojenny AI
> powstaje end-to-end" jest **niemierzalne w harnessie**. Pierwszy ŻYWY gate W2 musi to pokryć
> jawnie — ta linia jest tu po to, żeby nie wypadła z procesu.

Na TYM gate'cie tego **nie sprawdzamy** (to nie jest gate o AI), ale wpis zostaje przeniesiony
do **GATE 3** i jest tam warunkiem zaliczenia. Do odhaczenia tutaj tylko jedno:

- [ ] Przyjąłem do wiadomości, że produkcja okrętów AI wchodzi do weryfikacji dopiero na
      GATE 3 i **wyłącznie na żywej grze**.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Kopia przedmigracyjna (Kontynuuj + import) | ✅ |
| 2. Podwójne wczytanie, zapis żyje, v101 | ✅ |
| 3. Cała flota `active`, `crewLocked` 0 | ✅ |
| 4. Brak zmian w rozgrywce, konsola czysta | ✅ |
| 5. Wpis rejestru przyjęty | ✅ |

**GATE 1:** ✅ **ZDANY** (2026-08-16, Filip) — uwagi:

Okno przedmigracyjne uzbrojone na **OBU** ścieżkach (żywy zapis v100 przez „Kontynuuj" **oraz**
import ręcznej kopii `.json`); pobrany plik kopii ma w środku `"version": 100`. **Idempotencja
udowodniona na żywym zapisie:** ta sama kopia v100 zaimportowana DWA razy → identyczny przebieg,
zero błędów. To zdejmuje minę `clearSave()` z §nagłówka — dowodem, nie założeniem. Round-trip v101
bez ponownej migracji, konsola czysta, `localStorage` version = **101**.

**Ustalenie poboczne z gate'u — klucz `kosmos_save_backup_preimport`.** Po imporcie w
`localStorage` zostaje ten klucz. **To NIE jest wycofana rodzina `kosmos_save_backup_v{N}` z D2/E9** —
to osobna, żywa siatka bezpieczeństwa ścieżki importu. Zamierzona, opisana w `CLAUDE.md`
(sekcja o zapisie do pliku), cykl życia w §Cykl życia niżej. **Nie kasować przy następnym
sprzątaniu w stylu E9.**

---

## Cykl życia `kosmos_save_backup_preimport` (ustalone przy GATE 1)

| pytanie | odpowiedź (zweryfikowana w kodzie) |
|---|---|
| Kto zapisuje | **wyłącznie** `SaveSystem.importSave` (`:462`) — kopia stanu SPRZED importu |
| Kiedy | **PO** udanym `setItem` slotu, best-effort. Nigdy przed — kopia przed importem kradła headroom i wywalała import na quocie (regresja z live-gate'u) |
| Nadpisywanie | tak, każdy import nadpisuje ten sam klucz (jedna kopia, zawsze ostatniego importu) |
| Kiedy ginie | (a) `save()` stopień 2 self-healingu przy quocie (`:113-118`) — żywy zapis ma pierwszeństwo · (b) `importSave` przy quocie zwalnia go, by import przeszedł (`:451`) · (c) gdy własny zapis się nie zmieści — klucz jest czyszczony, żeby stara kopia nie udawała kopii TEGO importu (`:463`) |
| Czy `pruneMigrationBackups()` go rusza | **NIE.** Prune chodzi po prefiksie `kosmos_save_backup_v` (`SaveMigration.js:26`) — `preimport` nie pasuje |
| Ścieżka odczytu w grze | brak automatycznej; **jedyne** wyjście to `KOSMOS.debug.exportBackup()` (`GameScene.js:828`) → plik `_przed-importem.json` → menu ☰ „Wczytaj z pliku" |
| Pokrycie testowe | `save_file_smoke.mjs` T5/T7/T10 (jest po imporcie · pomijany gdy się nie mieści · poświęcany w stopniu 2) |

---

## Gdyby coś poszło nie tak

- **Zapis zniknął po „Kontynuuj"** → to jest dokładnie ten scenariusz, przed którym ostrzega
  nagłówek. Wczytaj plik `.json` z kroku 0 lub 1 (menu ☰ → „Wczytaj z pliku"). Zgłoś —
  migracja rzuciła i `clearSave()` zadziałał.
- **Okno kopii się nie pojawiło** → sprawdź L4: jeśli slot pokazuje już 101, migracja poszła
  wcześniej (np. przy autozapisie po innym uruchomieniu). Nie jest to błąd, ale zanotuj.
- **Jakiś statek wyszedł jako `stored`** → zatrzymaj się i zgłoś. Nic w migracji nie ustawia
  tego stanu; oznaczałoby to, że zapis powstał już po W2-2 (czyli był robiony na kodzie
  z rezerwą) — wtedy stan jest poprawny, ale gate trzeba powtórzyć na zapisie sprzed slice'u.
