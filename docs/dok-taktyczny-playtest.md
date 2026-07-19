# Playtest — „Dok taktyczny" (Faza 4 Obrazu Operacyjnego)

**Dla:** Filip · **Kontekst:** slice'y 4a–4d (commity `d946915` · `f55e198` · `97e4002` · `6278770`).
**Flaga:** `FEATURES.tacticalDock` — **domyślnie OFF**. Aby przetestować, ustaw w
`src/config/GameConfig.js` `tacticalDock: true`, odśwież grę (Live Server), wejdź w tryb Y (`Y`).
**Save:** v90 bez migracji (stan zwinięcia + aktywna zakładka w `uiPrefs`).

> ⚠ **Live-gate NIE był wykonany** (sesja autonomiczna — rozszerzenie Chrome niepodłączone).
> Weryfikacja: smoke `tmp_tactical_dock_smoke.mjs` 103/103 + regresje arca (fleetpicture 83 /
> map_labels 52 / tactical 44 / registry 50). Ta checklista domyka DoD §4 na żywej grze.

---

## A. Flaga OFF — zero śladu (DoD §4.1)
- [ ] Z `tacticalDock: false` (default): tryb `Y` działa **dokładnie jak dotąd** — brak pasa na dole,
      zero zmian pozycji paneli floty/HUD, enter/exit `Y` < 1 s.

## B. Pas — pojawianie się / zwijanie
- [ ] `tacticalDock: true` → wejście w `Y` pokazuje pas na dole; wyjście z `Y` (ponowne `Y`) chowa go
      natychmiast.
- [ ] Otwarcie dowolnego overlaya (np. Dowództwo) auto-wyłącza tryb Y → pas znika (nie nakłada się na overlay).
- [ ] Strzałka **▾** zwija pas do samego paska zakładek; **▴** rozwija. Stan przeżywa wyjście/wejście w `Y`
      (i przeładowanie strony — zapis w `uiPrefs`).
- [ ] Zakładka aktywna ([LISTA]/[OŚ]) też jest zapamiętywana.

## C. Kolizje z dolnym HUD i panelami (DoD §4.4)
- [ ] Pas siedzi **nad** paskiem nawigacji; **zegar/prędkości/MENU** (prawy-dolny róg) pozostają widoczne
      i klikalne (rysują się na wierzchu pasa).
- [ ] Outliner (prawy wysuwany panel) **chowa się**, gdy pas jest rozwinięty; wraca po zwinięciu lub wyjściu z `Y`.
- [ ] Panele pływające podnoszą się **nad** pas: zaznacz statki (CTRL+klik / box-select) → **panel grupy**
      wisi nad pasem, nie pod nim; przy flocie — **panel dowodzenia flotą** analogicznie; **panel stacji**
      (klik stacji) nie chowa się pod pasem.

## D. LISTA — selekcja i podgląd (DoD §4.3)
- [ ] Wiersze pokazują statki z **bieżącego układu + tranzytu**; alerty na górze, potem najbliższe ETA.
- [ ] **Klik** wiersza → statek zaznaczony (ramka na mapie) + krótki „ping" na jego pozycji; **kamera się
      NIE rusza**.
- [ ] **Dwuklik** wiersza → kamera dolatuje do statku (śledzi go).
- [ ] Klik statku **na mapie 3D** → dok **przewija się** do jego wiersza (podświetlony).
- [ ] **Najechanie** wiersza → trasa statku **jaśnieje**, a jego „duch ETA" **pulsuje mocniej**; zdjęcie
      kursora gasi podgląd. Hover **niczego nie zaznacza**.
- [ ] Kółko myszy **nad pasem** przewija listę; **poza pasem** zoomuje kamerę (brak konfliktu).

## E. Mini-panel — akcje (DoD §4.3)
- [ ] Zaznacz **jeden** statek → prawy mini-panel: glif+nazwa, rola·aktywność, ETA, paski paliwa (+warp
      jeśli jest), alerty.
- [ ] Statek z **aktywnym/zablokowanym rozkazem ruchu** → widoczny **✕ Anuluj rozkaz**; klik → rozkaz
      anulowany, przycisk znika, statek **wznawia zawieszoną misję** (jeśli była).
- [ ] Znajdź statek z alertem **„rozkaz zablokowany"** (np. pursue bez broni / poza zasięgiem) → ✕ Anuluj
      → alert gaśnie.
- [ ] **🎯 Rejestr** → otwiera Dowództwo → **REJESTR** z tym statkiem **wybranym i przewiniętym** do jego wiersza.
- [ ] Zaznacz **wiele** statków → mini-panel pokazuje tylko **„Zaznaczone: N"** + podpowiedź (akcje w panelu
      grupy); przy **flocie** — nazwa floty + podpowiedź (panel dowodzenia flotą). Dok **nie dubluje** tych akcji.

## F. OŚ (timeline)
- [ ] Zakładka **[OŚ]** pokazuje te **same statki co LISTA** (ta sama kolejność), jako paski misji z
      podziałką lat i linią „teraz".
- [ ] Statek zadokowany bez misji = pusty wiersz (jest, ale bez paska).
- [ ] **Najechanie na pasek** → na mapie pojawia się marker **`~rok`** w miejscu, gdzie będzie **planeta-cel**
      w roku spod kursora (cyan, odróżnia się od żółtego markera ETA zaznaczonego statku).
- [ ] Klik/dwuklik lane'u = selekcja/dolot (jak LISTA). Kółko przewija oś.

## G. Małe ekrany / czytelność
- [ ] Przy wąskim oknie pas nadal czytelny (mini-panel przycięty, lista nie wyjeżdża poza ekran).
- [ ] Zwinięty pas nie zasłania niczego istotnego.

---

**Uwagi / bugi (wpisuj tutaj):**

---

## WYNIKI LIVE-GATE 4f (Filip) — 7/9 PASS + pakiet poprawek

**PASS:** hover (pkt D — kolor+puls wystarcza; realna grubość linii DEFERRED `#route-line2-thickness`),
selekcja/dwuklik/scroll/OŚ/mini-panel. **Uwagi zgłoszone i naprawione:**

1. **Znikająca „Stacja Nowa Ziemia"** (znika i wraca) — przyczyna to NIE zniknięcie mesha, lecz declutter
   `labelLOD` przy dystansie dopasowania układu / w trybie Y (GLB stacji sub-pikselowy → marker etykiety =
   jedyna forma). **Fix `b35c0a5`**: `stationLabelLOD` z podłogą markera `STATION_MARKER_FLOOR=0.9`
   (akceptowana). **Kandydat B potwierdzony live** (stacja → chip do innego układu → powrót → stacji nie ma):
   **fix `75f5778`** `_restoreActiveSystemStations` w `switchSystem`.
2. **Dok „niemal pływa" (4f-1b, `be4517d`)** — `TACTICAL_DOCK_BG_ALPHA` 0.55→0.32 + USUNIĘTA ramka pasa
   i przegroda mini-panelu (separacja = przyciemnienie tła + typografia).

**POZOSTAŁY FINALNY live-check Filipa:** (a) przezroczystość/brak ramki doku; (b) scenariusz
**stacja → inny układ → powrót** (stacja wraca). Jeśli oba PASS → **Faza 4 zamknięta w całości** →
następny krok: test **„tydzień bez MAPY"** (dok ON) → decyzja o kasowaniu mapy 2D wg §10.3.
