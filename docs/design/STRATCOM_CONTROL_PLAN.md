# STEROWANIE MAPĄ STRATCOM — Findingi 108 + 109 (save v101 bez migracji)

> **Status:** PODPISANY 2026-08-27 (E1-E5 = W1), WYKONANY. Slice przekrojowy.
> **Rejestr macierzysty findingów:** `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §108-110.
> Tu mieszka wyłącznie kształt naprawy, pomiar i gate.

---

## 1. Jedno zdanie

Mapa galaktyki **wybierała inny układ, niż podświetlała** (109), a tryb rozkazu warp **odcinał
jedyne wejście do widoku układu i nie dawał się rozbroić** (108) — dwa niezależne mechanizmy, które
razem odbierały graczowi sterowanie mapą.

---

## 2. Pomiar wejściowy (przed kodem)

### 2.1 Finding 109 — dwie przeciwne reguły w jednym pliku

| ścieżka | reguła | wygrywa |
|---|---|---|
| klik `:1383` | `for (let i = length-1; i >= 0; i--)` | **ostatnia** pushowana |
| hover `:1722` | `for (const z of this._hitZones)` | **pierwsza** pushowana |

`_stratcomVisibleSystems` sortuje rosnąco po `d2` (`:5506`) ⇒ push idzie **od najbliższych**.
Strefy `cluster_star` mają 22×22 px przy promieniu glifu ≤ 7 (`hitR = max(r+5, 11)`, `:6083`), więc
nakładają się także wtedy, gdy **glify wcale się nie stykają**.

**Zmierzone keeperem fail-first** (para nakładających się gwiazd, kursor raz bliżej jednej, raz
bliżej drugiej): klik **zawsze** `sys_B`, hover **zawsze** `sys_A`, **niezależnie od tego, która
jest bliżej**. To odtwarza determinizm 15/15 zaobserwowany w grze.

⚠ **Wniosek, którego nie było w rejestrze: to KLIK miał rację, nie hover** — rysowanie idzie w tej
samej kolejności co push, więc „ostatnia pushowana" znaczy „namalowana na wierzchu". Ale **żadne
z nich nie miało racji do końca**: przy strefach dużo większych od glifów pytanie gracza brzmi
„w którą gwiazdę celuję", a odpowiedzią jest **najbliższy środek**, nie kolejność malowania.

### 2.2 Finding 108 — ucieczki są WĘŻSZE, niż zapisano

Mechanizm potwierdzony: `:6103` rysuje panel warp **zamiast** panelu systemu, a `cluster_switch`
żyje wyłącznie w tym drugim (`:6303`, bramka `explored && sysReg`).

| ścieżka | resetuje `_selectedWarpShipId`? |
|---|---|
| `_switchTab('stratcom')` `:609` | ✅ — ale tylko przy realnej ZMIANIE zakładki (`:587` early-return) |
| `_close()` | ❌ **NIE** — zerował `_selectedClusterSystem` i `_pendingSendSystemId`, czyli **dwóch z czterech** członków rodziny |
| `open({tab})` `:511` | ❌ **NIE** — przypisuje `this._activeTab` **wprost**, z pominięciem `_switchTab` |

⇒ **Esc + `M`/`G` NIE odblokowywało.** Pułapka przeżywała zamknięcie overlaya. Rejestr podawał
„wyjście i powrót do zakładki" jako ucieczkę — działa tylko przez pasek zakładek.

✅ Odnotowana przy okazji **druga furtka**, której rejestr nie miał: `cluster_switch` ma drugiego
producenta (`:7395`) w panelu „Interstellar Arrival" — wąska (statek świeżo po skoku), ale istnieje.

---

## 3. Decyzje (podpisane 2026-08-27)

| # | decyzja | wybór |
|---|---|---|
| **E1** | 108: wszystkie trzy dopięcia (a Anuluj rozbraja · b przycisk w panelu warp · c parytet rodziny w `_close`) | **W1** |
| **E2** | `warp_order_send` **nie** rozbraja — marker zostaje świadomie | **W1** |
| **E3** | 109: rozstrzygacz jako **doprecyzowanie zwycięzcy**, NIE pre-pass | **W1** |
| **E4** | hover świadomy absorberów **dla gwiazd**; `map_body` nietknięty | **W1** |
| **E5** | kolejność: **109 → 108 → docs** | **W1** |

---

## 4. Kształt naprawy

### 109 — NEW `src/ui/StratcomHitLogic.js` (czysty, zero importów)

**DWIE reguły, nie jedna** — i to jest cała subtelność:

```
topMostZoneAt(zones, mx, my)   → KTO wygrywa między WARSTWAMI (panel vs mapa). Kolejność
                                  malowania. Ta reguła CHRONI ABSORBERY.
pickStarZone(zones, mx, my)    → KTÓRA gwiazda, gdy warstwa gwiazd już wygrała. Najbliższy
                                  środek; remis → później pushowana (spójnie z warstwami).
resolveStratcomZone(...)       → złożenie obu; JEDNO źródło dla klika i hovera.
```

⚠ **Dlaczego NIE pre-pass** (Z1, decyzja E3): w pliku stoi kuszący wzór — celowany pre-pass przed
pętlą ogólną (`:1369`, priorytet ciała nad statkiem). Dla gwiazd przebiłby on `warp_order_bg`,
absorber istniejący po to, żeby klik w panel rozkazu **nie przelatywał** na gwiazdy pod spodem.
Rozstrzygacz jest więc **doprecyzowaniem zwycięzcy**: pętla wyłania strefę wierzchnią i dopiero
gdy jest nią `cluster_star`, wybieramy spośród gwiazd.

Hover dostaje tę samą funkcję ⇒ przy okazji przestaje podświetlać gwiazdy **pod panelem**.
`map_body` zostaje pierwszo-trafieniowy (E4) — ta sama klasa, ale niemierzona i na głównej mapie
taktycznej (Finding 159).

### 108 — trzy dopięcia, każde na inną drogę do pułapki

| # | zmiana | co zamyka |
|---|---|---|
| **a** | `warp_order_cancel` czyści też `_selectedWarpShipId` | „Anuluj" znaczy *rozbrój tryb*, nie *zapomnij gwiazdę* |
| **b** | `cluster_switch` **także** w `_drawWarpOrderPanel`, bramka **skopiowana** `explored && sysReg` | wejście do układu **nigdy nie znika** |
| **c** | `_close()` zeruje `_selectedWarpShipId` + `_warpShipScrollY` | Esc + `M` przestaje przenosić uzbrojony tryb |

⚠ **Bramka skopiowana, nie wymyślona (Z4):** panel rozkazu bywa otwarty na układzie **niezbadanym**
— po to się tam wysyła statek — a wtedy nie ma dokąd wchodzić. Keeper pinuje obie strony.

Zero nowych kluczy i18n (`fleet.clusterSwitch` już istnieje), zero migracji.

---

## 5. Wykonanie i dowód

⚠ **`FleetManagerOverlay` IMPORTUJE SIĘ pod node** (zweryfikowane wykonaniem), a `handleClick`
i `handleMouseMove` są na prototypie ⇒ **oba findingi pinowane WYKONANIEM**, nie źródłowo. Dla
warstwy UI w tym repo to rzadkość — zwykle zostaje pin źródłowy albo live-gate.

| keeper | fail-first | po naprawie |
|---|---|---|
| `stratcom_star_pick_smoke` (109) | **4 PASS / 6 FAIL** | **10/10** |
| `stratcom_warp_trap_smoke` (108) | **9 PASS / 5 FAIL** | **14/14** |

Sweep **178/178 OK, 0 FAIL** · `check-i18n` PASS (pl=en=3279, bez nowych kluczy).

**Konstrukcja pinów, które nie dają się zdać przypadkiem:**
- 109 T2 ma **dwa** przypadki o **różnych** poprawnych odpowiedziach (raz wygrywa pierwsza strefa,
  raz druga) + asercję, że te odpowiedzi są różne ⇒ „naprawa przez odwrócenie pętli" zdałaby
  połowę i padła na drugiej.
- 109 T3 (absorber) **przechodził już przed naprawą** — to strażnik regresji, nie cel; ma własną
  kontrolę pinu (bez absorbera ten sam klik trafia gwiazdę).
- 108 T3/T4 jadą **prawdziwą ścieżką rysującą** na atrapie `ctx` (wzór `zero_colony_panels`),
  z kontrolą pinu „panel realnie się narysował" — inaczej brak przycisku mylił by się z brakiem
  rysowania.
- 108 T5 pinuje **decyzję E2** (Wyślij nie rozbraja), żeby nikt tego nie „naprawił".

---

## 6. Gate (live, właściciel)

1. **§1 (109)** — Stratcom, dwie blisko siebie leżące gwiazdy: **kursor podświetla tę samą
   gwiazdę, którą wybiera klik**. Sprawdzić na kilku parach, także przy przesuwaniu kursora między
   nimi (podświetlenie ma „przeskakiwać" w połowie odległości, nie trzymać się jednej).
2. **§2 (109/E4)** — z otwartym panelem rozkazu warp: najedź na obszar panelu, pod którym leży
   gwiazda ⇒ **żadna gwiazda się nie podświetla**, a klik trafia w panel.
3. **§3 (108b)** — zaznacz statek warp, kliknij **zbadany** układ ⇒ panel rozkazu ma przycisk
   **„Przełącz widok"** i on działa.
4. **§4 (108b/Z4)** — to samo na układzie **niezbadanym** ⇒ przycisku **nie ma** (i tak ma być).
5. **§5 (108a)** — „Anuluj" ⇒ kolejny klik gwiazdy pokazuje **panel systemu**, nie panel rozkazu.
6. **§6 (108c)** — zaznacz statek warp, **Esc**, potem **M** ⇒ tryb rozkazu **nie jest** uzbrojony.

---

## 7. Findings filed (rejestr macierzysty)

- **159** — `map_body` ma **tę samą** asymetrię klik/hover i jest ślepy na absorbery; niezmierzone,
  dotyczy głównej mapy taktycznej ⇒ własny podpis. Kanon `StratcomHitLogic` jest gotowy do reużycia.
- **160** — `open({tab})` (`:511`) przypisuje zakładkę **z pominięciem `_switchTab`**, więc żaden
  reset wejścia w zakładkę nie biegnie na ścieżce `G`/`M`. Dla 108 to była połowa mechanizmu;
  dla pozostałych zakładek **nierozstrzygnięte**, czy coś jeszcze wycieka.

---

## 8. Świadomie poza zakresem

**Finding 110** (ikona statku w martwym pasie nad gwiazdą) — ⚠ **kolejność ma znaczenie**: 110
naprawia się przez **powiększenie** strefy `cluster_star` w górę, co **zwiększyłoby nakładanie**
i pogorszyło dwuznaczność z 109. Dlatego 109 musiało iść pierwsze; ta naprawa nie rusza 110
w żadną stronę. · `map_body` (159) · audyt pozostałych zakładek pod kątem 160.
