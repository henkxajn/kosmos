# IKONA STATKU NA MAPIE GALAKTYKI — Finding 110 (save v101 bez migracji)

> **Status:** ✅ **PODPISANY 2026-08-27 (S1=W2, S2-S7=W1), WYKONANY, live-gate 7/7 PASS — ZAMKNIĘTY.**
> Wariant **(c)** podpisany przez właściciela 2026-08-27.
> **Rejestr macierzysty:** `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §110.
> **Audyt wejściowy:** `docs/audit/STRATCOM_110_159_160_AUDIT.md` §1 (pomiar wykonany PRZED planem).
> **Poprzedniki:** `STRATCOM_CONTROL_PLAN.md` (108 + 109) · `OVERLAY_TAB_ENTRY_PLAN.md` (160).

---

## 1. Jedno zdanie

Ikona własnego statku rysuje się **13 px nad gwiazdą**, a strefa klikalna sięga tylko 11 px w górę
— więc ikona wygląda na klikalną, nie jest, a klik w nią jest **cicho połykany**.

---

## 2. Co ustalił pomiar (skrót; pełne liczby w audycie §1)

- **Środek ikony nie leży w strefie NIGDY** — także przy jednym statku (81 % ikony poza strefą).
- **Martwy pas jest też POZIOMY**: wachlarz rozsuwa ikony o ±22,5 px przy półszerokości strefy 11
  ⇒ skrajne ikony sześciostatkowego wachlarza mają z gwiazdą **0 %** wspólnego pola.
- **Ikony w tranzycie warp** (`starS: null`, rysowane między gwiazdami) nie mają w pobliżu **żadnej**
  strefy — to nie „ciasna strefa", to jej brak. **To jest powód, dla którego (c) jest jedynym
  spójnym wariantem.**
- Klik w ikonę: `handleClick` zwraca `true`, `_handleHit` nie wołane (fallback pustego obszaru jest
  bramkowany na `_activeTab === 'tactical'`, więc na Stratcomie nie ma nawet deselekcji).

### ⚠ Zysk, którego nie było w rejestrze

Lewa lista statków warp ma `if (ry + rowH > maxY) break;` (`:6613`, komentarz „MVP: limit
widocznych (scroll = follow-up)") ⇒ **statki poza widocznymi wierszami są dziś niewybieralne
w ogóle**. Po tej naprawie ikona na mapie staje się dla nich jedyną drogą — to nie tylko naprawa
martwego klika, ale domknięcie luki w sterowaniu flotą warp.

---

## 3. ⚠ SPROSTOWANIE do audytu §1.5 — wariant (c) NIE wymaga jawnej kotwicy

Audyt (i moje wcześniejsze zdanie) mówił: „kotwica celowania musi być JAWNA w `zone.data`".
**To było prawdziwe dla naprawy proponowanej w rejestrze** (rozciągnięcie strefy `cluster_star`),
bo rozciągnięcie przesuwa środek strefy i psuje `pickStarZone`.

**Wariant (c) nie rozciąga niczego** — ikona dostaje WŁASNĄ strefę innego typu, a strefa gwiazdy
zostaje symetryczna 22×22, więc `z.x + z.w/2` **nadal równa się** środkowi glifu. Kanon 109 jest
nietknięty i jawna kotwica byłaby dziś no-opem.

⚠ Ale ta poprawność jest **przypadkowa — wynika z symetrii**, nie z kontraktu. Stąd decyzja **S1**.

---

## 4. Decyzje do podpisu

| # | pytanie | warianty | rekomendacja |
|---|---|---|---|
| **S1** | jawna kotwica `zone.data.cx/cy` | **W1** dodać teraz · **W2** nie dodawać, ale postawić **TRIPWIRE** w keeperze · **W3** nic | **W2** |
| **S2** | typ strefy ikony | **W1** reuse `warp_ship_select` · **W2** nowy typ + nowy `case` | **W1** |
| **S3** | geometria strefy ikony | **W1** 9 × 12 px (szer. = krok wachlarza) · **W2** wyższa 9 × 16 (wygodniej, więcej zachodzenia) | **W1** |
| **S4** | cull widoczności dla stref ikon | **W1** obowiązkowy, ta sama bramka co gwiazdy · **W2** bez culla | **W1** |
| **S5** | ikona w tranzycie dostaje strefę | **W1** tak · **W2** nie | **W1** |
| **S6** | licznik „+N" (nadmiar wachlarza) | **W1** bez strefy · **W2** strefa otwierająca listę | **W1** |
| **S7** | podświetlenie ikony na hover | **W1** bez zmian (follow-up) · **W2** dorobić teraz | **W1** |

### Uzasadnienia tam, gdzie wybór nie jest oczywisty

**S1 — dlaczego TRIPWIRE zamiast kotwicy.** Kotwica dziś niczego nie naprawia (§3), więc dodanie jej
to zmiana kanonu bez defektu — a kanon jest pinowany przez dwa keepery. Tańsze i skuteczniejsze:
keeper asertuje **„środek strefy `cluster_star` == środek glifu"**, więc pierwsza osoba, która
spróbuje rozciągnąć strefę (naturalny odruch przy 110!), **dostaje czerwień z instrukcją**, zamiast
po cichu cofnąć 109. Zmierzone, że kotwica działa, gdyby była potrzebna: przy rozciągniętej strefie
jawna kotwica daje 4/4 poprawnych tam, gdzie bez niej są 2 przewroty — wynik wklejony do keepera
jako komentarz, żeby następny nie musiał tego mierzyć od zera.

**S2 — dlaczego reuse.** `case 'warp_ship_select'` (`:2303`) robi dokładnie to, czego chcemy —
toggle `_selectedWarpShipId` — i jest tym samym zachowaniem co wiersz listy po lewej. Zero nowego
dispatchu, zero rozjazdu semantyki „zaznacz statek" między dwoma wejściami.

**S3 — dlaczego akurat 9 × 12.** Szerokość = `STRATCOM_FAN_STEP` ⇒ strefy ikon **kafelkują** wachlarz
i **nie nachodzą na siebie** (zmierzone: 0 par nachodzących dla floty 2/3/6). To świadome unikanie
powtórki 109: gdybyśmy dali strefy szersze od kroku, potrzebowalibyśmy `pickShipZone` z tie-breakiem,
czyli dokładnie tej dwuznaczności, którą poprzedni slice usuwał. Cena: strefa jest mała (ikona ma
7 × 8). W2 (wysokość 16) kupuje wygodę za większe zachodzenie na gwiazdę — **do rozważenia, jeśli
live-gate §2 okaże się dłubaniną**.

**S4 — dlaczego cull jest OBOWIĄZKOWY, nie kosmetyczny.** `ctx.clip()` w `_drawStratcomGalaxy`
(`:5947`) przycina **RYSOWANIE**, ale `_hitZones` to zwykłe prostokąty — **clip ich nie dotyczy**.
Pętla gwiazd ma jawny cull (`if (sx < x-20 || sx > x+w+20 …) continue`) i **dlatego** strefy gwiazd
nigdy nie uciekają poza mapę; pętla blipów culla **nie ma**, bo dotąd tylko rysowała. Bez dołożenia
culla strefa ikony statku z układu poza kadrem wylądowałaby **nad lewą listą statków warp** — a że
lista jest rysowana WCZEŚNIEJ, phantom pushowany PÓŹNIEJ **wygrałby** `topMostZoneAt` i klik
w wiersz listy zaznaczałby inny statek. To defekt, który sami byśmy wprowadzili.

---

## 5. Kształt naprawy (przy rekomendowanych wariantach)

Jedno miejsce: pętla `for (const e of ownBlips)` w `_drawStratcomGalaxy` (`:6112-6115`). Po
narysowaniu ikony pushujemy strefę `warp_ship_select` o środku **tam, gdzie realnie stanęła ikona**
(czyli `sx + dx`, `sy + dy` — te same offsety, którymi liczy `_drawStratcomOwnBlip`), pod tym samym
cullem widoczności co gwiazdy i pod tą samą bramką `isBig`.

⚠ Offsety wachlarza liczy dziś **wnętrze** `_drawStratcomOwnBlip`, a pętla ich nie zna. Do
rozstrzygnięcia w implementacji: albo `_drawStratcomOwnBlip` **zwraca** faktyczny punkt ikony (albo
`null` dla licznika „+N"), albo pętla liczy offset drugi raz. **Preferowane: zwracać** — dwa
niezależne rachunki tej samej geometrii to zaproszenie do rozjazdu (dokładnie ta klasa, którą
109 naprawiało).

Kolejność pushu jest już poprawna z konstrukcji: pętla blipów biegnie PO pętli gwiazd, więc ikona
jest wierzchnia — tak jak jest **rysowana**.

**Zero** zmian w `StratcomHitLogic` (S1=W2). **Zero** migracji (v101). **Zero** nowych kluczy i18n.

### Zmierzone skutki uboczne (zaakceptowane)

- Strefa ikony zabiera **3,5 px (16 %)** z góry strefy gwiazdy, i tylko w kolumnie wachlarza. W tym
  paśmie ikona jest **narysowana**, więc jej wygrana jest wizualnie poprawna.
- Hover w tym paśmie przestaje podświetlać gwiazdę. Dotąd był tam martwy obszar bez hovera dla
  większości wysokości ikony — netto bez regresji.

---

## 6. Keeper — `src/testing/smoke/stratcom_ship_icon_smoke.mjs`

Wykonaniowy (atrapa `ctx` rejestrująca realne współrzędne rysowania + `resolveStratcomZone`).

| # | pin | oczekiwane fail-first |
|---|---|---|
| **T1** | klik w ikonę (flota 1) → `warp_ship_select` z właściwym `vesselId` | **FAIL** (dziś BRAK) |
| **T2** | klik w **każdą** z 6 ikon wachlarza → **ta** ikona, 6/6 | **FAIL** (skrajne 0 % pokrycia) |
| **T3** | ikona w tranzycie warp → `warp_ship_select` | **FAIL** (dziś brak strefy) |
| **T4** | klik w gwiazdę dalej `cluster_star` (strażnik) | pass |
| **T5** | absorber `warp_order_bg` **nadal bije** ikonę + kontrola pinu (bez absorbera trafia ikonę) | pass po naprawie |
| **T6** | strefy ikon w wachlarzu **nie nachodzą** (0 par) — pin projektowy S3 | — |
| **T7** | **cull (S4)**: blip poza kadrem mapy **nie** pushuje strefy; kontrola pinu: blip w kadrze pushuje | **FAIL**, jeśli cull pominięty |
| **T8** | **TRIPWIRE (S1)**: środek strefy `cluster_star` == środek glifu, z instrukcją w komunikacie | pass |
| **T9** | regresja 109: `pickStarZone` przy dołożonych strefach ikon wybiera po najbliższym glifie | pass |

### Wynik wykonania

| etap | wynik |
|---|---|
| keeper **fail-first** (kod sprzed naprawy, **finalne piny**) | **21 PASS / 11 FAIL** |
| keeper po naprawie | **32 / 32** |
| sweep `run-all.mjs` | **180/180 OK, 0 FAIL** (179 + nowy keeper) |
| `check-i18n` | **PASS** (zero nowych kluczy) |
| regresja 108 · 109 · 160 · warp-stratcom | **14/14** · **10/10** · **28/28** · **43/43** |

⚠ Fail-first zmierzony **po** korekcie pinów, przez `git stash` samego kodu gry (keeper jest
untracked, więc został na dysku) — czyli finalne asercje przepuszczono przez kod sprzed naprawy,
a nie przez wersję roboczą. Bez tego „fail-first" opisywałby piny, których już nie ma.

⚠ **DWA PINY PRZECHODZIŁY JAŁOWO w pierwszej wersji keepera** i dlatego pierwszy przebieg pokazał
23/9 zamiast 21/11: `zs.every(...)` oraz pętla par **zwracają `true` na PUSTEJ tablicy**, czyli
świeciły na zielono dokładnie tam, gdzie był defekt (zero stref). Obie asercje wymagają teraz
`zs.length === 6`. To ta sama klasa co „jałowa kontrola pinu = fałszywa zieleń".

⚠ **Dwie porażki po naprawie okazały się błędem TESTU, nie kodu:** trójkąt statku rysuje się
**niesymetrycznie** względem punktu kotwiczenia (wierzchołek −4,5, podstawa +3,5), więc środek jego
bboxa leży dokładnie **0,5 px nad** kotwicą. Ostra równość `at.y === drawn.y` była więc pinem
nieprawdziwym. Zastąpiona tolerancją ≤ 1 px z nazwaną przyczyną — realny rozjazd, którego ten pin
pilnuje (zły indeks wachlarza), ma skalę **kroku wachlarza = 9 px**, więc tolerancja go nie
przepuści.

---

## 7. Live-gate (właściciel)

1. Układ z **jednym** statkiem warp → klik w ikonę nad gwiazdą ⇒ statek **zaznaczony** (pulsujący
   marker), a klik w gwiazdę otwiera panel rozkazu dla niego.
2. Układ z **kilkoma** statkami → klik w konkretną ikonę wachlarza ⇒ zaznacza **tę**, nie sąsiednią.
   ⚠ Jeśli trafianie okaże się dłubaniną — to sygnał do S3=W2 (wyższa strefa), zgłoś zamiast męczyć się.
3. Statek **w tranzycie warp** (ikona między gwiazdami) → klik ⇒ zaznaczony. **Dziś niemożliwe.**
4. Klik w gwiazdę dalej wybiera układ; hover i klik dalej wskazują **ten sam** układ (regresja 109).
5. Z otwartym panelem rozkazu: klik w obszar panelu, pod którym leży ikona ⇒ **panel**, nie statek.
6. Ponowny klik w tę samą ikonę ⇒ **odznacza** (toggle jak w liście po lewej).
7. Zero błędów w konsoli.

---

### Wynik live-gate (właściciel, 2026-08-27) — **7/7 PASS**

Wszystkie siedem kroków potwierdzone na żywo, konsola czysta.

✅ **S3 ZWALIDOWANY — knob zostaje na W1.** Krok 2 (trafianie w konkretną ikonę wachlarza) działał
dobrze **bez** przechodzenia na wyższą strefę (W2). Strefa 9 × 12 px jest wystarczająca w realnym
użyciu; wariant W2 zostaje niewykorzystaną furtką, gdyby kiedyś doszły gęstsze wachlarze.
✅ Krok 3 potwierdził zysk niedostępny przed naprawą: **statek w tranzycie warp jest klikalny**.

---

## 8. Świadomie poza zakresem

Podświetlenie ikony na hover (S7) · strefa dla licznika „+N" (S6) · scroll lewej listy statków warp
(`:6613` „MVP: limit widocznych") — po tej naprawie mniej pilny, ale nadal otwarty · jawna kotwica
w `zone.data` (S1=W2 — tripwire zamiast zmiany kanonu) · **Finding 159** (utajony za
`commandTacticalMap: false`).
