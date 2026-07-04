# S3.4 FAZA 2 — Manual live-gate (test w przeglądarce)

> **Status:** WERSJA ROBOCZA (autor: CC, 2026-07-04) — do zastąpienia plikiem Filipa
> `s34-faza2-live-gate-manual.md` **bez zmian treści**, jeśli Filip dostarczy własny.
> Do czasu dostarczenia ten plik służy jako procedura live-gate FAZY 2, żeby dokument
> wznowienia (`docs/plans/s34-stations-continuation.md`) był samowystarczalny.
>
> **Cel FAZY 2 (kryterium STOP z planu):** „budowa modułu z paskiem czasu, deficyt energii
> gasi moduły, stocznia buduje statek". Moduły NIE mają jeszcze UI (ekran = FAZA 3) — test
> idzie przez konsolę (`KOSMOS.debug.*`).

## Przygotowanie
1. Otwórz grę przez Live Server, wejdź w scenariusz **Cywilizacja** (civMode aktywny).
2. Otwórz konsolę deweloperską (F12).
3. (Opcjonalnie) przyspiesz czas suwakiem — buildTime modułów liczony w latach cywilizacyjnych
   (habitat ~91 dni gry, shipyard ~243 dni gry; przy 1 dzień/s to sekundy realne, ale przy
   wolnym czasie długo — użyj wyższej prędkości).

## T1 — Stacja + moduły startowe
```js
KOSMOS.debug.spawnStation()   // stacja na orbicie homePlanet
KOSMOS.debug.stationInfo()    // oczekiwane: modules = [habitat lv1 ✓, power_atom lv1 ✓], pop 0, popCapacity 1
```
✅ **PASS gdy:** stacja ma 2 moduły startowe, oba `active`, `popCapacity 1`.

## T2 — Budowa modułu z postępem
```js
KOSMOS.debug.stationBuildModule('trade_module')   // dosyp depot + zakolejkuj
KOSMOS.debug.stationInfo()                         // pendingModuleOrders: trade_module building X/5.0
// …odczekaj (buildTime trade = 5 lat cyw. ~152 dni gry)…
KOSMOS.debug.stationInfo()                         // trade_module przeszedł do modules[] jako ✓
```
✅ **PASS gdy:** zamówienie widać jako `building` z rosnącym postępem, po `buildTime` moduł
wchodzi do `modules[]` jako `active`, a `tradeCapacity` = 200.

## T3 — Stocznia buduje statek
```js
KOSMOS.debug.stationBuildModule('shipyard')
// …odczekaj aż shipyard się zbuduje…
KOSMOS.debug.stationInfo()                    // hasActiveShipyard: true (obsada z habitatu, popCapacity ≥ Σ popWork)
KOSMOS.debug.stationBuildShip('science_vessel')
KOSMOS.debug.stationInfo()                    // shipQueues: science_vessel X/buildTime
// …odczekaj…
KOSMOS.debug.stationInfo()                    // shipQueues pusta → statek zadokowany przy stacji
```
✅ **PASS gdy:** po zbudowaniu stoczni `hasActiveShipyard=true`; statek buduje się i po czasie
znika z `shipQueues`, pojawia się zadokowany przy stacji (widoczny na mapie/w panelu floty).

## T4 — Efekt: lab → research
```js
KOSMOS.debug.stationBuildModule('lab')
// …odczekaj aż lab active…
```
✅ **PASS gdy:** górna belka research rośnie szybciej (lab dorzuca 4 RP/rok do globalnej puli).

## T5 — Deficyt energii gasi moduły wg priorytetu
```js
// Dobuduj moduły poborowe bez dodatkowej energii, aż net < 0:
KOSMOS.debug.stationBuildModule('trade_module')
KOSMOS.debug.stationBuildModule('lab')
// (starter power_atom daje tylko +6; habitat -1, trade -2, lab -2, shipyard -3…)
KOSMOS.debug.stationInfo()
```
✅ **PASS gdy:** przy deficycie moduły gasną w kolejności **trade → lab → shipyard**
(`✗no_power`), a `habitat`/`power_*` (core) zostają aktywne. Dobudowanie źródła energii
(`power_solar`/`power_fusion`) przywraca zgaszone moduły.

## T6 — Round-trip save (v90)
1. Zbuduj kilka modułów (część w trakcie budowy).
2. Zapisz grę → przeładuj stronę (F5) → wczytaj.
3. `KOSMOS.debug.stationInfo()`.
✅ **PASS gdy:** moduły, `pop`, kolejki modułów i `shipQueues` przetrwały reload; `save.version === 90`.

---
## Znane ograniczenia (świadome, NIE bug)
- **Obsada = `max(pop, popCapacity)`** — TYMCZASOWY mostek FAZY 2: habitaty auto-obsadzają
  moduły (pasażerowie dowożący `pop` to FAZA 4). Świeża stacja działa bez `stationSetPop`.
  Na starcie FAZY 4 decyzja: powrót do `obsada = pop` (patrz continuation plan, FLAGA).
- Moduły bez UI — cały test przez `KOSMOS.debug.*` (ekran zarządzania = FAZA 3).
- `KOSMOS.debug.stationSetPop(n)` — ręczne ustawienie załogi (prekursor pasażerów), do testu
  ścieżki `no_crew` gdy zechcesz wymusić obsadę > popCapacity.

## Wynik
- [ ] T1  [ ] T2  [ ] T3  [ ] T4  [ ] T5  [ ] T6 → **FAZA 2 live-gate: PASS / FAIL**
- Uwagi Filipa: …
