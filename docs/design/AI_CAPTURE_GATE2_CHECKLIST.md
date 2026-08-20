# AI CAPTURE — GATE 2: „księga, widoczność i koniec gry" (live, przeglądarka)

**Po commitach:** AC-7 `990255f` · AC-8 `bb614ed` (D5 + **D9=W3**) · AC-9 `105b873` ·
**Zapis:** v101, **bez migracji** · **Wykonuje:** właściciel, w przeglądarce.

> ⚠ **CC NIE PISZE PLIKÓW, DOPÓKI GATE TRWA** — zapis w repo przeładowuje kartę przez Live Server
> i cofa grę do ostatniego zapisu. Potrzebna zmiana w trakcie? Najpierw **zapisz grę do pliku**.

> ⚠ **NIE WOŁAJ `KOSMOS.debugLog.attach()`.** Gra podpina go raz przy starcie
> (`GameScene.js:1915`); drugie `attach()` daje **podwójną subskrypcję i KAŻDY licznik ×2**.
> Złapane przy walidacji tych one-linerów: pierwszy przebieg pokazał „2 przejęcia" i „2× koniec
> gry" tam, gdzie produkt zachował się poprawnie. To była wada INSTRUMENTU, nie gry — i dokładnie
> dlatego one-linery wykonuje się PRZED wpisaniem ich do checklisty.

> ⚠ Filtrujemy po **rodzaju zdarzenia**, nigdy po TEKŚCIE Dziennika (gra bywa po angielsku).
> Wszystkie one-linery poniżej **wykonane na żywym silniku** 2026-08-19.

---

## 🔶 RESUME — GATE 2 PRZERWANY W POŁOWIE (2026-08-19). Czytaj to PIERWSZE.

**Sesja właściciela przerwana w trakcie §3.** Stan gry **zabezpieczony do pliku `.json`** przed
zamknięciem karty — nie trzeba odtwarzać scenariusza od zera, wystarczy wczytać tamten zapis.
⚠ **SPROSTOWANIE 2026-08-20 — to zdanie stało tu jako „w repo nic się nie zmieniło od rozpoczęcia
gate'u" i JUŻ NIE JEST PRAWDZIWE.** Między §3 a §4 wszedł **blok P0** arca BRAMKA WŁASNOŚCI
(`e86c091` · `0085a37` · `6796617`; plan `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md`), bo §3 obnażyło
defekt, przez który **wczytanie zapisu samo oddawało gracza koloni wroga**. Czyli:
- **§1-§3 biegły na kodzie sprzed P0** (AC-7 `990255f` · AC-8 `bb614ed` · AC-9 `105b873`);
- **§4 i §5 pobiegną na kodzie Z P0** — i to jest w porządku: mechanizmy, które one mierzą
  (`_tickPlayerViability`, `canReverseFate`, `captureColonyForPlayer`, `colony:capturedByPlayer`),
  **P0 nie tknął**. Sprawdzone punkt po punkcie 2026-08-20; treść §4 i §5 **nie wymagała zmian**.
- 🔴 **Dlatego §4/§5 wykonujemy na ŚWIEŻEJ partii, nie na tamtym zapisie `.json`** — tamten plik jest
  skażony dokładnie tą regresją, którą P0 naprawiło (`COLONY_OWNERSHIP_GATE_AUDIT.md` §6).

| § | zakres | status |
|---|---|---|
| **§1** | księga kampanii (AC-7) | ✅ **PASS** |
| **§2** | widoczność utraty terenu (AC-9) | ✅ **PASS** |
| **§3** | higiena po utracie kolonii (AC-8) | 🔶 **JEDEN punkt został** — przeklikanie UI zamknięte w GATE P0 §6 (PASS); zostaje **odmowa nowej misji kolonizacyjnej**. ⚠ Zrób go przy §4 scenariusz B — będziesz DOKŁADNIE w tym stanie |
| **§4** | D9=W3, koniec gry przy braku odwrotu | ⬜ **NIE ZACZĘTE** |
| **§5** | regresja odbicia (D7 z W3) | ⬜ **NIE ZACZĘTE** |

**§1 — zmierzone:** `K1` → jeden rekord (`entity_7`, `emp_001`, `active:false`,
`end:'colony_captured'`); `K2` → `colony:captured` = **1**.
⚠ **Obserwacja MOCNIEJSZA niż keeper:** druga fala dostała **TEN SAM `invasionId`** co pierwsza —
czyli guard idempotencji potwierdzony na żywym silniku od strony IDENTYFIKATORA, a nie tylko po
liczbie ogłoszeń. Keeper `ai_capture_ledger_smoke` sprawdzał liczbę rekordów i emisji; ta obserwacja
domyka to od drugiej strony i warto ją przenieść do rejestru przy close-oucie.

**§2 — potwierdzone wizualnie w trakcie marszu:** dzwonek, wpis w Dzienniku (kanał **Walka**), ikona
sekcji. Zgodnie z checklistą.

**§3 — co JUŻ potwierdzone:** `K4` → `{ aktywna: null, magazyn: 'ODPIĘTY', kolonieGracza: 0 }`;
kolonia zniknęła z górnego paska i z całego UI; brak widocznego crasha.
**§3 — co ZOSTAŁO do domknięcia (od tego zacznij):**
1. ✅ **ZAMKNIĘTE GDZIE INDZIEJ (2026-08-20) — nie powtarzaj.** Systematyczne przeklikanie UI z otwartą
   konsolą wykonano jako **GATE P0 §6** (`COLONY_OWNERSHIP_GATE_P0_CHECKLIST.md`), na świeżej partii
   i na kodzie PO naprawie — **PASS**. ⚠ I ten punkt **zarobił na siebie**: za pierwszym podejściem
   PADŁ, ujawniając crash **co klatkę** w `GroundUnitPanel._drawActions` → `_canRecruitMoreUnits`
   (`colony.planetId` przy `colony === null`) plus drugi, ukryty za nim (`_getMaxGroundUnits`).
   Naprawione w `6796617`, przykryte keeperem **wykonaniowym** `zero_colony_panels_smoke` (11/11).
   Dokładnie tak, jak zapowiadało kryterium: **„nic nie rzuca wyjątkiem"**, nie „panel jest pusty".
2. **Próba wysłania NOWEJ misji kolonizacyjnej** → oczekiwana **ODMOWA** („brak zasobów
   startowych"), nie darmowy start. To jest bezpośredni sprawdzian rozstrzygnięcia „magazyn nie
   zostaje z graczem" — i zarazem pułapki, w której miękkie `if (this.resourceSystem)` czyniło
   misje darmowymi zamiast blokować.

Potem normalnie **§4** (scenariusz A: kolonizator w locie wstrzymuje koniec gry i daje 0 → 1;
scenariusz B: brak odwrotu ⇒ `game:over` `conquered` po **12 civYears** karencji) i **§5**.

---

## §1 — KSIĘGA: jedna kampania na ciało, jedno ogłoszenie (AC-7)

Wywołaj desant **DWA RAZY** na to samo ciało, w odstępie kilku miesięcy gry
(`WarOverlay` → **Force invasion** ×2, albo dwa razy konsolowo — patrz GATE 1 §1/L4).

```js
// K1 — kampanie w księdze (OCZEKIWANE: JEDEN wpis na parę ciało+agresor)
Object.values(KOSMOS.gameState.get('invasions') ?? {})
  .map(i => ({ p: i.planetId, a: i.aggressor, active: i.active, end: i.endReason ?? '-' }))

// K2 — ile RAZY ogłoszono przejęcie (OCZEKIWANE: 1)
KOSMOS.debugLog.query({ kind: 'colony:captured' }).length
```

- [ ] **K1**: dwie fale = **jeden** rekord (`p`+`a` się nie duplikują), z sumą jednostek.
- [ ] **K2**: po przejęciu `colony:captured` poleciało **dokładnie raz**. *(Przed AC-7 leciało
      dwa razy, a drugie ogłoszenie było fałszywym przerzutem AI→AI — gracz go nie widział tylko
      dzięki bramce u odbiorcy.)*
- [ ] Druga fala **po odparciu pierwszej** wskrzesza rekord (`active: true`), zamiast tworzyć
      sierotę, której nikt nie rozlicza.

---

## §2 — WIDOCZNOŚĆ: gracz wie, że traci teren (AC-9)

W trakcie marszu najeźdźcy przez kolonię:

```js
// K3 — dzwonek: co widzi gracz
KOSMOS.notificationCenter.getActive()
  .map(n => ({ typ: n.type, kafli: n.payload?.lost ?? '', tytuł: n.title }))
```

- [ ] **🔔 dzwonek** pokazuje wpis **„Tracisz teren"** z LICZBĄ kafli, a nie serię wpisów
      po jednym na kafel. *(Pusty kafel przewraca się natychmiast — bez agregacji dzwonek
      dostałby lawinę.)*
- [ ] Ten sam wpis jest w **Dzienniku, kanał Walka**.
- [ ] Sekcja w dzwonku ma **ikonę i przetłumaczoną nazwę** (🚩 „Utrata terenu"), a nie surowe
      `tileLost`.
- [ ] Po wybiciu najeźdźców przychodzi **🛡 „Desant odparty"**.
- [ ] ⚠ Kontrola ciszy: kafle zmieniające ręce **między imperiami AI** NIE generują powiadomień.

---

## §3 — HIGIENA PO UTRACIE KOLONII (AC-8 / D5)

Doprowadź do utraty **jedynej** kolonii (albo zapisz grę i zrób to na kopii).

```js
// K4 — panel i magazyn po utracie
({ aktywna: KOSMOS.colonyManager.activePlanetId,
   właściciel: KOSMOS.colonyManager.getColony(KOSMOS.colonyManager.activePlanetId)?.ownerEmpireId ?? 'gracz',
   magazyn: KOSMOS.resourceSystem === null ? 'ODPIĘTY' : 'obecny',
   kolonieGracza: KOSMOS.colonyManager.getPlayerColonies().length })
```

- [ ] **K4**: `aktywna` = **`null`**, `magazyn` = **`ODPIĘTY`**. ⚠ Przed AC-8 panel gracza
      przeskakiwał na **kolonię AGRESORA** i gospodarował jej magazynem (zmierzone: `entity_94`,
      `emp_001`).
- [ ] **UI nie wywala się** w tym stanie: przeklikaj górny pasek, Outliner, Ekonomię, Populację,
      mapę. Konsola **bez czerwonych błędów**. *(To jest realne ryzyko tej zmiany — headless
      przeżył 4× karencję bez wyjątku, ale to przeglądarka rysuje panele.)*
- [ ] Statek gracza, który był przypisany do utraconej kolonii, **nie leci** na zajętą planetę
      (brak wymuszonego powrotu w ręce wroga).
- [ ] Próba wysłania **nowej** misji kolonizacyjnej → **ODMOWA** („brak zasobów startowych"),
      a nie darmowy start. *(To jest rozstrzygnięcie „magazyn nie zostaje z graczem".)*

---

## §4 — D9=W3: koniec gry dopiero przy braku ZDOLNOŚCI odwrócenia (AC-8)

**Scenariusz A — jest czym odwracać (koniec gry NIE MOŻE paść).**
Przed utratą ostatniej kolonii miej w kosmosie **statek kolonizacyjny** (moduł habitacyjny).

- [ ] Po utracie kolonii gra **toczy się dalej** — także po kilku latach gry.
- [ ] Statek dolatuje i **zakłada nową kolonię**: `KOSMOS.colonyManager.getPlayerColonies().length`
      wraca do **1**. *(To jest trzecia ścieżka odwrócenia losu — zmierzona, 0 → 1.)*

**Scenariusz B — nie ma czym (koniec gry MA paść, ale nie od razu).**
Utrata ostatniej kolonii bez statku desantowego z wojskiem i bez kolonizatora.

```js
// K5 — powód i skutek (OCZEKIWANE po roku wyświetlanym: po jednym wpisie)
({ powód: KOSMOS.debugLog.query({ kind: 'player:noReversalPossible' }).map(e => e.data?.reason),
   koniec: KOSMOS.debugLog.query({ kind: 'game:over' }).map(e => e.data?.reason) })
```

- [ ] Zaraz po utracie **NIC się nie dzieje** — karencja to **12 civYears = jeden rok wyświetlany**.
      *(Test w chwili utraty zabiłby gracza, któremu kolonizator dolatuje za trzy lata.)*
- [ ] Po roku pada ekran końca gry z tekstem o **podboju**, a nie o wymarciu.
- [ ] **K5**: `powód` nazywa brakujące ogniwa (np. `no_drop_ship+no_ground_troops+no_colony_ship`),
      `koniec` = `['conquered']` — **jeden raz**, nie co tik.
- [ ] ⚠ Kontrola: mając **transportowiec BEZ wojska** koniec gry **i tak pada** (pusty transportowiec
      to potencjał bez zdolności — to jest sedno Twojego wymogu „dwa warunki naraz").

---

## §5 — REGRESJA: odbicie kolonii nadal działa (D7 z W3)

> To jest §3 przeniesione z GATE 1, gdzie zostało świadomie odłożone jako regresja mechanizmu
> już dowiedzionego (W3 GATE 3 §5, odbicie Nekkar d). Tu wraca, bo AC-7/AC-8 dotknęły dokładnie
> tej ścieżki: guard idempotencji w `transferColony` i filtr właściciela w fallbacku.

- [ ] Odbij kolonię zajętą przez AI (wybij najeźdźców; skan chodzi raz na **1.0 civYear = jeden
      WYŚWIETLANY MIESIĄC**, nie raz na rok gry — `InvasionSystem.js:51-61` akumuluje `civDeltaYears`
      z progiem `1.0`, a `CIV_TIME_SCALE = 12`. ⚠ Sprostowane 2026-08-20; poprzednia wartość była 12×
      zawyżona, więc nie czekaj roku).
- [ ] Wraca **kompletna**: populacja, budynki, produkcja, lista kolonii, panel.
- [ ] `KOSMOS.debugLog.query({ kind: 'colony:captured' })` **nie rośnie** przy odbiciu
      (gracz odzyskuje przez `colony:capturedByPlayer`, nie przez `colony:captured`).

---

## §6 — Czego NIE liczyć jako porażkę

| obserwacja | werdykt |
|---|---|
| Pierwsza wymiana ognia zabija obie jednostki naraz | **NIE FAIL** — Findings 50/65 (morale legacy), slice GROUND. |
| Część fali stoi, `groundUnit:territorialBlocked` mówi `unit_immobile` | **NIE FAIL** — legacy `garrison` ma `speedHex: 0`. |
| Po utracie wszystkiego panele są puste | **NIE FAIL** — to jest stan „nie masz nic". FAIL-em jest dopiero **błąd w konsoli** albo panel pokazujący dane **kolonii wroga**. |
| Rekolonizacji nie da się wysłać z zera | **NIE FAIL** — to jest Twoje rozstrzygnięcie (magazyn nie zostaje). Ścieżką jest statek **już w locie**. |

---

## §7 — Jeśli gate PADNIE

1. **Zapisz grę do pliku**, zanim cokolwiek zmienimy.
2. Zbierz: **K1-K5** + `KOSMOS.debugLog.tail(40)` + zrzut konsoli.
3. Powiedz, **który paragraf** padł — każdy ma inny commit do cofnięcia:
   §1 → AC-7 (`990255f`) · §2 → AC-9 (`105b873`) · §3/§4 → AC-8 (`bb614ed`) · §5 → regresja W3-1.

---

## Co dalej po PASS

Slice **AI_CAPTURE domknięty** (AC-0…AC-9, GATE 1 + GATE 2). Zostaje close-out: wpis do
`CLAUDE.md`, rejestr znalezisk, aktualizacja `W3_PLAN.md` §Findings 51 o wynik.
Otwarte, nazwane, **poza tym slice'em**: katalog transportowca AI (Finding 49) · desant AI na
modelu LEGACY (Finding 50) · slice GROUND · W4 (pokój terytorialny).
