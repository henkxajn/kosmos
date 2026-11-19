# COLONY SPHERE — bramka CS-2 (reguły geometrii siatki za TileGraph, Finding 779)

Plan: `COLONY_SPHERE_PLAN.md` §3.12. Okno: **1600×1041 CSS** (UI ≈1,25). Komendy bez cudzysłowów i bez argumentów.
Każdy krok i każda komenda sprawdzone na żywym silniku: `node src/testing/headless/probe-cs2-gate.mjs` → **15/15**
(fixture `GATE-S4-fresh-gy60` w roli zapisu właściciela + nowa gra). Część C (nowa gra) daje ten sam wynik na kodzie sprzed
zmiany (4829bec) — to kontrola „bez zmian”.

**Kontrola kodu sprzed zmiany** (zmierzona sondą `probe-cs2-postload.mjs` na 4829bec, nie do powtarzania): `cs2Latitude is not
defined`; a liczby okna po wczytaniu były inne — kolonia aktywna 16-rzędowa: przedbiegun rzędu 14 produkował 8 zamiast 5.6,
rząd 9 (równik) 4 zamiast 8; kolonie nieaktywne / AI: biegun i przedbiegun bez kary (8 zamiast 4 / 5.6, koszt równikowy) —
u AI przez CAŁĄ sesję po wczytaniu. Kontrola okna 1280×833 nie dotyczy (krok nie zmienia rysowania).

⚠ Przed bramką: żadna sesja nie pisze plików (Live Server przeładowuje kartę).
⚠ **Finding 780 (stare, nie FAIL):** panel budowy pokazuje koszt RÓWNIKOWY także na polach polarnych; pobierany jest koszt
× 1.25 (przedbiegun) / × 1.5 (biegun) — tak samo jak przed CS-2. Liczy się ubytek surowców, nie napis w panelu.

## A. Twój zapis — okno po wczytaniu (Finding 779)

1. F5 → **KONTYNUUJ** (zapis z jednostkami naziemnymi). Spacja = pauza. **NIE otwieraj mapy kolonii** (bez klawisza H,
   bez panelu kolonii) aż do kroku 3.
2. `cs2Latitude()` → linia `[cs2Latitude] {…}` i tabela. Oczekiwane:
   - w linii `mapaNieOtwarta` ≥ 1; wiersze aktywnej kolonii (pierwsze trzy) mają `mapaOtwarta: false`;
   - kolumna `etykieta`: biegun `🧊 ×0.5`, przedbiegun `🧊 ×0.7`, równik `—`;
   - kolumna `produkcja` (Stacja Badawcza Lv1): biegun **4**, przedbiegun **5.6**, równik **8**
     (biegun `(brak wolnego pola)` jest normalny — rzędy biegunowe bywają lodem / zabudowane);
   - kolumna `koszt`: przedbiegun ≈ równik × 1.25, biegun ≈ × 1.5 (fixture: równik `Si 23, Cu 9`, przedbiegun `Si 29, Cu 12`).
   Zanotuj (zrzut) wiersze aktywnej kolonii: `pas`, `pole`, `produkcja`, `koszt`.
3. Otwórz mapę kolonii (klawisz **H**). `cs2Latitude()` → **te same** `pole`, `produkcja`, `koszt`; `mapaOtwarta: true`.
   PASS = liczby bez zmian względem kroku 2.
4. Etykiety pasa (jak przed CS-2): kliknij heks z kolumny `pole` wiersza **przedbiegun** → w panelu pola pod nazwą terenu
   `(q,r)  🧊 ×0.7`; heks z pierwszego albo ostatniego rzędu → `🧊 ×0.5`; heks z wiersza **równik** → `(q,r)` bez 🧊.
5. Budowa na pauzie: zanotuj Si i Cu. Kliknij heks **przedbiegun** z tabeli → w panelu pola **Stacja Badawcza** → buduj.
   Si / Cu spadają dokładnie o `koszt` wiersza przedbiegun (np. Si 29, Cu 12 — NIE o kwotę z panelu, Finding 780).
   To samo na heksie **równik** z tabeli → spadek = `koszt` wiersza równik. Obie stacje mają „w budowie”.
6. Zapis w połowie: ☰ → **Zapisz**. F5 → **KONTYNUUJ**. **NIE otwieraj mapy kolonii.** Czas **1m/s** przez ~3 s (budowa
   trwa 1 rok cywilizacyjny = 1 miesiąc gry), potem pauza. `cs2Latitude()` → druga tabela „zbudowane research_station”:
   dwa nowe wiersze (pola z kroku 5) — przedbiegun `research 5.6` = `oczekiwane 5.6`, równik `research 8` = `oczekiwane 8`.
   (Starsze stacje z twojego zapisu mogą mieć `research ≠ oczekiwane`, jeśli powstały w oknie po wczytaniu przed CS-2 —
   stawka jest zapisana w zapisie; zanotuj, to nie FAIL.) Potem klawisz **H** → `cs2Latitude()` → te same wartości.

## B. Scenariusze debug (stan testowy — na końcu wczytujesz plik)

7. ☰ → **Zapisz do pliku** (punkt powrotu B; plik na dysku — autozapis nie nadpisze go w trakcie testów).
8. `cs2EquatorEvent()` → linia `[cs2EquatorEvent] TEST {…}`: `pasPolaZastępczego: "równik"`, `poziom: "2 → 1"`,
   `researchPo: 8` = `oczekiwane: 8`, `gdybyBiegun: 4`, `koloniaNietknięta: true`. W grze nic się nie zmienia.
9. `cs2Seam()` → otwiera się mapa kolonii, czas 3d/s, linia `[cs2Seam] TEST {…}` (pola `start`, `przySzwie`, `zaSzwem`,
   `cel`) i po kolei 3 linie `[cs2Seam] krok N` — krok 2 ma dopisek **PRZEZ SZEW**. Patrz na mapę (jednostka gracza na
   jednej z bocznych krawędzi mapy, w środkowych rzędach): idzie jedno pole do krawędzi, **znika i od razu pojawia się na
   przeciwnej krawędzi** (bez przelotu przez całą mapę), robi jeszcze jeden krok; sprite patrzy w stronę marszu (jak
   `sprite patrzy …` w logu). Po dojściu stoi ~5 s i znika. Linia `[cs2Seam] KONIEC {…}`: `koniec: "dotarła"`, `kroków: 3`,
   `przezSzew: 1`, `jednostkaUsunięta: true`; prędkość czasu i pauza wracają do stanu sprzed komendy.
10. `cs2Invasion()` → ⚠ wypowiada wojnę imperium AI (jeśli jej nie ma) i ląduje 3 jednostki na aktywnej kolonii.
    Linia `[cs2Invasion] TEST {…}`: `desant: true`, `wylądowało: 3`, `naPolachStrefy: 3`; tabela: każda jednostka
    `strefaLądowania: true`, `sąsiadów` < 6. Na mapie kolonii wrogie jednostki stoją na **brzegu** (pierwszy / ostatni rząd
    albo krótkie rzędy przy biegunach), nie w środku mapy.
11. `cs2Strike()` → tabela kotwic stolic AI: kolumna `anyTile` = `0,0` w każdym wierszu, `źródło` = `pole stolicy` (albo
    `pole budynku`). Linia `[cs2Strike] TEST {…}`: `eskadra: true`, `fala` > 0, `falaNaKotwicy` = `fala`,
    `anyTileWszystkichStolic: "0,0"`. Jeśli `eskadra: false` z `powód` (np. `no_escorts` — AI nie ma 2 wolnych okrętów
    z bakiem warp przy stolicy): zanotuj powód, to nie FAIL tego kroku.
12. F5 → **WCZYTAJ Z PLIKU** → plik z kroku 7. (Wojna, desant i eskadra z kroków 10–11 znikają.)

## C. Nowa gra płaska — bez zmian

13. F5 → **NOWA GRA** → lider → **ROZPOCZNIJ GRĘ** → Enter / Escape przez intro. Mapa kolonii otwiera się sama.
14. `cs2Latitude()` → wiersze nowej kolonii: `mapaOtwarta: true`; `produkcja` przedbiegun **5.6**, równik **8** (biegun **4**,
    jeśli ma wolne pole); `koszt` przedbiegun ≈ równik × 1.25. Kliknij heksy jak w kroku 4 — etykiety jak w kroku 4.
15. Czas 1m/s przez ~10 s: budynki startowe działają, konsola bez czerwonych błędów, budowa kolejnej Stacji Badawczej na
    heksie przedbiegunowym pobiera `koszt` z tabeli.

Wynik: PASS / FAIL per krok + zrzuty tabel z kroków 2, 3, 6 i 14.
