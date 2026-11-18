# COLONY SPHERE — bramka 1 (CS-3a + CS-3a-fix): ziarna powierzchni + układy z galaxySeed (D-CS-17, D-CS-18)

Plan: `docs/design/COLONY_SPHERE_PLAN.md` §0b, §3.1, §3.2. Zmiana bez warstwy wizualnej — bramka to konsola.
Okno dowolne (krok nie rysuje nic nowego). Jednolinijkowce sprawdzone 2026-11-18 na żywym silniku (headless Chrome + CDP,
te same teksty). Wartości `galaxySeed` / liczby ciał są losowe na grę — porównujemy **kształt** wyniku, nie liczby.

⚠ Wszystkie komendy wpisujesz w konsoli przeglądarki (F12) **bez cudzysłowów**, dokładnie jak niżej.

CS-3a-fix (po FAIL kroku B w pierwszej bramce): tryb układów jest teraz cechą **świata** — zapada raz, przy «Nowa gra»,
i jedzie w zapisie (`worldSeeded`). Flaga przestawiona PO starcie gry niczego już nie zmienia (sekcja E).

## A. Flaga OFF (domyślnie) — nowa gra

1. Ekran tytułowy (świeżo po F5): `KOSMOS.gameConfig.FEATURES.seededSystems`
   - [ ] wynik `false`
2. «Nowa gra» → lider → «ROZPOCZNIJ GRĘ». W konsoli ma się pojawić linia:
   - [ ] `[CS-3a] surfaceSeed nadane: N · seededSystems=false · świat=dotychczasowy` (N = liczba ciał układu domowego)
3. `csWorlds()`
   - [ ] podsumowanie: `seededSystems: false`, `worldSeeded: false`, `missingSeeds: 0`, `uniqueSeeds` = `bodies`
   - [ ] tabela: wiersz na ciało — `kind` (planet / moon / planetoid), `type`, `ordinal` od 0 w każdym rodzaju,
     `name`, `surfaceSeed` (liczba, żadnej pustej)
4. `csPeek()`
   - [ ] `mismatches: 0`, `generatedForeign` ≥ 1 (układy domowe AI), `emergencySeedUses: 0`
   - [ ] `worldSeeded: false`, `starsDifferFromLegacySeed: "0/71"` ← świat jak przed krokiem

## B. Flaga ON — nowe gry (powtórz 2×)

5. F5 (wraca ekran tytułowy, flagi z pliku). Na ekranie tytułowym: `KOSMOS.gameConfig.FEATURES.seededSystems=true`
   - [ ] wynik `true`
6. «Nowa gra» → lider → «ROZPOCZNIJ GRĘ».
   - [ ] linia `[CS-3a] surfaceSeed nadane: N · seededSystems=true · świat=seedowany`
   - ⚠ jeśli linia mówi `seededSystems=false · świat=dotychczasowy`, flaga nie dotrwała do startu (np. przeładowanie
     karty przez Live Server na ekranie tytułowym) — ta gra jest grą OFF; wróć do kroku 5.
7. `csWorlds()` — zanotuj `galaxySeed` (G1) i 3 pierwsze wiersze tabeli
   - [ ] `worldSeeded: true`, `missingSeeds: 0`, `uniqueSeeds` = `bodies`
8. `csPeek()`
   - [ ] `mismatches: 0`, `emergencySeedUses: 0`, `worldSeeded: true`
   - [ ] `starsDifferFromLegacySeed` ≈ `"71/71"` ← fizyczne ciała obcych układów pochodzą z galaxySeed
9. Powtórz 5–8 (F5 → flaga `=true` → nowa gra).
   - [ ] `galaxySeed` G2 ≠ G1, inne ciała układu domowego, dalej `missingSeeds: 0`, `mismatches: 0`,
     `emergencySeedUses: 0`
   - [ ] w żadnej grze B w konsoli nie ma czerwonej linii `[CS-3a] świat seedowany bez galaxySeed`

> Dom przy ON jest losowany z galaxySeed razem z mutacją planety macierzystej (temperatura, złoża Ti): ten sam
> galaxySeed daje identyczny świat startowy — sprawdzone w keeperze i w CDP (dwie gry z tym samym seedem).

## C. Stary zapis (flaga OFF)

10. F5 (flaga wraca z pliku = OFF). Wczytaj stary zapis: «Wczytaj z pliku» → własny `.json` sprzed kroku albo rozpakowany (gunzip) `src/testing/fixtures/GATE-S4-fresh-gy60.save.json.gz` — wczytywanie z pliku nie przyjmuje `.gz`.
    - [ ] linia `[CS-3a] surfaceSeed nadane: N · seededSystems=false · świat=dotychczasowy` z N = liczba WSZYSTKICH
      zapisanych ciał (fixture: 364)
11. `csWorlds()`
    - [ ] `missingSeeds: 0`, `uniqueSeeds` = `bodies` (fixture: 63 ciała w układzie domowym, `galaxySeed: 814025785`;
      pierwszy wiersz `planet rocky 0 Pik1 3529038768`)
12. `csPeek()`
    - [ ] `mismatches: 0` (fixture: 6 układów obcych), `starsDifferFromLegacySeed: "0/71"`
13. ☰ → «Zapisz». F5 → «Kontynuuj».
    - [ ] linia `[CS-3a] surfaceSeed nadane: 0 · …` (ziarna przyszły z zapisu)
    - [ ] `csWorlds()` — te same `surfaceSeed` co w kroku 11 (fixture: `Pik1 3529038768`)

## D. Stary zapis przy fladze ON — świat zostaje dotychczasowy

14. Na tej samej grze: `KOSMOS.gameConfig.FEATURES.seededSystems=true`, potem `csPeek()`
    - [ ] `mismatches: 0`, `worldSeeded: false`, `starsDifferFromLegacySeed: "0/71"` (przed CS-3a-fix było 6/6
      rozjazdów — flaga czytana na żywo)
15. F5 (flaga z powrotem OFF).

## E. Regresja FAIL-a kroku B: flaga przestawiona PO starcie (wynik ma być jak w A, bez rozjazdów)

16. F5 (flaga OFF). «Nowa gra» → lider → «ROZPOCZNIJ GRĘ» (linia `… seededSystems=false · świat=dotychczasowy`).
17. Dopiero teraz: `KOSMOS.gameConfig.FEATURES.seededSystems=true`, potem `csPeek()`
    - [ ] `mismatches: 0`, `worldSeeded: false`, `emergencySeedUses: 0`, `starsDifferFromLegacySeed: "0/71"`
      (przed CS-3a-fix ten sam przepływ dawał 2/2 rozjazdów — to był FAIL; odtworzony w CDP co do liczby)
18. F5.

## Wynik

- [x] PASS (powtórna bramka 2026-11-18) — B ×2 i E ×2 zielone; D-CS-18 podpisana.
- Dziennik bramek właściciela:
  - **Bramka 1 (CS-3a):** kroki 1, 2, 3, 4, 6 PASS; krok 5 FAIL (galaxySeed 813683454, `csPeek()` 2/2 rozjazdów) —
    wyjaśnione Findingiem 769: świat powstał przy fladze OFF, a `csPeek()` liczył przy ON (flaga czytana na żywo).
  - **Powtórna bramka (CS-3a-fix): PASS.**
    1. Gra seedowana #1: `seededSystems=true · świat=seedowany`, galaxySeed 612055237, 57 ciał, `worldSeeded: true`,
       `missingSeeds: 0`; `csPeek()` `mismatches: 0`, `emergencySeedUses: 0`, 71/71 (sys_047, sys_006 zgodne).
    2. Gra seedowana #2: galaxySeed 572914822, 61 ciał (inny układ domowy); `mismatches: 0`, emergency 0, 71/71
       (sys_068, sys_036 zgodne).
    3. Gra OFF, flaga przestawiona po starcie: `świat=dotychczasowy`, `mismatches: 0`, `worldSeeded: false`, 0/71.
    4. Jak 3, galaxySeed 368141017: `mismatches: 0`, `worldSeeded: false`, 0/71.
