# S3.4c domknięcie — Z4–Z8 (per-frame error + FPS + debug/UI + re-adopcja sieroty)

> **Status:** KOD ZASTOSOWANY, smoke + pełna regresja s34c* ZIELONA. **Live-gate PENDING (Filip).**
> **NIE zacommitowane** (czeka na WSPÓLNY retest live + osobną zgodę). Save v90 bez bumpu (zero zmian formatu).
> Commity planowane RAZEM: Z4/Z5 (dispose+guard) · Z6/Z7/T5 (debug+UI) · **Z8 (re-adopcja sieroty)**.

## Kontekst
Po `colony:destroyed` (debug `destroyColony`) leciał **błąd per-frame** w pętli renderu
(`FactorySystem.isRecipeAvailable → console.warn` z pełnym stackiem, setki tysięcy powtórzeń →
zalew konsoli + spadek FPS). Zadania Z4–Z7 domykają S3.4c: fix per-frame, FPS, debug `stationFillDepot`,
`getTradeCapacity` LIVE + fix fałszywej diagnostyki breakdownu.

---

## Z4 — fix błędu per-frame po colony:destroyed

### Root cause
Każda kolonia posiada **5 systemów per-kolonia** subskrybujących `time:tick` w konstruktorze:
`FactorySystem`, `ResourceSystem`, `CivilizationSystem`, `BuildingSystem`, `ProsperitySystem`.
`ColonyManager.removeColony` robił `_colonies.delete(planetId)`, ale **NIE odsubskrybował** tych
systemów → zniszczona kolonia tyka w nieskończoność.

Tylko `FactorySystem` jest „głośny": osierocony `_update` → `_reactiveAllocate →
_scanConsumptionDemand → isRecipeAvailable`. `_getOwnerColony()` zwraca null (kolonia usunięta),
ale `_scanConsumptionDemand` ma **fallback na `window.KOSMOS.civSystem` (aktywna kolonia, pop>0)** →
dochodzi do `isRecipeAvailable('basic_supplies')` → `techSys` undefined → **`console.warn` co klatkę**.

### Kategoryzacja (wg planu Z4)
**(b) pre-istniejący dług ścieżki śmierci kolonii.** NIE regresja S3.4c — S3.4c nie dotykał
`FactorySystem` ani teardownu `removeColony`. Sam `console.warn` pochodzi ze Slice 2 S2 (per-empire
tech isolation, fail-closed). Debug `destroyColony` tylko **uwidocznił** stary leak.

### Fix — dwie warstwy
1. **Dispose** (Z5, leak): każdy z 5 systemów dostał `dispose()` zdejmujące swój `time:tick`
   (przekształcenie inline arrow → `this._onTick` + `EventBus.off`). `removeColony` woła
   `colony.<system>?.dispose?.()` na wszystkich 5 PRZED `_colonies.delete` (optional-chaining
   pokrywa outposty/AI bez kompletu systemów).
2. **Orphan-guard** (Z4, ZERO warn): `FactorySystem._update` na początku
   `if (!this._getOwnerColony()) return;`. Defense-in-depth — wycisza też ścieżkę `transferColony`
   (backlog, niżej), gdyby fabryka pozostała zasubskrybowana.

### Backlog (plik:linia)
`ColonyManager.transferColony` (**`src/systems/ColonyManager.js:654`**, przejęcie kolonii przez AI /
inwazja) ma **bliźniaczy leak** — też `_colonies.delete` bez dispose. NIE naprawione tu (dotyka
ścieżki game-over home-planet → wymaga guardu `!isHomePlanet` + ostrożności). **Dispose-pattern
gotowy do reużycia** (te same `dispose()` methods); orphan-guard `FactorySystem._update`
**tymczasowo wycisza** warn na tej ścieżce (zombie ticker pozostaje, ale cichy/benign).

---

## Z5 — wydajność
Hipoteza handoffu potwierdzona: pętla `console.warn` (pełny stack co klatkę) = główna przyczyna
spadku FPS. Dispose usuwa 5 tickerów/zniszczoną kolonię (zero przyrostu subskrypcji `time:tick`).
Orphan-guard gwarantuje, że nawet nieusunięta fabryka nie loguje. Smoke `s34c_z4_dispose_orphan`
weryfikuje: `dispose()` zdejmuje listener (licznik `EventBus.listeners['time:tick']` wraca do
baseline), osierocony `_update` = no-op bez warn (5 „klatek", 0 warnów).

---

## Z6 — debug `stationFillDepot(stationId?)`
Param już był opcjonalny; proxy S3.4c już routuje matka→magazyn kolonii / sierota→własny depot
(bez zmian kodu). **Dodano** wzbogacony log: `cel=<id> (matka=<colonyId>, wspólny magazyn / odcięta)`
+ **lista WSZYSTKICH stacji** (`{id, owner, detached}`) dla orientacji. (`GameScene.js` ~:893)

## Z7 — `getTradeCapacity` liczy LIVE
`CivilianTradeSystem.getTradeCapacity` czytało **echo** `col.tradeCapacity` (aktualizowane tylko w
`_halfYearlyTick`, który early-return przy <2 koloniach handlowych → single-colony widział wartość
stale). Teraz liczy **LIVE** przez `_allocateTC` (pure). Jedyny konsument = display (TradeOverlay);
bonus stacji (D7) widoczny natychmiast, niezależnie od ticku.

## T5 — fix fałszywej diagnostyki breakdownu
`tradeCapacityBreakdown` (debug) używał `getPlayerColonies().length < 2` — mylił liczbę kolonii
gracza z gate'em `_halfYearlyTick`. Prawdziwy gate = **<2 kolonie HANDLOWE** (spaceport,
nie-izolowane). Licznik przełożony na `tradingCount` (ten sam filtr co `_halfYearlyTick` L83-98) +
dodano pole `tradingColonies` w outpucie. Po Z7 komunikat zaznacza, że display jest LIVE (echo==live
z definicji), a `<2` dotyczy tylko **routingu** (`_tcPool`/flow), nie wyświetlania.

---

## Z8 — pełny cykl osierocenie ↔ adopcja (re-adopcja sieroty)

### Root cause (POTWIERDZONA hipoteza flagi)
`depotDetached` był **jednokierunkowy**: `_onColonyDestroyed` (`StationSystem.js:170`) ustawiał go, ale
**nic go nie czyściło**. Dwa gate'y respektowały flagę bez ścieżki wyjścia:
- `TransferStore.resolveHomeColony:40` — `if (station.depotDetached) return null;` PRZED sprawdzeniem
  `ownerColonyId` → proxy zawsze routował do lokalnego depotu, mimo żywej matki.
- `StationSystem._normalizeAndDrainDepot:152` — `if (station.depotDetached) return;` → drain pomijany
  przy restore.

`_normalizeAndDrainDepot:155` re-stampował `ownerColonyId` (stąd `owner: 'entity_2'` w serialize po
reloadzie), ale flaga zostawała → **stan połowiczny: owner żywy, depot martwy, UI „Odcięta"**.
Kto przestemplował owner na entity_2: **restore normalize** (stamp fallback), nie subskrybent na żywo.

### Fix — adopcja symetryczna do osierocenia
- **`TransferStore.js`**: wydzielony `_strictMotherLink` (stamp → per-body → parent, BEZ „jedyna
  w systemie"). `resolveHomeColony` = zachowanie IDENTYCZNE (link + single-in-system + guard detached,
  refaktor behawioralnie neutralny). **NOWE `resolveReadoptionColony`** = tylko silny link, ignoruje
  flagę (test „czy MOŻNA adoptować"; BEZ single-in-system — D5: orphan nie łapie się na losową kolonię).
- **`StationSystem._tryAdoptStation`** (Z8a/c): silny link → **czyści `depotDetached`** (symetrycznie do
  osierocenia) + re-stampuje `ownerColonyId` + drenuje lokalny depot → magazyn matki (idempotentnie).
- **Dwa triggery adopcji** (Z8b):
  - NA ŻYWO — subskrybent `colony:founded`/`outpost:founded` → sweep detached stacji gracza
    (`_onColonyFounded`). Gracz NIE robi F5; UI odświeża się live (label z `station.depotDetached`).
  - PRZY RESTORE — `_normalizeAndDrainDepot` dla detached próbuje `_tryAdoptStation` (matka wróciła
    przed reloadem). Brak silnego linku → zostaje sierotą (regresja „orphan bez kolonii" zachowana).
- **D5 nienaruszone**: passive `resolveHomeColony` nadal zwraca null dla detached (żadnego
  auto-re-motheringu przy zwykłym resolve); rodzeństwo w systemie NIE adoptuje orphana (brak
  single-in-system w adopcji). Test 6 drain_orphan + nowa sekcja 8 to potwierdzają.

## Pliki dotknięte
| Plik | Zmiana |
|------|--------|
| `src/systems/FactorySystem.js` | `_onTick` + `dispose()` + orphan-guard w `_update` |
| `src/systems/ResourceSystem.js` | `_onTick` + `dispose()` |
| `src/systems/CivilizationSystem.js` | `_onTick` + `dispose()` |
| `src/systems/BuildingSystem.js` | `_onTick` (multi-line) + `dispose()` |
| `src/systems/ProsperitySystem.js` | `_onTick` + `dispose()` |
| `src/systems/ColonyManager.js` | `removeColony` woła dispose 5 systemów + backlog note (:654) |
| `src/systems/CivilianTradeSystem.js` | `getTradeCapacity` → LIVE `_allocateTC` (Z7) |
| `src/scenes/GameScene.js` | `stationFillDepot` log (Z6) + `tradeCapacityBreakdown` licznik (T5) |
| `src/utils/TransferStore.js` | `_strictMotherLink` + `resolveReadoptionColony` (Z8) |
| `src/systems/StationSystem.js` | `_tryAdoptStation` + `_onColonyFounded` + restore-adopcja (Z8) |
| `src/testing/smoke/s34c_z4_dispose_orphan_smoke.mjs` | NEW — dispose + orphan (14/14) |
| `src/testing/smoke/s34c_z8_readoption_smoke.mjs` | NEW — pełny cykl osierocenie↔adopcja (24/24) |
| `src/testing/smoke/s34c_z1_tradecap_diagnosis_smoke.mjs` | update pod Z7 (12/12) |
| `src/testing/smoke/s34c_drain_orphan_smoke.mjs` | update pod Z8 (test 7 adopcja + nowa sekcja 8) (33/33) |

## Weryfikacja
- Smoke NEW `s34c_z4_dispose_orphan` **14/14** · NEW `s34c_z8_readoption` **24/24** ·
  updated `s34c_z1` **12/12** · updated `s34c_drain_orphan` **33/33**.
- Regresja s34c*: proxy 28 · trade_selfcargo 14 · ui_i18n 9 · z3 9 — **0 FAIL**.
- Regresja szersza: s3_4 44 · s3_5a_1 43 · s3_5b 51 · s34_faza3 47 · s34_faza4 80 · faza6 18 —
  auto-expander 75 · empire-strategy 83 — **0 FAIL**.

## STOP — WSPÓLNY Live-gate (Filip, bez reloadu!)
1. `destroyColony` → **czysta konsola** (ZERO warnów per-frame) + **FPS przywrócony** (Z4/Z5).
2. **T7 na żywo**: sierota → fillDepot lokalny → NOWA kolonia na tym samym ciele → **adopcja NA ŻYWO**
   (depot wspólny, flaga „Odcięta" znika, drain wykonany) → idempotencja; potem opcjonalnie F5 → stan trwały.
3. **T8**.
Po pozytywnym WSPÓLNYM reteście: commity atomowe (Z4/Z5 · Z6/Z7/T5 · **Z8**) + update CLAUDE.md/memory.
