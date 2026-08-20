# AUDYT — trzecia ścieżka kolonizacji: przybycie WARPEM do obcego układu

**Data:** 2026-08-20 · **Zakres:** read-only. **Zero zmian w kodzie.**
**Powód:** wskazówka właściciela z pamięci wcześniejszej sesji — statek z kolonistami wysłany **warpem
do INNEGO układu**, po przybyciu skierowany na ciało, **dawał przycisk Colonize** bez formalnej akcji
`colonize` na starcie. Poprzedni audyt (`COLONIZE_PATH_ZERO_COLONY_AUDIT.md`) sprawdził tylko misję
formalną i `moveToPoint` w tym samym układzie (który **nie działa**).
**Metoda:** odczyt + **wykonanie headless** (`GameCore`) + kontrprzebieg adwersarialny (6 agentów,
3 przekroje; zero refutacji). ⚠ Weryfikator **przepuścił cały łańcuch przez produkcyjną fabrykę**
`VesselManager.createAndRegister` i przez **prawdziwe** `_drawRight`/`_handleHit`, więc żaden stan
nie był konstruowany ręcznie. Gra NIE była uruchamiana.
**Numeracja findingów:** ciągła po 101 ⇒ **od 102**.

---

## WERDYKT (na początku)

> ✅ **WŁAŚCICIEL PAMIĘTA POPRAWNIE. To jest realna, DZIAŁAJĄCA trzecia ścieżka — i działa przy
> ZERZE kolonii gracza.** Nie jest to inna wersja gry ani mechanizm sprzed zmian.
>
> **Zmierzone end-to-end przy zerze kolonii, przez prawdziwe `_drawRight` i `_handleHit`:**
> powstaje **realna kolonia gracza** (`isPlayerColony: true`, pop 8, siatka, 3 budynki) i **statek
> zostaje skonsumowany**. Liczba kolonii **nie jest terminem nigdzie na tej trasie** — przy 1 i przy
> 0 koloniach wszystkie predykaty wychodzą identycznie.
>
> ⇒ **Dobra wiadomość dla D9 Scenariusza A:** istnieje żywa ścieżka odbudowy imperium, znaleziona
> przez gracza, która nie wymaga posiadania ani jednej kolonii.

⚠ Ale ta sama trasa niesie **dwie rzeczy, których nikt nie zamawiał**, obie zmierzone:

> 🔴 **Ta ścieżka NIE zwalnia załogi statku — POPy zostają zablokowane NA ZAWSZE.**
> Kolonizacja „obca" usuwa statek przez `this._vessels.delete(vesselId)` (`VesselManager.js:3246`)
> **zamiast** przez `destroyVessel`, więc omija `_settleCrewOnLoss`/`releaseCrew`.
> **Zmierzone:** kontrolne `destroyVessel` przestawia `_lockedPerStrata` z `{laborer:0.4}` na
> `{laborer:0}`; ta ścieżka zostawia `{laborer:0.4}` **na statku, którego już nie ma**. ⇒ **Finding 102.**
>
> 🟠 **Przekierowanie po warpie omija bramkowanie startu.** `_redirectInterstellarVessel` (`:2839`)
> nie ma **żadnej** bramki portu ani odrzucenia przy braku paliwa (paliwo jest **klampowane do zera**,
> nie sprawdzane), podczas gdy zwykła ścieżka `MovementOrderSystem.issueOrder` odrzuciła ten sam
> statek z `no_spaceport_at_origin` (zmierzone). ⇒ **Finding 103.**

---

## 1. DLACZEGO WARP DZIAŁA, A `moveToPoint` NIE — różnica jest jedna i konkretna

**Przybycie warpem NIE kasuje misji. `moveToPoint` ją kasuje.** To cała tajemnica.

| | **warp (`interstellar_jump`)** | **`moveToPoint` w tym samym układzie** |
|---|---|---|
| `mission` po przylocie | **ZOSTAJE**, `type='interstellar_jump'`, `phase='in_system'` | **`null`** (`MovementOrderSystem.js:1859`) |
| `status` | `on_mission` | `idle` |
| `position.state` | `orbiting` | `orbiting` |
| `dockedAt` | `null` (wolna przestrzeń, nie orbita gwiazdy) | id ciała |
| panel z przyciskiem (`FMO:7405`) | **osiągalny** (przez przekierowanie, §2) | **niemożliwy** — brak misji |

```
VesselManager.js:2622-2628   vessel.systemId = m.toSystemId;
                             vessel.position.state = 'orbiting';
                             vessel.position.dockedAt = null;   // nie orbituje gwiazdy — wolna przestrzeń
                             vessel.status = 'on_mission';      // nadal na misji — gracz musi zdecydować co dalej
                             m.phase = 'in_system';
```

Komentarz w kodzie mówi to wprost: „*nadal na misji — gracz musi zdecydować co dalej*". **Ocalała misja
jest kluczem**, bo to ona odblokowuje panel przylotu, z którego idzie przekierowanie.

⚠ **Uwaga metodologiczna:** ta różnica NIE wynika z tego, że warp „stawia lepszy stan". Gałąź przylotu
(`:2374-2377`) stempluje `phase='orbiting_body'` na **każdej** niepowrotnej misji — także na
`move_to_point`. Różnica jest **downstream**: `moveToPoint` ma `movementOrder`, więc chwilę później
`MovementOrderSystem._onVesselArrived` (`:1859`) **zeruje misję**; misja `exploration` utworzona przez
przekierowanie żadnego rozkazu nie ma, więc **przeżywa**.

---

## 2. ŁAŃCUCH — cztery kroki, każdy zmierzony

```
1. WARP            dispatchInterstellar → _tickInterstellar (:2599) → interstellar_jump / in_system
2. SKIEROWANIE     klik ciała na mapie LUB wiersz listy w panelu przylotu
                     → 'vessel:interstellarRedirect'
                     → _redirectInterstellarVessel (:2839)
                         accepts (:2845): interstellar_jump(in_system) | exploration(orbiting_body)
                                          | foreign_recon(orbiting_body)
                         tworzy NOWĄ misję  type:'exploration'  (:2876)   ← ZAWIAS CAŁEJ ŚCIEŻKI
3. PRZYLOT         _updatePositions (:2377) → m.phase = 'orbiting_body'
                     ⇒ FMO:7405  type==='exploration' && phase==='orbiting_body'  → PANEL RENDERUJE
4. KOLONIZACJA     ⚠ przycisk najpierw SZARY: „(wymaga zbadania)" — świeży układ ma WSZYSTKIE ciała
                     explored=false. Trzeba nacisnąć „Zbadaj ciało" (foreign_recon_body) W TYM SAMYM
                     PANELU; po rekonesansie przycisk ożywa.
                     → 'expedition:foreignColonize' → _startForeignColonize (:3224)
```

🔑 **Dlaczego to jest warp-EKSKLUZYWNE, a nie przypadek:** `type: 'exploration'` ma w całym drzewie
**cztery** producentów — `VesselManager.js:2876` (jedyny tworzący od zera) oraz `:3025`, `:3104`,
`:3159` (te tylko **przepisują** `m.type='exploration'` na końcu `foreign_recon`). **Wszystkie cztery
leżą poniżej przylotu międzygwiezdnego.** Dlatego same-system `moveToPoint` z poprzedniego audytu
nie może tego panelu zapalić **nigdy**, a nie „akurat nie zapalił".

⚠ Dwa z tych producentów mają komentarz mówiący wprost, po co istnieją:
`:3025` „*przywróć typ aby UI pokazywał panel orbiting_body*" · `:3159` „*UI pokaże panel
orbiting_body z pełnymi akcjami*". To jest **zaprojektowane**, nie uboczne.

**Dwa wejścia do kroku 2** (oba prowadzą do tego samego `vessel:interstellarRedirect`):
wiersz listy w panelu przylotu (`FMO:2305`) **oraz zwykły klik na ciele na mapie**
(`FMO:1997`, predykat `_isForeignRedirectClickable:9164-9176`).

---

## 3. ZMIERZONE PRZY ZERZE KOLONII (przez prawdziwe UI, nie przez atrapy)

Przebieg weryfikatora: statek zbudowany **produkcyjną** `createAndRegister` (`:186`), moduły
`['engine_warp','warp_tank','habitat_pod','fuel_tank']`; wszystkie przejścia stanu wytworzone przez
silnik (`dispatchInterstellar:754` → `_tickInterstellar:2628` → `_redirectInterstellarVessel:2876` →
`_updatePositions:2377` → domknięcie `foreign_recon:3025` → `_startForeignColonize:3224`).

| pomiar | wynik |
|---|---|
| bramka panelu `FMO:7405` po przekierowaniu | **true** |
| hit-zony przed rekonesansem | `[back_to_shipyard, rename, foreign_recon_body, foreign_recon_system, foreign_redirect ×10]` — **bez** `foreign_colonize` |
| hit-zony **po** rekonesansie ciała | `[back_to_shipyard, rename, foreign_recon_system, **foreign_colonize**, foreign_redirect ×10]` |
| klik `foreign_colonize` przez prawdziwe `_handleHit` | kolonia `isPlayerColony: true`, owner `null` (kanon = gracz), **pop 8**, siatka, 3 budynki, `systemId sys_026` |
| statek po kolonizacji | **skonsumowany** (usunięty z rejestru) |
| **te same predykaty przy 1 koloni vs 0 kolonii** | **identyczne** — liczba kolonii nie jest terminem |
| ciała w świeżym układzie | **36 encji, wszystkie `explored: false`** ⇒ krok rekonesansu jest **obowiązkowy**, nie opcjonalny |

---

## 4. 🔴 FINDING 102 — ta ścieżka blokuje POPy załogi NA ZAWSZE

**Kolonizacja „obca" nie przechodzi przez `MissionSystem._processColonyArrival`.** Emituje
`expedition:colonyFounded` bezpośrednio i usuwa statek tak:

```
VesselManager.js:3224   if (canColonize(vessel)) {
VesselManager.js:3246     this._vessels.delete(vesselId);      ← surowe usunięcie z Mapy
```

⚠ **`destroyVessel` (`:1042`) robi więcej niż `delete`:** rozlicza załogę (`_settleCrewOnLoss` →
`releaseCrew`) i wypina statek z `colony.fleet`. Surowe `delete` **pomija oba**.

**Zmierzone (kontrola vs ścieżka):**

| przebieg | `_lockedPerStrata` po usunięciu statku |
|---|---|
| kontrolne `destroyVessel` | `{laborer: 0.4}` → **`{laborer: 0}`** |
| `foreign_colonize` | **`{laborer: 0.4}` — zostaje, na statku którego już NIE MA** |

⚠ **To jest dokładnie ta klasa, przed którą ostrzega W2** (§Model rozmieszczenia): księga załogi
zeruje się **na wejściu** w `killCrew`/`releaseCrew`, więc ominięcie obu ścieżek znaczy, że lock
**nigdy nie zostanie zdjęty** — POPy są zablokowane bezterminowo, a jedyny obiekt, który mógłby je
zwolnić, przestał istnieć.
⚠ Skutek jest **cichy**: nic nie krzyczy, gracz widzi tylko, że ma mniej wolnych POPów niż powinien.
⚠ **Osiągalne w normalnej grze** — to jest ścieżka, której gracz realnie używa (właśnie ją zapamiętał).

---

## 5. 🟠 FINDING 103 — przekierowanie po warpie omija bramkowanie startu

`_redirectInterstellarVessel` (`:2839`) bramkuje **wyłącznie**: istnienie statku · istnienie misji ·
akceptowany `type`/`phase` (`:2845`) · rozwiązywalny cel.

**Czego NIE ma:** bramki portu kosmicznego · bramki własności · **odrzucenia przy braku paliwa** —
paliwo jest **klampowane**: `vessel.fuel.current = Math.max(0, … - fuelCost)`.

**Kontrast zmierzony:** ten sam statek na zwykłej ścieżce `MovementOrderSystem.issueOrder` został
odrzucony z `no_spaceport_at_origin`.

⚠ Nie przesądzam, czy to defekt, czy świadome zwolnienie („statek w obcym układzie nie ma skąd
startować, więc bramka portu nie ma sensu") — **w kodzie nie ma komentarza, który by to rozstrzygał**,
a to jest różnica w bramkowaniu między dwiema ścieżkami ruchu tego samego statku.

---

## 6. CO TO ZNACZY DLA GATE 2 §4 SCENARIUSZ A

| | |
|---|---|
| Czy istnieje żywa ścieżka rekolonizacji przy zerze kolonii? | ✅ **TAK — dwie.** Formalna misja `colonize` z **zadokowanego** statku (poprzedni audyt) **oraz** warp → przekierowanie → rekonesans → „Kolonizuj obcy" (ten audyt) |
| Czy przesłanka D9 („statek w locie = jest czym odwrócić") ma pokrycie? | ✅ **TAK**, i to mocniejsze niż zakładano — druga ścieżka nie wymaga nawet doku |
| Czy §4-A można domknąć tą ścieżką? | ✅ **TAK.** ⚠ Ale wymaga **czterech** kroków, nie jednego: warp → skierowanie na ciało → **„Zbadaj ciało"** → dopiero wtedy Colonize |
| Co ta ścieżka psuje po drodze | ⚠ **Finding 102** — POPy załogi zostają zablokowane na zawsze |

⚠ **Jeśli §4-A będzie domykane tą trasą, warto przy okazji odczytać jednym wierszem:**
`KOSMOS.civSystem._lockedPerStrata` **przed** i **po** kolonizacji — to pokaże Finding 102 na żywo.

---

## Findings filed (ciągła numeracja po 101)

102. 🔴 **Kolonizacja „obca" blokuje POPy załogi NA ZAWSZE.** `VesselManager._startForeignColonize`
     (`:3224`) usuwa statek przez `this._vessels.delete(vesselId)` (`:3246`) zamiast `destroyVessel`
     (`:1042`), omijając `_settleCrewOnLoss`/`releaseCrew` **oraz** wypięcie z `colony.fleet`.
     **Zmierzone:** kontrolne `destroyVessel` `{laborer:0.4}` → `{laborer:0}`; ta ścieżka zostawia
     `{laborer:0.4}` na nieistniejącym statku. ⚠ Księga załogi (W2, R-C) zeruje się **na wejściu**
     w `killCrew`/`releaseCrew` — ominięcie obu znaczy lock **bezterminowy**, i to **cicho**.
     ⚠ **Osiągalne w normalnej grze**, na ścieżce, której gracz realnie używa.
103. 🟠 **`_redirectInterstellarVessel` (`:2839`) omija bramkowanie startu** — brak bramki portu,
     brak bramki własności, **brak odrzucenia przy braku paliwa** (paliwo klampowane do zera, `:2870`).
     Ten sam statek na `MovementOrderSystem.issueOrder` dostał `no_spaceport_at_origin` (zmierzone).
     ⚠ Brak komentarza rozstrzygającego, czy to zwolnienie świadome.
104. **Trasa „obca" nie przechodzi przez `MissionSystem._processColonyArrival`** — emituje
     `expedition:colonyFounded` bezpośrednio. Skutek pozytywny: kolonia i tak wychodzi poprawna
     (owner `null` = gracz, pop, siatka, budynki). Skutek negatywny: **wszystko, co `_processColonyArrival`
     robi PONAD założenie kolonii, jest tu pominięte** — Finding 102 jest tego pierwszym objawem,
     ale rejestr powinien odnotować, że są **dwie równoległe implementacje kolonizacji**.
105. **Komentarz `MovementOrderSystem.js:1857` „orbiting bez `dockedAt`" — potwierdzona nieprawda
     (druga niezależna obserwacja, por. Finding 101).** `dockedAt` JEST stemplowane przez
     `VesselManager.js:2375`, które biegnie **przed** zerowaniem misji.

107. 🟠 ⚠ **BLIŹNIAK 102, DOPISANY 2026-08-20: ta sama linia OSIEROCA TAKŻE JEDNOSTKI DESANTOWE.**
     `destroyVessel` (`:1042`) rozlicza nie tylko załogę, ale i zawartość `troop_bay`; surowy
     `this._vessels.delete` (`:3246`) pomija **oba**. Jednostki naziemne wiezione na pokładzie zostają
     **bez nosiciela**. Nie było zgłoszone w pierwszej wersji tego audytu — wyszło przy pytaniu
     projektowym o ujednolicenie kolonizacji.
     ⚠ Wspólna przyczyna z **102** i **104**: dwie równoległe implementacje, z których jedna omija
     cały rytuał sprzątania drugiej. Numer 107 (a nie 106) — 106 zajęła korekta trasy zadokowanej.
---

## Metoda, pewność, i czego NIE zmierzono

**Zmierzone WYKONANIEM, przez silnik i prawdziwe UI:** cały łańcuch warp → przekierowanie → przylot →
rekonesans → klik `foreign_colonize`, z użyciem produkcyjnej `createAndRegister` oraz prawdziwych
`_drawRight`/`_handleHit`; obecność/nieobecność hit-zony `foreign_colonize` przed i po rekonesansie;
powstanie koloni i konsumpcja statku; **wyciek locka załogi z kontrolą na `destroyVessel`**;
identyczność predykatów przy 1 i 0 koloniach.

**⚠ Świadomie NIE zweryfikowane ponownie:** baseline „`moveToPoint` kończy się `mission=null`" **nie
został** re-zmierzony w tym audycie — `MovementOrderSystem` jest montowany tylko w `GameScene`, a
headless `GameCore` go nie konstruuje (wywołanie `mos.issueOrder` było **cichym no-opem**). Werdykt
tego nie potrzebuje z mocniejszego powodu: `FMO:7405` wymaga `type === 'exploration'`, a **wszystkie
cztery** producenty tego typu leżą poniżej przylotu międzygwiezdnego. Baseline pochodzi z poprzedniego
audytu, gdzie **był** zmierzony wykonaniem.

**Świadomie NIE zmierzone:** gra nie była uruchamiana — potwierdzenie na żywo zostaje do gate'u.
Nie badano, czy Finding 102 dotyczy też innych ścieżek usuwających statek surowym `delete`
(grep poza zakresem tego zlecenia).

**Zero zmian w kodzie. Naprawa nie jest tu proponowana.**
