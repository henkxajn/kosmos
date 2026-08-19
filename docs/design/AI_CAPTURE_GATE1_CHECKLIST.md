# AI CAPTURE — GATE 1: „AI dochodzi i przejmuje" (live, przeglądarka)

**Po commitach:** AC-0 … AC-6 (`9af5f13` … `b854463`) · **Zapis:** v101, **bez migracji** ·
**Wykonuje:** właściciel, w przeglądarce. CC nie dotyka repo w trakcie gate'u.

---

## ✅ WYNIK: ZDANY — 2026-08-19 (właściciel, live)

**§0 (D8 — partia zaczyna się pusta), §1 (pętla się domyka), §2 (kontrola pozytywna D3=W3) —
POTWIERDZONE NA ŻYWO.**

**§3 (odwracalność) — ŚWIADOMIE ODŁOŻONE, nie blokuje.** Uzasadnienie właściciela: to regresja
mechanizmu **już dowiedzionego** (W3 GATE 3 §5 — odbicie Nekkar d), a nie nowy dowód tego slice'u.
Do zweryfikowania przy naturalnej okazji albo na starym zapisie z GATE 3.

**Poprawka wniesiona PO gate'cie:** §1/L8b podawał `own_colony` jako jedyny „oczekiwany" powód —
żywy silnik przez większość biegu zwraca `holding`. **Dokument poprawiony do kodu**, nie odwrotnie
(pełna tabela faz przy L8b). Sekwencja przemierzona sondą: `INTENT→capital` → `holding` →
*przejęcie* → `own_colony`.

> ⚠ **CC NIE PISZE PLIKÓW, DOPÓKI GATE TRWA.** Każdy zapis w repo przeładowuje kartę przez Live
> Server i cofa grę do ostatniego zapisu — czyli kasuje mierzony stan. Jeśli w trakcie gate'u
> potrzebna jest zmiana w kodzie: **najpierw zapisz grę do pliku**, potem zgłoś.

> ⚠ **Wszystkie one-linery poniżej zostały WYKONANE na żywym silniku** (headless `GameCore`,
> `tmp_gate1_oneliners.mjs`, 2026-08-19) — składnia i kształt wyniku są sprawdzone, żeby gate nie
> zmierzył fałszywego FAILa z literówki (lekcja z W3/E6). Filtrujemy po **rodzaju zdarzenia**,
> nigdy po TEKŚCIE Dziennika — gra bywa po angielsku.

---

## Warunki wstępne (bez nich gate nic nie zmierzy)

| # | warunek | jak sprawdzić / zrobić |
|---|---|---|
| W1 | **Nowa gra**, scenariusz normalny — **NIE `CombatSandbox`** | stolica sandboxa powstaje inną ścieżką (`autoPlaceBuilding`, bez `planet:buildResult`) niż w normalnej grze; łatwo zmierzyć artefakt zamiast gry |
| W2 | **Mapa kolonii otwarta choć raz** | bez siatki `launchInvasion` zwraca `no_grid`. Sprawdzenie: **L1** |
| W3 | Konsola DevTools otwarta (F12) | wszystkie odczyty idą przez `KOSMOS.*` |

```js
// L1 — czy planeta ma siatkę hex
(() => { const c = KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id);
  return c?.grid ? `GRID OK (${c.grid.toArray().length} kafli)` : 'BRAK SIATKI — otwórz mapę kolonii'; })()
```

---

## §0 — D8: partia zaczyna się PUSTA (to da się sprawdzić TYLKO tutaj)

`GameScene` i `ColonyOverlay` **nie importują się pod node**, więc headless nie potrafi uruchomić
żadnego z trzech usuniętych producentów jednostek startowych. Ten odczyt jest jedynym dowodem
wykonaniowym D8.

```js
// L2 — ile jednostek naziemnych ma gracz na macierzystej (OCZEKIWANE: 0)
KOSMOS.groundUnitManager.getUnitsOnPlanet(KOSMOS.homePlanet.id).length
```

- [ ] **L2 = 0 zaraz po starcie nowej gry** (przed otwarciem mapy).
- [ ] **L2 = 0 także PO otwarciu mapy kolonii** ⚠ — to jest pin dokładnie na `_autoSpawnRover`,
      który stawiał łazika przy KAŻDYM otwarciu panelu, gdy planeta była pusta.
- [ ] Zamknij i otwórz mapę jeszcze raz → **nadal 0**.

---

## §1 — ODCZYT 1: PĘTLA SIĘ DOMYKA (właściwy dowód tego slice'u)

Kolonia **bez obrońców** — po D8 to jest stan domyślny świeżej partii.

**Wejście przez dźwignię** (produkcyjne wejście desantu należy do Findings 49 i NIE jest częścią
tego slice'u): `WarOverlay` (klawisz **W**) → wypowiedz wojnę → przycisk **Force invasion**.
Równoważnie z konsoli — to dokładnie to samo wywołanie, którego używa tamten przycisk:

```js
// L3 — id imperiów
KOSMOS.empireRegistry.listAll().map(e => e.id + ':' + (e.name ?? '?'))

// L4 — DŹWIGNIA: zrzuć 3 jednostki na macierzystą (podstaw id z L3)
KOSMOS.invasionSystem.launchInvasion('emp_001', KOSMOS.homePlanet.id, 3)
// OCZEKIWANE: { success: true, invasionId: 'inv_…', landed: ['gu_1','gu_2','gu_3'] }
```

Puść czas (**1 dzień/s wystarczy**; timer okupacji to **6 WYŚWIETLANYCH miesięcy**, czyli
pół roku na zegarze gry) i obserwuj:

```js
// L5 — gdzie stoją jednostki (powtarzaj co jakiś czas)
KOSMOS.groundUnitManager.getUnitsOnPlanet(KOSMOS.homePlanet.id)
  .map(u => ({ id: u.id, owner: u.owner ?? 'player', q: u.q, r: u.r, st: u.status }))

// L6 — kafel stolicy: właściciel, licznik okupacji, zegar WYŚWIETLANY
(() => { const t = KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id).grid.toArray()
    .find(x => x?.capitalBase);
  return { q: t.q, r: t.r, owner: t.owner, occupyBy: t.occupyEmpireId,
           start: t.occupyStart, now: +KOSMOS.timeSystem.gameTime.toFixed(3) }; })()
```

- [ ] **MARSZ**: w L5 współrzędne `q,r` najeźdźców ZMIENIAJĄ SIĘ i zbiegają do kafla stolicy
      z L6. *(Do AC-3 stali w punkcie zrzutu na zawsze — to był cały Finding 51.)*
- [ ] **OKUPACJA**: gdy pierwszy najeźdźca stanie na stolicy, L6 pokazuje `occupyBy: 'emp_…'`
      i rosnący `now − start`. Flip następuje przy różnicy **≈ 0,5 roku wyświetlanego**.
- [ ] **PRZEJĘCIE**: L6 `owner` → `'emp_…'`, a potem:

```js
// L7a — właściciel kolonii (OCZEKIWANE: id imperium)
KOSMOS.colonyManager.getColony(KOSMOS.homePlanet.id)?.ownerEmpireId ?? 'gracz'

// L7b — księga kampanii (OCZEKIWANE: active:false, end:'colony_captured')
Object.values(KOSMOS.gameState.get('invasions') ?? {})
  .map(i => ({ p: i.planetId, active: i.active, end: i.endReason ?? '-' }))
```

- [ ] **Dziennik / dzwonek**: przyszło powiadomienie o utracie kolonii (kanał **Walka**).
      ⚠ Filtruj po rodzaju zdarzenia, nie po treści.
- [ ] **ŚLAD AUDYTU** — system MÓWI, nie milczy:

```js
// L8a — ile rozkazów marszu padło
KOSMOS.debugLog.query({ kind: 'groundUnit:territorialIntent' }).length

// L8b — ostatnie POWODY, dla których ktoś nie maszeruje
KOSMOS.debugLog.query({ kind: 'groundUnit:territorialBlocked' }).slice(-5).map(e => e.data?.reason)
```

⚠ **L8b zwraca RÓŻNE powody w różnych fazach — i to jest poprawne.** Sekwencja zmierzona na żywym
silniku (GATE 1, 2026-08-19; wcześniejsza wersja tej checklisty podawała tylko ostatni stan jako
„oczekiwany" i było to mylące):

| faza | powód w L8b | znaczenie |
|---|---|---|
| jednostka jeszcze idzie | **żadnego** (leci `groundUnit:territorialIntent`, nie `…Blocked`) | maszeruje — pętla pomija jednostki w stanie `moving` |
| **dotarła na stolicę, stoi** | **`holding`** | ⚠ **to jest stan, który widzisz przez WIĘKSZOŚĆ biegu** — stanie JEST okupacją, timer 6 wyświetlanych miesięcy właśnie tyka |
| po przejęciu kolonii | **`own_colony`** | R-1: kolonia jest już jego, nie ma po co iść. Pojawia się **tik PO** zmianie właściciela |
| jednostka stacjonarna | `unit_immobile` | legacy `garrison` ma `speedHex: 0` — patrz §4 |

Przykładowy przebieg: `INTENT→capital ×3` → `holding` → *przejęcie* → `own_colony`.
⚠ Jednostka, która w chwili przejęcia była **w drodze**, nie zgłosi `own_colony` aż dojdzie
i stanie — to nie jest defekt, tylko ta sama bramka `moving`.

---

## §2 — ODCZYT 2: KONTROLA POZYTYWNA D3=W3 (bez tego gate niczego nie odróżnia)

Powtórz §1 na **nowej grze**, ale najpierw **zrekrutuj JEDNĄ jednostkę** — dowolną, także
`garrison_unit` albo medyka (koszary Lv1 wystarczą; jednostka bojowa NIE jest potrzebna —
o to właśnie chodzi).

- [ ] Desant ląduje, najeźdźcy maszerują, kafel stolicy **może** zmienić właściciela…
- [ ] …ale **L7a nadal pokazuje `gracz`**, dopóki ta jednostka żyje.
- [ ] Rozwiąż / strać tę jednostkę → przejęcie **następuje** przy najbliższym ticku (1 rok gry).

> Bez tego odczytu gate nie odróżnia „symetryczny predykat działa" od „nie ma czego blokować".

---

## §3 — ODCZYT 3: ODWRACALNOŚĆ (regresja D7 z W3)

- [ ] Odbij kolonię (wybij najeźdźców; skan `_tickPlayerConquestChecks` chodzi raz na rok gry).
- [ ] `L7a` wraca na `gracz`, kolonia jest **kompletna**: populacja, budynki, produkcja,
      lista kolonii w UI.

---

## §4 — Czego NIE liczyć jako porażkę tego slice'u

| obserwacja | werdykt |
|---|---|
| **Pierwsza wymiana ognia zabija OBIE jednostki naraz** i gate widzi `invasion:repelled` zamiast `colony:captured` | **NIE FAIL.** To Findings 50/65: legacy `createUnit` nie ustawia `morale`, `CombatSystem` odejmuje przez `?? 0` a czyta przez `?? 100` ⇒ pierwsze trafienie usuwa jednostkę z gry, po OBU stronach. Należy do slice'u GROUND. **Zapisz jako obserwację.** Dlatego §1 mierzy koloni BEZ obrońców. |
| Część fali stoi w miejscu, a `L8b` mówi `unit_immobile` | **NIE FAIL.** Legacy `garrison` ma `speedHex: 0` (stacjonarny z definicji) i trafia do pul desantowych archetypów `trader`/`isolationist`. Powód jest nazwany — system mówi. |
| Desant nie startuje sam, bez dźwigni | **NIE FAIL** — to Findings 49 (brak transportowca w katalogu AI), jawnie poza zakresem. |
| Placówka bez żadnego budynku nie pada | **NIE FAIL** — nie ma czego trzymać; ta sama reguła obowiązuje gracza. |

---

## §5 — Jeśli gate PADNIE

1. **Nie commituj nic** (CC też nie) — najpierw **zapisz grę do pliku**, żeby stan dało się odtworzyć.
2. Zbierz: `L5`, `L6`, `L7a/b`, `L8a/b` + zrzut `KOSMOS.debugLog.tail(40)`.
3. Podaj, **który odczyt** padł (§0/§1/§2/§3) — każdy ma inną przyczynę i inny commit do cofnięcia:
   §0 → AC-3 · marsz → AC-4 · timer/przejęcie → AC-6 · blokada obrońcą → AC-5.

---

## Co dalej po PASS

AC-7 (jedna kampania na ciało — koniec podwójnych fal) · AC-8 (higiena po utracie kolonii) ·
AC-9 (gracz widzi, że traci kafle) → **GATE 2**.
