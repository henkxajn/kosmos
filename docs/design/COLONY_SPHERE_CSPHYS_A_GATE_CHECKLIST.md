# COLONY SPHERE — bramka CS-PHYS-a (realistyczny klimat przy generacji, D-CS-19 część 1)

Plan: `COLONY_SPHERE_PLAN.md` §3.8 / §3.8.1. Okno: 1600×1041 CSS (dla tej mechaniki rozmiar okna nie zmienia wyniku).
Wszystkie komendy są bez cudzysłowów i bez argumentów; każdą sprawdzono na żywym silniku (`probe-cs-phys-gate.mjs`,
headless Chrome, prawdziwy przepływ tytuł → nowa gra). Kontrola: kod sprzed zmiany nie ma `csClimate`
(`csClimate is not defined`).

## 1. Nowy świat z realistycznym klimatem
1. F5 na ekranie tytułowym. W konsoli: `KOSMOS.gameConfig.FEATURES.realisticClimate=true` → zwraca `true`.
2. «Nowa gra» → lider → «ROZPOCZNIJ GRĘ».
3. W konsoli przy starcie linia `[CS-3a] surfaceSeed nadane: … · klimat=v2`.
4. `csClimate()` → tabela ciał układu domowego + linia `[csClimate]`. Oczekiwane:
   `climateModel: 2`, `worldStamp: 2`, `realisticClimateFlag: true`, `withV2Record` = `bodies`, `withDayNight` > 0,
   `contradictions: 0` (dopuszczalne 1–2 na granicy hothouse/cryo_haze).
   W tabeli: ciała bez atmosfery mają `dayMaxC` / `nightMinC` (np. +100…+400 / ok. −178), `greenhouseC` 0;
   planety z atmosferą dense/thick blisko gwiazdy — setki °C; `record: v2` w każdym wierszu.
   `playerHome` może być `null`, dopóki gra nie weszła w tryb 4X.
5. `csLifeTick()` → `changed: 0` (temperatury zamrożone przy generacji), `homeworldsOutOfBand: 0`.
6. Najedź na planetę z atmosferą dense (jeśli jest) — dymek pokazuje tę samą temperaturę co `finalC` w tabeli.

## 2. Ten sam świat po zapisie
7. Menu ☰ → Zapisz. F5 (flaga wraca do OFF z pliku). «Kontynuuj».
8. `csClimate()` → `climateModel: 2`, `worldStamp: 2`, `realisticClimateFlag: false`, te same `bodies` / `withV2Record` /
   `withDayNight` co w kroku 4. `csLifeTick()` → `changed: 0`.

## 3. Stary zapis (sprzed kroku)
9. Wczytaj istniejący zapis (☰ → Wczytaj z pliku albo «Kontynuuj» ze starym zapisem).
10. `csClimate()` → `climateModel: 1`, `worldStamp: null`, `withV2Record: 0`, `withDayNight: 0`.
11. `KOSMOS.gameConfig.FEATURES.realisticClimate=true`, potem znów `csClimate()` → dalej `climateModel: 1`, `withV2Record: 0`.
12. `csTemp()` → `homeworldsOutOfBand: 0`; `csLifeTick()` działa jak dotąd (świat dotychczasowy — temperatury mogą się
    przeliczyć, `changed` ≥ 0).

## 4. Flaga przełączona po starcie
13. F5. Nowa gra przy OFF (nic nie wpisuj na tytule). Po starcie: `KOSMOS.gameConfig.FEATURES.realisticClimate=true`.
14. `csClimate()` → `climateModel: 1`, `worldStamp: null`, `withV2Record: 0` (świat pamięta model z chwili utworzenia).

## 5. Konsola
15. Brak czerwonych błędów poza znanymi; brak linii `[CS-3a] świat seedowany bez …`.

Wynik: PASS / FAIL + uwagi (zwłaszcza wygląd tabeli `csClimate` i czy temperatury w dymkach wyglądają sensownie).
