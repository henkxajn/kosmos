# WEJŚCIE W ZAKŁADKĘ DOWÓDZTWA — Finding 160 (save v101 bez migracji)

> **Status:** ✅ **PODPISANY 2026-08-27 (T1-T6 = W1), WYKONANY, live-gate 6/6 PASS — ZAMKNIĘTY.**
> Slice przekrojowy, mały.
> **Rejestr macierzysty:** `docs/design/COLONY_OWNERSHIP_GUARD_PLAN.md` §160.
> **Audyt wejściowy:** `docs/audit/STRATCOM_110_159_160_AUDIT.md` §3 (pomiar wykonany PRZED planem).
> **Poprzednik:** `STRATCOM_CONTROL_PLAN.md` — 160 to **niedokończona połowa Findingu 108**,
> nie osobna okolica. 108 zamknięto punktowo (parytet rodziny w `_close()`); przyczyna źródłowa
> została.

---

## 1. Jedno zdanie

Klawisz otwierający Dowództwo **na już otwartym Dowództwie** przełącza zakładkę, omijając
`_switchTab` **i** `close()` — więc nic nie sprząta po zakładce, z której gracz właśnie wyszedł,
a osierocone pole tekstowe Rejestru zostaje **nad mapą galaktyki**.

---

## 2. Mechanizm (zmierzony, nie zakładany)

`OverlayManager.handleKey:75-80` — gdy overlay jest **już aktywny**, a wpis keymapy ma niepuste
`opts`, leci `_showOverlay(...)` **bez** `_hideOverlay`:

```
if (this.active === id) {
  if (isObj && Object.keys(opts).length > 0) {
    this._showOverlay(this.overlays[id], opts);   // ← close() NIE biegnie
    return true;
  }
  this._hideOverlay(...);
}
```

`FleetManagerOverlay` nie ma `show()`, więc leci `open(opts)`. Tam są **trzy** przypisania
`_activeTab` i **żadne** nie przechodzi przez `_switchTab`:

| miejsce | przypisanie | wyzwalacz |
|---|---|---|
| `:512` | `if (opts.tab) this._activeTab = opts.tab` | `G` / `M` → `'stratcom'` |
| `:517` | `if (this._pendingFocusSection) this._activeTab = 'tactical'` | `K` |
| `:529` | `if (opts.view === 'registry' …) this._activeTab = 'tactical'` | Dok taktyczny |

Zmierzone skutki (wykonanie na prototypie, obie kontrole pinu czyste):

```
LOGISTYKA z otwartym polem ilości + M/G:
  _activeTab = stratcom · input NADAL w DOM = true · _logiGoodDropdownOpen = true
REJESTR z wpisaną frazą + M/G:
  ma handler blur? false · input NADAL w DOM = true
kontrola: _switchTab → false;  kontrola: close() → false
```

### ⚠ Osiągalność różni się per pole — i to rozstrzyga o wadze

| pole | `blur` | werdykt |
|---|---|---|
| ilość towaru (Logistyka) `:1089` | **jest** (`blur → commit → close`) | samo się leczy; póki ma fokus, jego `keydown` robi `stopPropagation`, więc `M` i tak nie dotrze ⇒ **nieosiągalne** |
| wyszukiwarka Rejestru `:4366-4393` | **BRAK** (celowo — fraza przeżywa przeglądanie listy) | **OSIĄGALNE**: wpisz frazę → kliknij kanwę → `M` ⇒ input nad mapą galaktyki |

⚠ **Granica dowodu:** semantyka fokusu ustalona **czytaniem**, nie w przeglądarce. Sam wyciek
zmierzony wykonaniem. Rozstrzyga live-gate §1.

### Producenci — zbiór zamknięty

Dokładnie **`g`, `m`, `k`** — jedyne wpisy keymapy w formie `{id, opts}`, wszystkie celujące
w `fleet`. `Outliner:732/736` woła `openPanel('fleet')` **bez opcji** (nie rusza `_activeTab`);
`TacticalDock:671` jest przy otwartym overlayu **nieklikalny** (`UIManager:1724`).
⚠ Ale `Outliner` **jest** klikalny przy otwartym overlayu (`UIManager:1715` bez bramki `isAnyOpen`)
— dziś nieszkodliwe, jutro furtka, gdyby ktoś dodał tam `opts.tab`.

---

## 3. Decyzje do podpisu

| # | pytanie | warianty | rekomendacja |
|---|---|---|---|
| **T1** | gdzie stoi bramka | **W1** `open()` routuje przypisania `_activeTab` przez `_switchTab` · **W2** `handleKey` woła `_hideOverlay` przed re-show · **W3** punktowo, tylko `opts.tab` | **W1** |
| **T2** | czy `_switchTab` biegnie też przy otwieraniu z zamknięcia | **W1** bezwarunkowo · **W2** tylko gdy overlay był widoczny | **W1** |
| **T3** | kolejność w `open()` wobec pól „intencji wejścia" | **W1** `_switchTab` PRZED `_pendingFocusSection`/`_registryFilter` (jak dziś) · **W2** po | **W1** |
| **T4** | early-return `_switchTab` (ta sama zakładka = brak resetu) | **W1** zostaje, pinowany · **W2** wymusić reset | **W1** |
| **T5** | czy dokładamy `blur` do wyszukiwarki Rejestru | **W1** NIE (celowy brak) · **W2** tak | **W1** |
| **T6** | czy parytet rodziny w `_close()` (108c) zostaje | **W1** zostaje (ścieżka Esc) · **W2** usunąć jako redundantny | **W1** |

### Uzasadnienia tam, gdzie wybór nie jest oczywisty

**T1 — dlaczego NIE W2.** Kuszące, bo jedna linia w `OverlayManager`. Ale `hide → show` **łamie
zaprojektowaną intencję klawisza `K`** (M4 P2: „drugie wciśnięcie ponownie ustawia focus zamiast
zamykać"), bo `close()` → `_close()` zeruje `_activeTab`, stan Stratcomu i **disposuje kontekst
WebGL galaktyki** — rekonstrukcja przy każdym `K`. Zmieniałoby też semantykę dla **wszystkich**
overlayów, a defekt jest własnością jednego. Bramka należy do właściciela stanu.

**T1 — dlaczego NIE W3.** `k` też flipuje zakładkę (`:517`), a `view: 'registry'` (`:529`) trzeci
raz. Utwardzenie jednego z trzech to **nieutwardzony bliźniak** — klasa, na której to repo już się
przejechało (`removeColony:667`, `ReturnJump` ×4 producentów). Wszystkie trzy albo żadne.

**T2 — dlaczego bezwarunkowo.** `open()` ustawia `this._visible = true` w **pierwszej linii**, więc
warunek „czy był otwarty" wymagałby zapamiętania stanu przed — druga ścieżka i drugi stan do
przetestowania, przy zerowym zysku: po `close()` stan jest już czysty, więc `_switchTab` jest
wtedy no-opem.

**T4 — dlaczego early-return NIE jest dziurą.** Wyciek polega na **przeniesieniu** pola DOM tam,
gdzie ono nie należy. Gdy zakładka się nie zmienia, nic się nie przenosi: gracz w Rejestrze
z wpisaną frazą, który wciska `K`, zostaje w Rejestrze — input dalej stoi nad swoim polem, i tak
ma być. Pinujemy to, żeby nikt tego nie „naprawił" na siłę.

**T5 — dlaczego nie ruszamy `blur`.** Brak `blur` jest **celowy** (fraza ma przeżyć przeglądanie
wyników). Po zamknięciu chokepointu z T1 wyciek jest odcięty u źródła; dokładanie `blur` byłoby
naprawą objawu i zmianą zachowania wyszukiwarki.

---

## 4. Kształt naprawy (przy rekomendowanych wariantach)

Jeden plik, jedna funkcja: `FleetManagerOverlay.open()` — trzy przypisania `_activeTab` zamienione
na wywołania `_switchTab(...)`, z **zachowaną kolejnością** wobec pól intencji wejścia
(`_pendingFocusSection`, `_tacticalView`, `_registryFilter`, `_pendingFocusVesselId`).

Sprawdzone, że `_switchTab` **nie zjada** żadnego z tych pól: rusza `_missionConfig` (tylko gdy
`step === 'select'`), hovery, `_rightScrollY`, `_atlasScrollY`, drop-downy Logistyki i **oba pola
DOM** — `_registryFilter` i `_pendingFocusSection` są poza jego zasięgiem.

**Zero** zmian w `OverlayManager`. **Zero** migracji (v101). **Zero** nowych kluczy i18n.

---

## 5. Keeper — `src/testing/smoke/overlay_tab_entry_smoke.mjs`

Wykonaniowy (`FleetManagerOverlay` importuje się pod node, `open`/`_switchTab`/`close` są na
prototypie), atrapa DOM z `env.js`.

| # | pin | fail-first |
|---|---|---|
| **T1** | wyszukiwarka Rejestru + `open({tab:'stratcom'})` ⇒ input **usunięty** z DOM | dziś zostaje |
| **T2** | pole ilości Logistyki + dropdowny + `open({tab:'stratcom'})` ⇒ posprzątane | dziś zostają |
| **T3** | **kontrola pinu**: `_switchTab` i `close()` nadal sprzątają (strażnik regresji) | przechodzi już dziś |
| **T4** | **pin źródłowy**: `g`/`m`/`k` to jedyne wpisy keymapy `{id, opts}` i wszystkie celują w `fleet` (+ kontrola pinu: wpis `f` jest stringiem) | — |
| **T5** | intencja wejścia przeżywa: `open({focusSection:'wreck'})` ustawia `_pendingFocusSection`/`_tacticalView`/`showWrecks` co do wartości | — |
| **T6** | **pin decyzji T4**: `open({tab:'stratcom'})` przy JUŻ otwartym Stratcomie **nie** resetuje `_selectedWarpShipId` | — |
| **T7** | `open({})` (ścieżka Outlinera) **nie** zmienia zakładki i nie woła `_switchTab` | — |

⚠ T6 wyszedł **lepszy niż zaplanowany**: zamiast czytać źródło `OverlayManager` regexem (i walczyć
z komentarzami — lekcja `source-pin-strip-comments`), konstruuje `new OverlayManager()` i czyta
`_keyMap` **wykonaniem**. Konstruktor jest tani (buduje wyłącznie keymapę), więc pin jest odporny
na przeformatowanie źródła. Kontrola pinu: wpis `f` musi zostać stringiem.

### Wynik

| etap | wynik |
|---|---|
| keeper **fail-first** (przed naprawą) | **20 PASS / 8 FAIL** — padły: T1 ×2 (rdzeń), T2 ×4, kontrola pinu T4 ×1, T5 ×1 |
| keeper po naprawie | **28 / 28** |
| sweep `run-all.mjs` | **179/179 OK, 0 FAIL** (178 + nowy keeper), 24 advisory |
| `check-i18n` | **PASS** (zero nowych kluczy) |
| regresja 108 (`stratcom_warp_trap_smoke`) | **14 / 14** |
| regresja 109 (`stratcom_star_pick_smoke`) | **10 / 10** |

⚠ **Kontrola pinu T4 padła fail-first i to jest wymowne:** przed naprawą wejście na Stratcom
**z innej zakładki** nie resetowało rodziny 108 (`_selectedWarpShipId` / `_selectedClusterSystem`) —
czyli resztka przyczyny źródłowej Findingu 108, którą tamten slice zamknął wyłącznie w `_close()`.
Ten slice domyka ją tam, gdzie należała: przy wejściu w zakładkę.

⚠ **Odstępstwo od T3, świadome i drobne:** plan mówił „`_switchTab` PRZED polami intencji wejścia";
w kodzie zachowana jest **dokładna dotychczasowa kolejność** (`_pendingFocusSection` przypisywane
przed `_switchTab('tactical')`), bo to jest literalne „jak dziś" z T3=W1. Bez znaczenia dla wyniku:
`_switchTab` nie dotyka ani `_pendingFocusSection`, ani `_registryFilter` — pinuje to T5.

---

## 6. Live-gate (właściciel)

1. **§1 (rdzeń, osiągalna ścieżka)** — Dowództwo → **Rejestr** → wpisz frazę w wyszukiwarkę →
   kliknij na kanwę (pole zostaje) → wciśnij **`M`** ⇒ pole tekstowe **znika**, mapa galaktyki czysta.
2. **§2 (pin T4 — tak ma być)** — Rejestr → wpisz frazę → wciśnij **`K`** (zakładka się nie zmienia)
   ⇒ pole **zostaje**.
3. **§3 (Logistyka)** — Logistyka → otwórz drop-down towarów → **`M`** → wróć klikiem na Logistykę
   ⇒ drop-down **zamknięty**.
4. **§4 (regresja `K`)** — Dowództwo otwarte na Stratcomie → **`K`** ⇒ ląduje w Rejestrze z filtrem
   wraków, nic nie zawieszone.
5. **§5 (regresja 108)** — zaznacz statek warp, **Esc**, potem **`M`** ⇒ tryb rozkazu **nie jest**
   uzbrojony (parytet z `_close()` nadal działa).
6. **§6** — zero błędów w konsoli.

---

### Wynik live-gate (właściciel, 2026-08-27) — **6/6 PASS**

Wszystkie sześć kroków potwierdzone na żywo, w tym §2 (pin decyzji T4: pole **zostaje**, gdy
zakładka się nie zmienia) i §5 (regresja 108).

⚠ **GRANICA DOWODU przy §4, zgłoszona przez właściciela:** w zapisie nie było wraków, więc
potwierdzone zostało **zachowanie** (klawisz `K` ląduje w Rejestrze, nic nie wisi, brak błędów),
a **nie treść** filtra wraków. Właściciel zaakceptował to jako wystarczające, bo sam mechanizm
filtra pinuje keeper wykonaniowy (T5: `_tacticalView === 'registry'` **i**
`_registryFilter.showWrecks === true`). Nie nazywać §4 „zweryfikowanym wizualnie" — zweryfikowane
jest zachowanie plus pin wykonaniowy.

---

## 7. Świadomie poza zakresem

Brak `blur` w wyszukiwarce Rejestru (celowy, T5) · bramka `isAnyOpen` dla Outlinera
(`UIManager:1715` — dziś nieszkodliwe, odnotowane w rejestrze §160 jako furtka) · audyt tej samej
klasy w **innych** overlayach (nie ma ich: `g`/`m`/`k` to jedyne wpisy `{id, opts}` w keymapie) ·
**Finding 110** — następny slice, osobny podpis.
