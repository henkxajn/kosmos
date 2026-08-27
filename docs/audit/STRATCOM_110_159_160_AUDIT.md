# Audyt: Findingi 110 · 159 · 160 — mapa STRATCOM i wejście w zakładkę

> **Status:** audyt READ-ONLY, wykonany 2026-08-27. Zero zmian w kodzie gry.
> **Rejestr macierzysty:** `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §110, §159, §160.
> **Poprzedni slice tej okolicy:** `docs/design/STRATCOM_CONTROL_PLAN.md` (108 + 109, ZAMKNIĘTE).
> **Werdykt właściciela (2026-08-27):** nie łączymy. Kolejność **160 → 110**. 159 przeklasyfikowane.
> **Decyzja dla 110:** wariant **(c)** — ikona przechwytuje własny klik (wybiera STATEK),
> reszta strefy gwiazdy działa jak dziś (wybiera UKŁAD).

---

## 0. Po co ten audyt

Rejestr niósł trzy findingi opisane jako „ta sama okolica" i pytanie, czy da się je zrobić razem.
Pomiar pokazał, że **każdy ma inny mechanizm, inny rozmiar i inną osiągalność**, a jeden z nich
opisany jest w rejestrze na podstawie przesłanki, która w domyślnej konfiguracji **nie obowiązuje**.
Dodatkowo naprawa 110 zaproponowana w rejestrze **cofnęłaby Finding 109** — i to jest najważniejsze
ustalenie tego audytu.

Wszystkie liczby niżej pochodzą z **wykonania** (probe'y na prototypie `FleetManagerOverlay`
i na kanonie `StratcomHitLogic`, atrapa `ctx` rejestrująca realne współrzędne rysowania), nie
z arytmetyki na stałych. Probe'y żyły poza drzewem repo (scratchpad) — świadomie, żeby nie
przeładować karty gracza przez Live Server (STANDING LESSON z W3).

---

## 1. Finding 110 — zmierzone, **gorsze niż w rejestrze**

### 1.1 Geometria: gdzie ląduje ikona, a gdzie sięga strefa

Gwiazda w (400,300); strefa `cluster_star` `hitR = max(r+5, 11)` ⇒ **x 389…411, y 289…311**.
Ikona rysowana przez `_drawStratcomOwnBlip` → `_drawOwnShipTriangle`.

| flota w układzie | bbox ikony | środek ikony w strefie? | pokrycie strefą |
|---|---|---|---|
| 1 statek | x 396,5…403,5 · y 282,5…290,5 | **NIE** | 19 % |
| 2 statki | dx ±4,5 | **NIE** (2/2) | 19 % · 19 % |
| 3 statki | dx ±9 | **NIE** (3/3) | 15 % · 19 % · 15 % |
| 6 statków | dx ±22,5 | **NIE** (6/6) | **0 %** · 3 % · 19 % · 19 % · 3 % · **0 %** |

**Trzy rzeczy, których rejestr nie miał:**

1. **Środek ikony nie leży w strefie NIGDY** — także przy jednym statku. Rejestr mówił „górna połowa
   ikony leży poza"; realnie poza strefą jest **81 %** ikony (6,5 z 8 px wysokości), a jej środek
   (y = 286,5) jest 2,5 px **nad** górną krawędzią strefy.
2. **Martwy pas jest też POZIOMY.** `_stratcomFanOffset` rozsuwa ikony o ±22,5 px przy
   półszerokości strefy 11 ⇒ skrajne ikony sześciostatkowego wachlarza nie mają z gwiazdą
   **ani jednego wspólnego piksela**. Rejestr opisywał wyłącznie pas pionowy.
3. **Ikony w tranzycie warp są bezdomne.** Wpis blipa z `inTransit: true` ma `starS: null` i rysuje
   się przez `projPt(gx, gy)` w punkcie galaktycznym **pomiędzy** gwiazdami, z `dx = dy = 0`
   (wachlarz pomijany). Tam nie ma żadnej strefy w promieniu — nie chodzi więc o „ciasną strefę",
   tylko o **brak jakiejkolwiek**.

### 1.2 Zachowanie: klik jest połykany

```
klik w (400, 286.5) — środek ikony  → handleClick zwrócił true; trafiona strefa: BRAK
kontrola pinu: klik w (400, 300)    → trafiona strefa: cluster_star
```

Terminalne `return true` (`FleetManagerOverlay:1415`) pochłania klik, a fallback pustego obszaru
(`:1394`) jest bramkowany na `_activeTab === 'tactical'` ⇒ na Stratcomie **nie ma nawet ścieżki
deselekcji**. Gracz nie dostaje żadnego sygnału.

### 1.3 Waga: kto w ogóle jest blipem

`_stratcomOwnShipBlips` odrzuca statek, który nie ma baku warp i nie jest w skoku
(`if (!(v.warpFuel?.max > 0) && !jumping) continue`) ⇒ wachlarz w normalnej grze to **1–3 ikony**,
nie 6. Skrajny przypadek 0 % pokrycia jest realny, ale rzadki; przypadek 19 % — codzienny.

### 1.4 ⚠ USTALENIE GŁÓWNE: naprawa z rejestru cofa Finding 109

Rejestr zapisał: *„naprawa 110 polega na powiększeniu strefy `cluster_star` w górę […] po 109
rozstrzyganie »najbliższy środek« sprawia, że powiększenie stref jest BEZPIECZNIEJSZE niż było"*.

**Zmierzone — jest odwrotnie.** `pickStarZone` liczy odległość do **środka STREFY**
(`cx = z.x + z.w/2`), nie do glifu gwiazdy. Rozciągnięcie strefy w górę o 13 px przesuwa ten środek
o 6,5 px i przewraca odpowiedź dla gwiazd różniących się w osi Y (A w (400,292), B w (404,306)):

| kursor | bliższy GLIF | dziś (22×22) | po „+13 w górę" |
|---|---|---|---|
| (402,296) | sys_A | sys_A | **sys_B** ❌ |
| (402,298) | sys_A | sys_A | **sys_B** ❌ |
| (402,299) | remis (dA = dB) | sys_B | sys_B ✅ (udokumentowany tie-break) |
| (402,300…302) | sys_B | sys_B | sys_B ✅ |

**Dwa realne przewroty + jeden remis** rozstrzygnięty zgodnie z kontraktem `<=` w `pickStarZone`.
Mechanizm: jednakowe przesunięcie obu środków jest równoważne policzeniu wyboru dla kursora
przesuniętego w dół o połowę rozciągnięcia — znosi się tylko wtedy, gdy gwiazdy leżą na tej samej
wysokości (pierwszy, „uspokajający" wariant pomiaru dawał 10/10 zgodnych i **wprowadzał w błąd**).

Do tego rośnie okno nakładania stref:

| wariant | warunek nakładania | pole okna | zmiana |
|---|---|---|---|
| dziś | abs(dx) < 22 ∧ abs(dy) < 22 | 484 px² | — |
| +13 w górę | abs(dx) < 22 ∧ abs(dy) < 35 | 770 px² | **+59 %** |
| +13 w górę i ±22,5 na boki (wachlarz) | abs(dx) < 67 ∧ abs(dy) < 35 | 2345 px² | **+385 %** |

### 1.5 Wniosek konstrukcyjny

Wada nie leży w rozmiarze strefy, tylko w tym, że **kanon 109 wyprowadza kotwicę celowania
z GEOMETRII strefy**. Dopóki strefa jest symetryczna wokół glifu, to przypadkiem działa; każda
zmiana kształtu psuje odpowiedź na pytanie „w którą gwiazdę celuję".

⇒ **Kotwica musi być JAWNA** (niesiona w `zone.data`), a `pickStarZone` ma ją preferować. Dopiero
wtedy strefa może mieć dowolny kształt — także osobny prostokąt na ikonę statku — bez dotykania
109. Dane są na miejscu: wpis blipa niesie i `v` (⇒ `vesselId`), i `starS` (⇒ `systemId`).

⇒ **Kolejność wobec 159 odwraca się względem rejestru:** to 110 zmienia kontrakt kanonu, więc
159 (gdyby kiedyś wracało) musi iść **po** 110, nie obok.

### 1.6 Decyzja właściciela (2026-08-27): wariant (c)

Klik w prostokąt ikony → **wybór STATKU** (`warp_ship_select`); reszta strefy gwiazdy → **wybór
UKŁADU** (`cluster_star`), bez zmian. Uzasadnienie właściciela: to jedyny wariant spójny ze
statkami w tranzycie, które nie mają w pobliżu żadnej strefy gwiazdy.

Warianty odrzucone: **(a)** ikona jako przedłużenie strefy gwiazdy (nie obsługuje tranzytu);
**(b)** cała powiększona strefa wybiera statek (zabiera graczowi wybór układu).

---

## 2. Finding 159 — przesłanka **nie obowiązuje** w domyślnej konfiguracji

Rejestr opisuje 159 jako defekt „GŁÓWNEJ mapy taktycznej". Pomiar źródłowy pokazuje, że ta mapa
w domyślnej grze **nie istnieje**.

`GameConfig.FEATURES`: `commandTacticalMap: false`, `fleetRegistry: true` ⇒ w gałęzi zakładki
taktycznej (`FleetManagerOverlay:737-742`):

```
mapAvailable = (commandTacticalMap === true) || (fleetRegistry !== true)   →  false
if (!mapAvailable && _tacticalView !== 'registry') _tacticalView = 'registry'
useRegistry = true   →  gałąź _drawCenter/_drawCenterMap NIGDY nie biegnie
```

Komentarz w źródle mówi to wprost: *„3g — próba deprecjacji mapy 2D: commandTacticalMap OFF →
REJESTR jest jedyną treścią tactical"*.

**Sześć z siedmiu** producentów `map_body` (gwiazda `:4781`, planetoidy `:4812`, asteroidy `:4822`,
komety `:4832`, księżyce `:4847`, planety `:4868`) żyje właśnie w tej gałęzi ⇒ w normalnej grze
**nie pushują żadnej strefy**.

**Siódmy** (`:5380`) to **Atlas** — wiersz listy `w-2 × ROW_H`, a nie kółko na mapie. Wiersze są
rozłączne, więc „pierwsze trafienie" == „wierzchnie". Co więcej, `atlas_report` jest tam pushowany
NA WIERZCH **celowo**, z komentarzem o reverse-iter — czyli warstwowanie w Atlasie jest
zaprojektowane, nie przypadkowe. A ścieżka tooltipa Atlasu żyje poza overlayem
(`GameScene._tooltipHoverFromFleetAtlas:5494`) i **już dziś iteruje od końca**.

Poboczne: `src/ui/FleetTabPanel.js` też pusha `map_body` (`:1279/1290/1301`) — plik **nie jest
nigdzie importowany** (uśpiony bliźniak, zgodnie z notatką C8 w `CLAUDE.md`).

**⇒ 159 to finding UTAJONY za wyłączoną flagą, na mapie świadomie wygaszanej.** Nie jest pracą do
zaplanowania; jest wpisem do przeklasyfikowania. Gdyby `commandTacticalMap` kiedyś wróciło — 159
wraca na stół, ale **po 110** (patrz §1.5).

---

## 3. Finding 160 — z „nierozstrzygnięte" na **zmierzone i osiągalne**

### 3.1 Mechanizm jest ostrzejszy, niż zapisano

Rejestr mówi „`open({tab})` przypisuje zakładkę z pominięciem `_switchTab`". Prawdziwe, ale to
połowa: **kluczowe jest, że ta ścieżka biegnie na ŻYWYM overlayu, bez `close()`**.

`OverlayManager.handleKey` (`:75-80`):

```
if (this.active === id) {
  if (isObj && Object.keys(opts).length > 0) {
    this._showOverlay(this.overlays[id], opts);   // ← BEZ _hideOverlay
    return true;
  }
  this._hideOverlay(...);
}
```

`FleetManagerOverlay` nie ma `show()`, więc `_showOverlay` woła `open(opts)`. W `open()` są **trzy**
przypisania `_activeTab` (`:512` z `opts.tab`, `:517` przy `focusSection`, `:529` przy
`view === 'registry'`) i **żadne** nie przechodzi przez `_switchTab`. `close()` też nie biegnie.

### 3.2 Zmierzony wyciek

```
gracz na zakładce LOGISTYKA z otwartym polem ilości, wciska M/G:
  _activeTab            = stratcom
  input NADAL w DOM     = true        ← osierocony <input> nad mapą galaktyki
  _logiQtyInput trzymany= true
  _logiGoodDropdownOpen = true        ← drop-down przeżył zmianę zakładki
  _logiColDropdown      = from

KONTROLA PINU — ta sama zmiana przez _switchTab:  input w DOM = false, dropdown = false
KONTROLA PINU — ścieżka Esc (close()):            input w DOM = false
```

### 3.3 ⚠ Osiągalność różni się per input — i to jest sedno

| pole DOM | handler `blur` | skutek |
|---|---|---|
| ilość towaru (Logistyka), `:1089` | **JEST** (`blur → commit → _closeLogiQtyInput`) | samo się leczy; a póki ma fokus, jego `keydown` robi `stopPropagation`, więc `M` i tak nie dotrze do gry ⇒ **w praktyce nieosiągalne** |
| wyszukiwarka Rejestru, `:4366-4393` | **BRAK** (celowo — fraza ma przeżyć przeglądanie listy) | gracz wpisuje frazę → klika na kanwę (input zostaje, fokus schodzi) → wciska `M` → `_closeRegistrySearch()` nie biegnie ⇒ **pole tekstowe zostaje nad mapą galaktyki. OSIĄGALNE.** |

Zmierzone dla Rejestru: `ma handler blur? false`, po `open({tab:'stratcom'})` → `input NADAL
w DOM = true`; obie kontrole pinu (`_switchTab`, `close()`) czyste.

**⚠ Granica dowodu:** semantykę fokusu (kto połyka `keydown`) ustaliłem **czytaniem kodu**, nie
w przeglądarce. Sam wyciek jest zmierzony wykonaniem. Nie nazywać całości „zweryfikowaną na żywo"
przed gate'em.

### 3.4 Producenci — zbiór jest WĘŻSZY, niż wyglądał

Wszystkie wejścia otwierające `fleet` z opcjami:

| wejście | opts | biegnie przy OTWARTYM overlayu? |
|---|---|---|
| `handleKey` klawisz `g` / `m` | `{tab:'stratcom'}` | **TAK** — gałąź re-show |
| `handleKey` klawisz `k` | `{focusSection:'wreck'}` | **TAK** — gałąź re-show |
| `handleKey` klawisz `f` | `{}` (string w keymapie) | nie — pusty `opts` ⇒ `_hideOverlay` (toggle) |
| `Outliner:732/736` → `openPanel('fleet')` | brak | tak, ale **bez `opts.tab`** ⇒ `_activeTab` nietknięty ⇒ brak wycieku |
| `TacticalDock:671` → `openPanel('fleet', {view:'registry', focusVesselId})` | jest | **NIE** — `UIManager:1724` bramkuje klik doku na `!overlayManager.isAnyOpen()` |

⇒ Realni producenci to dokładnie **`g`, `m`, `k`**. Wszystkie trzy to jedyne wpisy keymapy w formie
`{id, opts}` i **wszystkie trzy celują w `fleet`** — klasa jest zamknięta w jednym overlayu.

⚠ Odnotowane przy okazji: Outliner **jest klikalny przy otwartym overlayu** (`UIManager:1715` nie
ma bramki `isAnyOpen`), w odróżnieniu od Doku taktycznego. Dziś nieszkodliwe (woła `openPanel`
bez opcji), ale to furtka do zapamiętania — gdyby ktoś dodał tam `opts.tab`, wyciek wróci.

---

## 4. Dlaczego nie łączymy (uzasadnienie werdyktu)

**110 + 159** — inny mechanizm (geometria strefy vs. kierunek pętli), inna zakładka, a przede
wszystkim **gate 159 jest nieuruchamialny w domyślnej konfiguracji**: krok live-gate'u brzmiałby
„przełącz świadomie wygaszaną flagę". To rozmycie gate'u. Do tego kolejność biegnie w złą stronę
(§1.5).

**110 + 160** — ten sam plik i tyle. Zero wspólnego kodu, zero wspólnej powierzchni ryzyka: jedno
to geometria kanwy i kanon rozstrzygania trafień, drugie to cykl życia overlaya i sprzątanie DOM.
Wspólny gate zlepiłby dwa niezależne zestawy kroków bez żadnego zysku.

---

## 5. Stan po audycie

| finding | status | dalej |
|---|---|---|
| **110** | otwarty, zmierzony, decyzja **(c)** podjęta | slice **drugi**; wymaga zmiany kontraktu kotwicy w `StratcomHitLogic` |
| **159** | **PRZEKLASYFIKOWANY** — utajony za `commandTacticalMap: false` | nie planować; wraca tylko z flagą, i **po 110** |
| **160** | otwarty, zmierzony, osiągalny przez wyszukiwarkę Rejestru | slice **pierwszy** |

Kolejność zatwierdzona przez właściciela: **160 → 110**.
