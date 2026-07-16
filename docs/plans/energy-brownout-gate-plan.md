# Plan: Brownout jako realna bramka produkcji (naprawa „kopalnia wydobywa bez prądu")

## Context — po co to robimy

Gracz zgłosił: kolonia z **autonomiczną kopalnią** wydobywa surowce mimo braku
elektrowni i ujemnego bilansu energii (brownout). Śledztwo (3 agenci Explore +
adwersaryjny agent Plan + weryfikacja w kodzie) potwierdziło **root cause**:

> `energy.brownout` / `energy.balance` w `ResourceSystem` jest **czysto kosmetyczny**
> — NIC nie bramkuje produkcji na jego podstawie. Komunikaty UI „⚠ BROWNOUT —
> produkcja wstrzymana" (`i18n`) **kłamią**.

Konkretnie: produkcja, która „oszukuje" energię, to ta która **omija stawki
producenta** (`effectiveRates`) i dodaje surowce wprost przez `resourceSystem.receive()`:
- **kopalnie** → `BuildingSystem._tickMineExtraction` (`src/systems/BuildingSystem.js:1739`)
  — minerały (Fe/Cu/…) powstają WYŁĄCZNIE tą ścieżką; `autonomous_mine.rates = {}`.
- **fabryki** → `FactorySystem._tick` (`src/systems/FactorySystem.js:798`) — towary,
  zero odwołań do energii.

Energia to „flow bez magazynu" — deficyt ustawia tylko flagę `balance<0`, bez żadnej
konsekwencji (brak śmierci, brak throttlingu). Do dziś jedyny efekt deficytu to
pośredni, powolny spadek prosperity→lojalności (dotyka tylko produkcji przez `rates`,
NIGDY kopalni/fabryki).

**Cel:** brownout ma realnie **ograniczać produkcję proporcjonalnie** do pokrycia
zapotrzebowania energią — dla kopalni, fabryk i badań, w koloniach gracza i AI —
zamykając pętlę sprzężenia zwrotnego „za mało prądu → mniej produkcji → zbuduj
elektrownię" (zgodnie z zasadą MDA „niedobór → kara → motywacja, **nie** game over").

## Decyzje (zatwierdzone przez gracza)

| Decyzja | Wybór |
|---|---|
| Zasięg kolonii | **Wszystkie** (gracz + AI) — spójne „prawo fizyki", AI nie oszukuje |
| Zakres produkcji | **Kopalnie + reszta produkcji** (nie tylko kopalnie) |
| Start brownout (−4) | **Brak mitygacji** — gracz zwykle ma techy buffujące produkcję energii, więc realnie nie startuje w brownoucie (`energy.production` już uwzględnia mnożniki tech) |
| Charakter bramki | **Proporcjonalny** (nie twardy 0/1 — brak klifu/migotania przy balance≈0) |

## Reguła projektowa bramki (co jest gated, co wyłączone)

Dostępność energii `avail ∈ [0,1]` skaluje **produkcję gospodarczą**, ale NIGDY:
- **energię** (producenci energii poza gated-em **z konstrukcji** → brak spirali śmierci
  `solar → mniej energii → gorszy brownout → …`); to główny powód odrzucenia „naiwnego
  Fix B" skalującego `solar_farm.rates.energy`.
- **żywność i wodę** (survival) — bramkowanie ich = spirala głodu / game-over, sprzeczne
  z zasadą „nie game over". Pozostają na 100% mimo brownoutu.

Gated: **minerały** (kopalnie), **towary** (fabryki), **badania** (research przez rates).

## Projekt techniczny

### 1. `ResourceSystem.getEnergyAvailability()` — NOWY getter (jedno źródło prawdy)
Plik: `src/systems/ResourceSystem.js` (obok `energy` struct `~:68-73`, `_recalcPerYear` `:412-450`).
```
getEnergyAvailability() {
  const e = this.energy;
  if (e.balance >= 0) return 1.0;          // pokrywa też prod=0,cons=0 (balance=0) → smoke zielony
  if (e.consumption <= 0) return 1.0;      // defensywny guard div/0 (nieosiągalny gdy balance<0, ale zostaje)
  return Math.max(0, Math.min(1, e.production / e.consumption));
}
```
- Czyta `balance/production/consumption` (NIE `brownout` — omija timing flagi; `_recalcPerYear`
  ustawia całą trójkę w jednym przebiegu → nigdy niespójna).
- **Dynamiczny per-tick**: wołany w tickach, czyta świeży `balance` (dla aktywnej kolonii
  `_tickConstruction` odświeża rates PRZED `_tickMineExtraction` w tym samym ticku).
- Brak NaN/Inf: `production≥0`, `consumption≥0`; gdy `balance<0` to `consumption>0` zawsze.

### 2. Kopalnie — `BuildingSystem._tickMineExtraction` (`:1739-1815`) — NAPRAWA ZGŁOSZONEGO BUGA
**KRYTYCZNE (korekta z audytu):** skalować **poziom wejściowy**, NIE wynik.
`DepositSystem.extractFromDeposits` (`src/systems/DepositSystem.js:123-149`) zmniejsza
`dep.remaining` o faktycznie wydobyte. Mnożenie ZWRÓCONYCH `gains × avail` wyczerpywałoby
złoże pełną prędkością, a do magazynu trafiałaby część → **brownout trwale niszczy rezerwy
złóż** (przy avail=0 katastrofa). Poprawne: `extractFromDeposits(deps, level × avail, dt)` —
`outputPerYear` liniowy w `mineLevel`, więc skaluje i wydobycie, i depletion; avail=0 →
złoże NIETKNIĘTE.

Zmiany:
- W bloku przebudowy cache (`_mineLevelDirty`, `:1747-1769`) rozdzielić pulę generyczną na
  **grid** (`energyCost>0`) i **ungated** (`energyCost==0`), oraz oznaczyć każdą grupę
  restricted flagą `grid = energyCost>0`. Dziś: wszystkie generyczne = grid; jedyna
  own-reactor (`gas_fuel_refinery`, `energyCost:0`, `mineResource:'H'`) siedzi w restricted
  → `grid=false`. Split usuwa kruchość „przyszła generyczna own-reactor kopalnia byłaby błędnie
  duszona" (agent-flagged) za ~3 linie. **Bez nowej inwalidacji** — 4 sites `_mineLevelDirty`
  (`:411,:789,:938,:989`) już strzelają dla każdej kopalni.
- Ekstrakcja: `extractFromDeposits(deps, cachedGrid × avail, dt)` + `extractFromDeposits(deps,
  cachedUngated, dt)`; grupy restricted: `grp.level × (grp.grid ? avail : 1)`.
- `avail` liczone raz na wywołanie: `this.resourceSystem.getEnergyAvailability()`.

### 3. Fabryki — `FactorySystem._tick` (`src/systems/FactorySystem.js`, prod `:798`)
Fabryka produkuje towary dyskretnie przez akumulację `alloc.progress += deltaYears` (`:768`),
`resourceSystem.receive({[commodityId]:1})` gdy `progress ≥ timePerUnit`. Bramka:
- Policz `avail = this.resourceSystem.getEnergyAvailability()` raz na górze `_tick`.
- Zmienić akumulację na `alloc.progress += deltaYears × avail`.
  - avail=0 → progress nie rośnie → 0 produkcji, **brak akumulacji** (brak burstu nadrabiania
    po powrocie prądu — czystsze niż skalowanie `speedMult`).
  - avail=0.5 → połowa przepustowości. Proporcjonalne.
- Dostęp do `this.resourceSystem` potwierdzony (`:798`); per-kolonia.

### 4. Badania — `ResourceSystem._update` (akumulator research `~:500-515`)
Jedna linia: skalować dodatni przyrost `research.amount += research.perYear × (perYear>0 ? avail
: 1) × dt`. **NIE dotykać pętli `_inventoryPerYear`** (`:480-498`) — tam siedzą food/water
(survival, wyłączone) i tak; minerały/towary tamtędy nie płyną. To izoluje blast-radius od
survival.

### 5. i18n — przeredagowanie (PL+EN, dwujęzyczność obowiązkowa)
Bramka jest proporcjonalna i wyłącza survival → „wstrzymana"/„halted" jest teraz nieścisłe.
Zmienić 4 stringi (DESC) na „ograniczona"/„reduced":
- `log.brownoutStart` — `pl.js:863` / `en.js:861`
- `popPanel.crisisBrownoutDesc` — `pl.js:1849` / `en.js:1847`
- `econPanel.alertBrownoutDesc` — `pl.js:2102` / `en.js:2100`
- `topBar.brownoutWarning` — `pl.js:2173` / `en.js:2171`

Propozycja: PL „⚠ BROWNOUT — produkcja ograniczona (deficyt energii)", EN „⚠ BROWNOUT —
production reduced (energy deficit)". Etykiety `econPanel.brownout` = „⚠ BROWNOUT" zostają.

### Opcjonalny kill-switch (do potwierdzenia lokalizacji przed kodem)
Rozważyć const/flagę rollback (np. `FEATURES.energyBrownoutGate`, default ON) — bo to zmiana
balansowa. Per reguła gracza *potwierdź lokalizację wspólnego configu (GameConfig.js) PRZED
wpisem* — ustalę z Tobą w trakcie implementacji, czy dodawać. `getEnergyAvailability` i tak
zwraca 1.0 przy `balance≥0`, więc bramka jest bezczynna bez deficytu (samoograniczająca).

## Pliki do zmiany
- `src/systems/ResourceSystem.js` — nowy `getEnergyAvailability()`; 1 linia w `_update` (research).
- `src/systems/BuildingSystem.js` — `_tickMineExtraction`: split cache grid/ungated + skalowanie
  poziomu wejściowego (NIE wyniku).
- `src/systems/FactorySystem.js` — `_tick`: `progress += deltaYears × avail`.
- `src/i18n/pl.js`, `src/i18n/en.js` — reword 4 stringów.
- `src/testing/smoke/energy_brownout_gate_smoke.mjs` — NOWY test.
- (opcjonalnie) `src/config/GameConfig.js` — kill-switch, po potwierdzeniu.

## Reużycie / wzorce (bez wynajdywania koła)
- `_inventoryGrossPerYear` (`ResourceSystem._recalcPerYear`) — istniejący split produkcja/netto
  (gdyby kiedyś gated-ować rate-based produkcję inaczej niż research; teraz niepotrzebny).
- `OUTPOST_EFFICIENCY` (`BuildingSystem.js:41`) i `_getBuildingLaborEfficiency` (`:1624`) —
  wzorzec skalarnego mnożnika z early-return dla autonomicznych; analogia dla `avail`.
- `asteroid_mining ×2` hook (`BuildingSystem.js:1799-1808`) — istniejący precedens mnożnika
  na `gains` w `_tickMineExtraction` (ale my skalujemy POZIOM, nie gains — patrz §2).
- `ColonyManager.isPlayerColony` — dostępny jako 1-liniowy rollback gdyby playtest pokazał
  regres AI (domyślnie bramka dla WSZYSTKICH).

## Testy
**Nowy smoke `energy_brownout_gate_smoke.mjs`:**
1. `getEnergyAvailability`: brak producentów (bal 0)→**1.0**; `{energy:8}+{-4}` (bal +4)→1.0;
   `{energy:8}+{-8}` (bal 0)→**1.0**; `{energy:6}+{-12}` (bal −6)→**0.5**; `{energy:-4}` (bal −4)→**0.0**.
2. `_tickMineExtraction`: kopalnia grid + avail=0.5 → wynik = połowa; balance≥0 → pełny (jak T7).
3. **Konserwacja złoża** (guard przed bugiem „mnożenie wyniku"): grid + avail=0.5 → `dep.remaining`
   spadło o POŁOWĘ pełnej ekstrakcji (nie o pełną). Najważniejsza asercja.
4. Restricted own-reactor (`gas_fuel_refinery`, grid=false) + wymuszony brownout → `fuel` bez zmian.
5. Restricted grid (syntetyczny `{isMine, mineResource:'X', energyCost:4}`) + brownout → duszony.
6. Split: generyczna own-reactor (syntetyczna `{isMine, energyCost:0}`) + brownout → NIE duszona.
7. `FactorySystem._tick`: avail=0.5 → ~połowa jednostek/rok; avail=0 → 0 jednostek, `progress` nie rośnie.

**Regresja (MUSI zostać zielona):**
- `src/testing/smoke/tmp_s3_0a_c_smoke.mjs` — woła `_tickMineExtraction(1.0)` na mocku bez
  producentów energii (bal 0 → avail 1.0) → identyczne wyniki. Guard zielony z konstrukcji.
- Pełna bateria smoke S3.4c/S3.4d (0 FAIL — reguła projektu).

**Headless balans (WYMAGany dla tego slice — AI nietunowane pod brownout):**
- Uruchomić `tools/balance-tester` (RuleBot/Industrialist) i porównać: przeżywalność kolonii
  AI, brak spirali wymierania, sensowne rateFe/energyBalance. `industrialist.js:203` zakłada
  brownout=false — obserwować czy AI wpada w duszony reżim. Jeśli tak → rozważyć rollback lever
  `isPlayerColony` LUB tuning solarów AI (osobno).

## Weryfikacja end-to-end (live-gate — OBOWIĄZKOWA przed commitem)
1. Nowa/istniejąca kolonia gracza z `automation`; postaw `autonomous_mine` BEZ wystarczającej
   elektrowni → obserwuj brownout w UI (TopBar/Econ) + **spadek/zatrzymanie przyrostu Fe**.
2. Dobuduj `solar_farm` aż `balance≥0` → wydobycie wraca do pełnego.
3. Fabryka w brownoucie → wolniejsza/zatrzymana produkcja towarów; po prądzie → wraca.
4. Potwierdź, że **żywność/woda produkują się dalej** w brownoucie (brak głodu-game-over).
5. Indukcja brownoutu: `KOSMOS.debug.givePop(...)` (podnosi konsumpcję energii) lub duży
   `research_station`/`launch_pad` bez solarów; `KOSMOS.debug.give({Fe,...})` by stać na budynki.
6. Sanity: kolonia AI (`KOSMOS.debug.spawnTestEnemy`) nie zapada się przez nową bramkę.

## Ryzyka i mitygacje
- **Spirala energii** (solar duszony) → **wykluczona z konstrukcji** (energia nigdy nie gated).
- **Spirala głodu** → wykluczona (food/water wyłączone z bramki).
- **Balans AI** (baseline nietunowany) → headless regresja + gotowy `isPlayerColony` rollback.
- **Waste złóż** przy avail<1 → naprawione przez skalowanie POZIOMU wejścia (nie wyniku) +
  dedykowany test konserwacji złoża (§Testy #3).
- **Staleness balance dla nieaktywnych kolonii AI** (~1 civY lag przez `EmpireColonyMaintenance`)
  → istnieje już dziś (survival AI czyta ten sam lagowany balans); bramka nie pogłębia.

## Poza zakresem (backlog / osobne slice)
- Mitygacja startowego −4 (2× solar / niższy `energyCost` launch_pad / energia w `colony_base`)
  — niepotrzebna wg gracza (buffy tech na energię); tylko jeśli live-gate pokaże, że boli.
- Input-gating stawek producenta na energii (rate-based food/water/inne) — świadomie NIE
  ruszamy (survival + większy blast-radius).
- Tuning solarów kolonii AI, gdyby headless pokazał regres.
- Migracja save: **brak** — czysto runtime (bez nowych pól serializowanych).

## Konwencje procesu (reguły gracza)
- **Pokażę dokładne edycje** (plik + linia + wartość) do akceptacji PRZED zastosowaniem.
- **Potwierdzę lokalizację** ewentualnego wpisu do GameConfig przed kodem.
- Commit slice'a prosto na `main` (bez per-slice brancha).
