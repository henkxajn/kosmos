# Obraz Operacyjny — Faza 3 (rejestr K3) — playtest-checklista

**Commity:** `a750a1d` (3a logika) · `a3608b5` (3b+3c przełącznik+tabela+oś) · **Flaga:** `FEATURES.fleetRegistry`
> Auto: smoke `tmp_fleet_registry` 42/42; live-gate CC: rejestr z 5 statkami — przełącznik, chipy
> („HD-8722" + role), sort ▲, wiersze z glifami/ETA/⚠, oś czasu z linią „teraz" i paskiem misji,
> lewa lista/prawy panel nietknięte. Wydajność: 0.11 ms/przebieg przy 100 statkach (budżet 2 ms).

- [ ] [MAPA] ⇄ [REJESTR] przełącza się bez śladu; lewa lista i prawy panel działają w OBU widokach.
- [ ] Sort klikiem w każdy nagłówek (▲/▼); filtry łączone: układ × rola × szukajka (szuka też po flocie).
- [ ] Chip 🌀 Tranzyt pokazuje statki w skoku; chip 🌀 na MAPIE otwiera rejestr z tym prefiltrem.
- [ ] Klik wiersza = selekcja wspólna (FleetGroupPanel/prawy panel reagują); checkbox → pasek „Przypisz (N)".
- [ ] 🎯 statku z INNEGO układu: overlay się zamyka, mapa przełącza układ, kamera dolatuje. Tranzyt bez 🎯.
- [ ] Oś czasu: lot+powrót = 2 paski (kolory jak trasy), warp = pasek 🌀-koloru, zoom scrollem wokół
      kursora, hover → tooltip, klik paska = selekcja; ▸ zwija do belki. ŻADNYCH rozkazów z osi.
- [ ] Szukajka: inline input po kliku; Enter/Escape zamyka; znika przy wyjściu z widoku/overlaya.
- [ ] `FEATURES.fleetRegistry=false` → przełącznik niewidoczny, zakładka tactical jak przed arkiem.
- [ ] Pełny obieg: REJESTR → sort/filtr → 🎯 → mapa/tryb Y → chip 🌀 → REJESTR (selekcja wspólna wszędzie).
