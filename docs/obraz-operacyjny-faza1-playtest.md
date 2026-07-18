# Obraz Operacyjny — Faza 1 (M1-light) — playtest-checklista

**Data:** 2026-07-18 · **Commity:** `e4054b4` (1a logika) · `26e758e` (1b plakietki+flaga) · `877132c` (1c strzałki+chipy+interakcje)
**Flaga:** `FEATURES.fleetMapLabels` (ON) · toggle gracza: menu ☰ → „Plakietki floty" (`uiPrefs.fleetMapLabelsVisible`)
**Wzór:** `docs/m4-p3-playtest-checklist.md`. Odhacza Filip — najlepiej na REALNYM save (multi-układ, floty, wrogowie);
Power Test pokrywa tylko część (jeden układ, brak tranzytu).

> Weryfikacja automatyczna przed playtestem: smoke `tmp_fleet_map_labels_smoke.mjs` 44/44 ·
> `tmp_fleetpicture_smoke.mjs` 81/81 · regresja `tmp_map_labels` 37/37 (kolonie/stacje nietknięte).
> Live-gate CC (Chrome/Power Test): plakietka ×2 z tonem alertu nad statkami w locie · klik plakietki →
> selekcja obu statków + FleetGroupPanel · chip „sys_home ×5 ⚠1" przy prawej krawędzi · toggle OFF→ON.

## A. Plakietki (profil light)

- [ ] Przy ~20 statkach w układzie mapa pozostaje CZYTELNA — plakietki tylko nad flotami/klastrami/alertami;
      samotne zdrowe statki bez floty NIE mają plakietek (spokój wizualny).
- [ ] Plakietka floty pokazuje `⚑ Nazwa ×N`; klaster mieszany `×N`; pojedynczy w flocie glif+nazwę.
- [ ] Kolor plakietki = stan (szary idle · cyan/info ruch · zielony misja · bursztyn alert · czerwony walka);
      kropka alertu w rogu gdy w klastrze jest problem.
- [ ] **Migotanie (KLUCZOWE):** przy POWOLNYM zoomie in/out plakietki klastrów NIE migoczą i nie skaczą
      (histereza 44/56 px — statki na granicy promienia trzymają się klastra do 56 px).
- [ ] Przy zbliżeniu (dist ≤ ~120) pojawia się etykieta WYBRANEGO statku; oddalenie wygasza detale, zostają klastry.
- [ ] Plakietki nie nakładają się na siebie (zsuwanie pionowe + łącznik do kotwicy gdy przesunięta).
- [ ] Ekstremalne oddalenie (cały układ w kadrze, dist > ~450) → plakietki znikają (declutter).

## B. Mgła wojny

- [ ] Wróg NIEWYKRYTY (quality unknown) — zero śladu na warstwie.
- [ ] Wróg RUMOR — plakietka anonimowa `⚠ ?` (bez nazwy, bez roli), czerwona.
- [ ] Wróg CONTACT+ — plakietka z nazwą i glifem roli, czerwona; klik → dolot kamery (BEZ selekcji).
- [ ] Wrogowie i własne NIGDY w jednej plakietce klastra (strony klastrowane osobno).

## C. Strzałki krawędziowe

- [ ] Statki poza kadrem → grot przy właściwej krawędzi ekranu; wiele statków w tym samym sektorze → jeden grot + licznik.
- [ ] Grot w kolorze najgorszego stanu grupy (np. czerwony gdy poza kadrem trwa walka).
- [ ] Obrót/zoom kamery aktualizuje strzałki bez migotania.

## D. Chipy układów (prawa krawędź)

- [ ] Po jednym chipie na układ z ≥1 własnym statkiem (`Nazwa ×N`); aktywny układ wyróżniony (akcent);
      badge `⚠N` gdy alerty. Gdy WSZYSTKO w aktywnym układzie bez alertów → stos ukryty (zero szumu).
- [ ] Klik chipu innego układu → mapa przełącza się na tamten układ (kanał `switchActiveSystem`, jak STAR ATLAS).
- [ ] Statki w skoku międzygwiezdnym → chip `🌀 ×N`; klik → otwiera COMMAND (zakładka tactical; REJESTR w Fazie 3).
- [ ] Chipy nie kolidują z Outlinerem/minimapą (jeśli wchodzą w drogę — zgłoś, przesuniemy stos `CHIP_TOP_FRAC`).

## E. Interakcje i integracja

- [ ] Klik plakietki własnej → selekcja CAŁEGO zbioru (klaster = multi-select) → FleetGroupPanel otwiera się sam.
- [ ] Selekcja z plakietki działa dalej z PPM (rozkaz dla zaznaczonych) — identycznie jak selekcja klasyczna.
- [ ] Etykiety KOLONII i STACJI wyglądają i klikają się jak przed zmianą (zero regresji `mapLabels`).
- [ ] CTRL (podgląd wszystkich etykiet 3D) działa jak dotąd.

## F. Przełączniki i koszty

- [ ] Menu ☰ → „Plakietki floty" WYŁ → cała warstwa znika (plakietki+strzałki+chipy); WŁ → wraca. Stan przeżywa save/load.
- [ ] `FEATURES.fleetMapLabels=false` (GameConfig) → zero śladów warstwy i zero kosztów (gate = 1 boolean).
- [ ] Brak odczuwalnego spadku FPS przy ~20+ statkach (budżet ≤ 2 ms/klatkę; zmierz przy okazji, jeśli podejrzenie).
- [ ] Save sprzed zmian wczytuje się bez migracji (v90); zapis/odczyt bez zmian formatu.

## Znane ograniczenia v1 (świadome)

- Wraki NIE mają plakietek (poza zakresem Obrazu Operacyjnego v1 — zostają w listach COMMAND, klawisz K).
- Chip tranzytu otwiera tactical (REJESTR z prefiltrem transit dojdzie w Fazie 3).
- W Power Test chip pokazuje `sys_home` zamiast nazwy (scenariusz nie rejestruje układu w StarSystemManager);
  na realnym save nazwa z galaktyki.
- Plakietka wroga przy rumor nie fade'uje z wiekiem plotki (intel-fade to warstwa 3D; plakietka = binarna widoczność).
