# COLONY SPHERE — bramka CS-PHYS-b (orbity skalowane jasnością, dom na +15 °C, skala układu, Finding 774)

Plan: `COLONY_SPHERE_PLAN.md` §3.9 / §3.9.1 / §3.9.2. Okno: **1600×1041 CSS** (UI ≈1,25). Kontrola okna: 1280×833.
Komendy bez cudzysłowów i bez argumentów. Komendy kroków 1–2 sprawdzone na żywym silniku (headless Chrome, prawdziwy
przepływ tytuł → nowa gra, sonda wariant `probe-cs-phys-b2-live.mjs` + `csOrbits()` / `csClimate()` / daleki kadr).
Kontrola kodu sprzed zmiany (b0f3106): `csOrbits is not defined`.

⚠ Przed bramką: żadna sesja nie pisze plików (Live Server przeładowuje kartę).

## 1. Nowy świat — oba przełączniki na ekranie tytułowym
1. F5 na ekranie tytułowym. W konsoli kolejno:
   `KOSMOS.gameConfig.FEATURES.realisticClimate=true` → `true`
   `KOSMOS.gameConfig.FEATURES.scaledOrbits=true` → `true`
2. «Nowa gra» → lider → «ROZPOCZNIJ GRĘ» → Enter przez intro cywilizacji.
3. `csOrbits()` → tabela planet + linia `[csOrbits]`. Oczekiwane:
   `orbitModel: 2`, `worldStamp: 2`, `starStamp: 2`, `scaledOrbitsFlag: true`;
   `systemScale` = `compaction` = min(1, max(0.2, √luminosity)) (np. G ≈ 1, K 0.5–0.75, M 0.2–0.24);
   `starDrawScale` ≤ `systemScale` (≤ 1; w świecie dotychczasowym zawsze 1);
   w tabeli wiersz `home: true` ma `zone: hz`, `finalC` ≈ **+15** (14–16).
4. `csClimate()` → `climateModel: 2`, `worldStamp: 2`, `contradictions: 0` (dopuszczalne 1–2),
   `playerHome.finalC` ≈ +15, `record: v2`.
5. Popatrz na gwiazdę i planety wewnętrzne: żadna planeta nie leży w tarczy gwiazdy ani tuż przy jej krawędzi
   (najbliższe peryhelium ≥ 1,5 promienia tarczy). Oddal kamerę maksymalnie (kółko) — gwiazda nadal widoczna jako
   mała tarcza (min. ~4 px promienia), nie znika.

## 2. Karzeł M — kliki, rozkazy, kolonia
6. `csNextSystem()` powtarzaj, aż `csOrbits()` pokaże `starClass: M` (cyklicznie po wygenerowanych układach; po
   ostatnim wraca do domu). Jeśli żadnego M nie ma: F5 i krok 1 od nowa (nowy świat), albo dom sam jest M.
7. W układzie M: `csOrbits()` → `systemScale` 0.2–0.24, `starDrawScale` ≤ `systemScale` (np. 0.16–0.24), planety od
   ~0.06–0.12 AU. Kliknij po kolei **3 najbliższe gwieździe planety** (najpierw w ramce startowej, potem po
   przybliżeniu na każdą) — za każdym razem zaznacza się ta planeta (nie gwiazda). Kliknij gwiazdę — zaznacza się gwiazda.
8. Wróć do domu (`csNextSystem()` aż `systemId: sys_home`). Wybierz statek gracza → rozkaz lotu do **świata
   macierzystego** i do **najbliższej gwieździe planety** → rozkaz przyjęty, statek leci (brak komunikatu o celu
   nieosiągalnym / strefie słońca). Jeśli dom jest M: cele < 0.3 AU też przyjęte.
9. Otwórz ekran kolonii świata macierzystego i zamknij — bez błędów.
10. Najedź na etykietę własnego statku (HUD): zasięgi `wykr.` / `lock` w układzie M pokazują dwa miejsca po przecinku
    poniżej 0,25 AU (np. `0,06 AU`), w układzie G/F jak dotąd (jedno miejsce).

## 3. Stary zapis (świat dotychczasowy)
11. Wczytaj istniejący zapis sprzed tego kroku (☰ → Wczytaj z pliku albo «Kontynuuj» ze starym zapisem).
12. `csOrbits()` → `orbitModel: 1`, `worldStamp: null`, `starStamp: null`, `minOrbitAU: null`, `compaction: null`,
    `systemScale: 1`, `starDrawScale: 1`. Gwiazda i orbity wyglądają jak przed zmianą.

## 4. Flaga przełączona po starcie
13. F5. Nowa gra bez wpisywania flag na tytule. Po starcie: `KOSMOS.gameConfig.FEATURES.scaledOrbits=true`.
14. `csOrbits()` → `orbitModel: 1`, `worldStamp: null`, `scaledOrbitsFlag: true`, `systemScale: 1`,
    `starDrawScale: 1` (świat pamięta model z chwili utworzenia).

## 5. Świat seedowany zapisany przed trybem 4X (Finding 773)
15. F5 na tytule. W konsoli:
    `KOSMOS.gameConfig.FEATURES.seededSystems=true`
    `KOSMOS.gameConfig.FEATURES.realisticClimate=true`
    `KOSMOS.gameConfig.FEATURES.scaledOrbits=true`
16. «Nowa gra» → lider → «ROZPOCZNIJ GRĘ» — **nie** naciskaj Enter w intro cywilizacji (jeszcze przed 4X).
17. Zanotuj `KOSMOS.galaxyData.seed` (liczba) i sprawdź `KOSMOS.galaxyData.seededSystems` → `true`.
    Zapisz: `KOSMOS.gameScene.saveSystem.save()`.
18. F5 (flagi wracają do OFF z pliku). «Kontynuuj».
19. `KOSMOS.galaxyData.seed` → **ta sama liczba** co w kroku 17; `KOSMOS.galaxyData.seededSystems` → `true`;
    `KOSMOS.galaxyData.orbitModel` → `2`; `csOrbits()` → `worldStamp: 2`, `starStamp: 2`.

## 6. Konsola
20. Brak czerwonych błędów poza znanymi (`AudioContext is closed` po ponownym wejściu — Finding 775); brak linii
    `[CS-3a] świat seedowany bez …`.

Wynik: PASS / FAIL + uwagi (szczególnie: wielkość gwiazdy w układzie M i G po zmianie 774, czy kliki trafiają, czy
statki w układzie M „czują się” sensownie — loty ~4× krótsze niż w G to cecha zamierzona, D-CS-24).
