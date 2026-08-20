# BRAMKA WŁASNOŚCI — GATE P0: „wczytanie nie oddaje gracza koloni wroga" (live, przeglądarka)

**Po commitach:** OG-0 `e86c091` · OG-2 `0085a37` · docs `a03be51` ·
**Zapis:** v101, **bez migracji** · **Wykonuje:** właściciel, w przeglądarce.
**Plan:** `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` (blok P0 podpisany 2026-08-19).

> 🔴 **NA ŚWIEŻEJ PARTII, NIE NA ZAPISIE Z 2026-08-19.** Tamten plik jest skażony dokładnie tą
> regresją, którą ten gate mierzy (`COLONY_OWNERSHIP_GATE_AUDIT.md` §6) — wczytanie go pokazałoby
> stan po awarii, a nie po naprawie. Ten sam warunek dotyczy wznowienia **AI_CAPTURE GATE 2 §4/§5**.

> ⚠ **CC NIE PISZE PLIKÓW, DOPÓKI GATE TRWA** — zapis w repo przeładowuje kartę przez Live Server
> i cofa grę do ostatniego zapisu. Potrzebna zmiana w trakcie? Najpierw **zapisz grę do pliku**.

> ⚠ **NIE WOŁAJ `KOSMOS.debugLog.attach()`** — gra podpina go raz przy starcie; drugie `attach()`
> daje podwójną subskrypcję i KAŻDY licznik ×2 (wada instrumentu, nie gry).

> ⚠ Filtrujemy po **rodzaju zdarzenia**, nigdy po TEKŚCIE Dziennika (gra bywa po angielsku).
> **Wszystkie one-linery poniżej wykonane na żywym silniku (headless `GameCore`) 2026-08-20** —
> w tym jedna poprawka instrumentu: `K3` przy odpiętym kontekście zwracał `wlasciciel: '(gracz)'`
> (bo `c?.ownerEmpireId ?? '(gracz)'` kłamie, gdy `c` jest `null`); wersja niżej mówi „brak aktywnej".

---

## Przyklej do konsoli raz, na starcie

```js
K1 = () => ({ aktywna: KOSMOS.colonyManager.activePlanetId,
              magazyn: KOSMOS.resourceSystem ? 'PODPIETY' : 'ODPIETY',
              kolonieGracza: KOSMOS.colonyManager.getPlayerColonies().length })

K3 = () => { const cm = KOSMOS.colonyManager, c = cm.getColony(cm.activePlanetId);
             return c ? { aktywna: cm.activePlanetId, wlasciciel: c.ownerEmpireId ?? '(gracz)',
                          czyMoja: !c.ownerEmpireId || c.ownerEmpireId === 'player' }
                      : { aktywna: cm.activePlanetId, wlasciciel: '(brak aktywnej koloni)', czyMoja: null } }

K5 = (id) => ({ id, isHomePlanet: KOSMOS.colonyManager.getColony(id)?.isHomePlanet,
                wlasciciel: KOSMOS.colonyManager.getColony(id)?.ownerEmpireId ?? '(gracz)' })
```

---

## §1 — Przesłanka: utrata jedynej kolonii (to samo, co AI_CAPTURE GATE 2 §3)

1. Doprowadź do przejęcia **jedynej** kolonii gracza przez AI (dźwignia: `WarOverlay` →
   `force_invasion`; warunek wstępny: **mapa kolonii musi być choć raz otwarta**, inaczej
   `launchInvasion` zwróci `no_grid`).
2. `K1()` ⇒ oczekiwane **`{aktywna: null, magazyn: 'ODPIETY', kolonieGracza: 0}`**.
3. `K5('<id ex-domu>')` ⇒ ⚠ **`isHomePlanet: false`** — to jest **NOWE** (P0-C). Przed P0 zostawało
   `true` i to była flaga, z której wczytanie uzbrajało aktywną kolonię na ciele wroga.
4. `K3()` ⇒ `{aktywna: null, wlasciciel: '(brak aktywnej koloni)', czyMoja: null}`.

⬜ **§1 PASS gdy:** wszystkie cztery odczyty zgodne i **nic nie rzuca wyjątkiem**.

---

## §2 — SEDNO P0: zapis → wczytanie → ten sam stan

**To jest jedyny punkt, dla którego cały blok P0 powstał.**

1. **Zapisz grę do pliku** (menu ☰ → zapis do pliku).
2. **Wczytaj ten plik** (ekran tytułowy → wczytaj z pliku → gra się przeładuje).
3. `K1()` ⇒ **musi być IDENTYCZNE z §1.2**: `{aktywna: null, magazyn: 'ODPIETY', kolonieGracza: 0}`.
4. `K3()` ⇒ `czyMoja: null` (albo `true`, jeśli w międzyczasie masz kolonię) — **NIGDY `false`**.

🔴 **§2 FAIL, jeśli po wczytaniu `aktywna` wskazuje ciało należące do imperium** (`czyMoja: false`).
To jest dokładnie awaria, którą P0 zamyka; przed P0 ten krok dawał ex-dom wroga **bez kliknięcia**.

⬜ **§2 PASS gdy:** stan po wczytaniu == stan przed zapisem, i `czyMoja` nigdy nie jest `false`.

---

## §3 — Kontrola pinu §2: wczytanie z OCALAŁĄ kolonią wraca na NIĄ

Gate, który tylko sprawdza „null", przeszedłby też przy całkowicie zepsutym wyborze.

1. Nowa partia. Załóż **drugą** kolonię, potem strać stolicę na rzecz AI.
2. `K1()` ⇒ `aktywna` = **druga kolonia**, `magazyn: 'PODPIETY'`, `kolonieGracza: 1`.
3. Zapisz do pliku → wczytaj.
4. `K1()` + `K3()` ⇒ `aktywna` = **ta sama druga kolonia**, `czyMoja: true`.

⬜ **§3 PASS gdy:** wczytanie wybiera kolonię GRACZA, a nie zdobycz wroga i nie `null`.

---

## §4 — P0-D: bliźniak w `removeColony` (ten szew był ŻYWY do wczoraj)

Ścieżka: po utracie stolicy zniszcz **inną** kolonię gracza. Przed P0 przepinało to wszystkie pięć
wskaźników na ex-dom wroga (test przynależności zamiast własności).

1. Stan z §3 (stracona stolica + żywa druga kolonia, aktywna jest druga).
2. `KOSMOS.debug.destroyColony('<id drugiej koloni>', {confirm:true})`
   — ⚠ to idzie **pełną ścieżką produkcyjną** (`removeColony`, ten sam kod co kolizja/wyrzucenie).
3. `K1()` ⇒ **`{aktywna: null, magazyn: 'ODPIETY', kolonieGracza: 0}`**.
4. `K3()` ⇒ `czyMoja: null`. 🔴 **FAIL, jeśli `aktywna` = ex-dom i `czyMoja: false`.**

⬜ **§4 PASS gdy:** zniszczenie ostatniej koloni ODPINA kontekst zamiast oddawać go wrogowi.

---

## §5 — Podpisany skutek uboczny + kontrola, że nie zdjęliśmy ochrony wszystkim

P0-C zdejmuje `isHomePlanet` ze zdobyczy, przez co **ex-dom przestaje być niezniszczalny**.
To było w podpisie — sprawdzamy, że dotyczy **tylko** ciał, które przestały być stolicą.

1. Na żywej, **nieutraconej** stolicy: `KOSMOS.debug.destroyColony('<id stolicy>', {confirm:true})`
   ⇒ oczekiwane **ostrzeżenie w konsoli** („to HOME PLANET — `removeColony` jej NIE niszczy") i
   kolonia **zostaje** (`KOSMOS.colonyManager.getColony('<id>') !== null`).
2. Po utracie tej samej stolicy (§1) ta sama komenda ⇒ kolonia **znika** z rejestru.

⬜ **§5 PASS gdy:** żywa stolica gracza nadal chroniona, ex-dom wroga usuwalny.

---

## §6 — Higiena UI przy odpiętym kontekście (najostrzejszy punkt)

`resourceSystem` i `civSystem` są `null`. **Kryterium nie brzmi „kolonia zniknęła", tylko
„nic nie rzuca wyjątkiem"** — headless nie rysuje paneli, więc tego ryzyka nie da się zamknąć testem.

Z otwartą konsolą przeklikaj: **Outliner · Ekonomia · Populacja · Cywilizacja · STRATCOM · Flota ·
górny pasek · Dziennik**.

⚠ Podczas klikania **nie wchodź na kolonię wroga** — to ścieżka **D1** (niepodpisana, nadal otwarta),
więc jej zachowanie **nie jest** przedmiotem tego gate'u i łatwo pomylić ją z regresją P0.

⬜ **§6 PASS gdy:** zero wyjątków w konsoli.

---

## §7 — Odbicie stolicy przywraca jej rangę (P0-C, wariant „dom wraca")

Opcjonalne, jeśli masz czym odbić (statek desantowy + wojsko).

1. Odbij utraconą stolicę.
2. `K5('<id stolicy>')` ⇒ **`isHomePlanet: true`**, `wlasciciel: '(gracz)'`.

⬜ **§7 PASS gdy:** odbita stolica odzyskuje rangę (inaczej zostałaby trwale zdegradowana, a
`window.KOSMOS.homePlanet` i tak by na nią wskazywał — dwa pojęcia „domu" rozjechałyby się).

---

## Czego ten gate ŚWIADOMIE NIE mierzy

- **Ścieżki KLIKANEJ** (`switchActiveColony` przyjmuje kolonię AI) — to **D1**, niepodpisane.
  Keeper `colony_ownership_seams` pinuje ten szew jako **wciąż żywy** (S4).
- **Budowy na cudzym kaflu** — to **D5**, niepodpisane. ⚠ I jest **żywe już dziś** także bez P0:
  zaprojektowany podgląd obcej planety (desant/ostrzał) rysuje pasek budowy, a `_build` nie sprawdza
  przynależności kafla.
- **Klas A/B/C i predykatu** (D2/D3/D4/D6) — osobny podpis.

---

## Po gate'cie

| wynik | co dalej |
|---|---|
| **PASS** | Zamknięcie bloku P0 w planie + wpis do `CLAUDE.md`/pamięci. Potem: **wznowienie AI_CAPTURE GATE 2 §4/§5 na tej samej świeżej partii** (§4 = D9=W3, karencja 12 civY; §5 = regresja odbicia). D1-D6 do osobnego podpisu. |
| **FAIL** | Zanotuj, KTÓRY paragraf i pełny odczyt `K1()`/`K3()`. ⚠ Zapisz grę do pliku **przed** zgłoszeniem — CC nie może pisać w repo, dopóki karta jest otwarta. |
