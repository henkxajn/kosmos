# REFORMA ZAKŁADEK — ramy (decyzje właściciela 2026-10-24)

> **Stan: RAMY PODPISANE 2026-10-24 — krok ZAPLANOWANY po paczce A ARKUSZA HUD, poza arkuszem HUD; nic nie wykonane.**
> Pierwszy krok — inwentarz zakładek read-only (§3). Kotwica: commit dokumentacji zamykający paczkę A
> (`docs(HUD A CLOSE)`). Reforma dotyczy tych samych powierzchni co „reforma pływających okien” zaparkowana w ARKUSZU UI
> (`UI_PLAN.md` §1). Findingi — numeracja wspólna (`HUD_PLAN.md` §3, pierwszy wolny **531**); powiązane: 488, 493
> (`UI_PLAN.md` §6), 529 (`HUD_PLAN.md` §3).

---

## 1. Ramy (decyzje właściciela 2026-10-24)

1. **Statki** — panel wysuwany W LEWO od prawego outlinera, na wysokości wiersza statku, zwijany przy zmianie
   zaznaczenia; pływający panel statku znika.
2. **Kolonie, ciała, stacje** — model etykiety: najechanie rozwija informację pod wersalikiem, klik przypina rozwinięcie
   z akcjami przy etykiecie; karta ciała i panel stacji znikają; **493 (karta z boku tarczy) = rozwiązanie przejściowe**.
3. **Pierwszy krok reformy = inwentarz zakładek read-only:** pola, akcje, kto otwiera — karta ciała, karta kolonii, panel
   statku, panel stacji.

## 2. Punkty wyjścia (nazwy z kodu i dokumentów — bez audytu; audytem jest krok 1)

| Powierzchnia | Dziś | Ramy (§1) |
|---|---|---|
| panel statku | `FleetManagerOverlay.drawVesselPanel` w trybie panelu nad mapą (`MAP_VESSEL_PANEL_PLAN.md`); od paczki A z boku modelu statku przy `FEATURES.bodyCardSide` (`BodyCardSideLogic`) | panel wysuwany w lewo od prawego outlinera — §1.1 |
| karta ciała | `BottomContext` — karta pływająca (przeciąganie za nagłówek, minimalizacja do doku — S3.4b); od paczki A z boku tarczy przy `bodyCardSide` | znika — rozwinięcie etykiety — §1.2 |
| karta kolonii | do ustalenia w inwentarzu (§3) | rozwinięcie etykiety kolonii — §1.2 |
| panel stacji | `StationPanel` — panel pływający (przeciąganie, dok — S3.4b); od paczki A z boku modelu stacji przy `bodyCardSide` | znika — rozwinięcie etykiety — §1.2 |

Etykiety, na których staje model z §1.2, rysuje od paczki A warstwa HUD (`HudLabelLayer` — ARKUSZ HUD H2, `HUD_PLAN.md`
§4.3): kolonie wersalikami, druga linia z danymi dla zaznaczonego i najechanego, strefa kliku = prostokąt tekstu, klik
etykiety po karcie ciała.

## 3. Krok 1 — inwentarz zakładek (read-only)

Dla każdej z czterech powierzchni (§1.3): **pola** (co pokazuje i skąd czyta), **akcje** (przyciski i ich skutki) i **kto
otwiera** (wejścia: mapa 3D, outlinery, Dok taktyczny, etykiety, klawisze, zdarzenia). Bez zmian w `src/`; wynik — tabele
w tym pliku i kandydaci na findingi z numeracji wspólnej. Projekt reformy i cięcie na kroki — po inwentarzu, do podpisu
właściciela.

## 4. Powiązane findingi

- **488** (`UI_PLAN.md` §6) — zamknięcie karty ciała to glif „−”, który wygląda jak minimalizacja.
- **493** (`UI_PLAN.md` §6) — ✅ przejściowo: ARKUSZ HUD paczka A, A-3 `9b5e6f1` (`bodyCardSide`).
- **529** (`HUD_PLAN.md` §3) — panel statku z boku modelu potrafi przykryć trasę i cel statku.
