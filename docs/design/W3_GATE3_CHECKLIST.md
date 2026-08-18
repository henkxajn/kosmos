# W3 — GATE 3: TRACISZ KOLONIĘ, WIDZISZ TO, I MOŻESZ JĄ ODZYSKAĆ (checklista live)

**Slice:** W3 (ofensywne AI) · **Commity:** `0eae716` (W3-6, desant AI z bitew `vessel_group`) ·
`cced9df` (W3-7, gracz dowiaduje się, że jest atakowany)
**Plan:** `docs/design/W3_PLAN.md` · **Poprzednie gate'y:** GATE 1 ZDANY 2026-08-17 ·
GATE 2 ZDANY W CAŁOŚCI 2026-08-18
**Stan przed gate'em:** sweep **148/148 OK, 0 FAIL** · `check-i18n` **PASS** (pl = en = 3255) ·
`w3_ai_invasion` **16/16** · `w3_attack_visibility` **42/42** · zapis **v101, bez migracji**

> **CO TU SPRAWDZAMY, w jednym zdaniu:** czy przegrana ma **CENĘ, TWARZ i DROGĘ POWROTU** —
> AI schodzi na Twoją planetę, Ty się o tym **dowiadujesz**, imperium **korzysta** ze zdobyczy,
> a Ty możesz ją **odbić**.
>
> To jest finał slice'u i domknięcie trzech rzeczy naraz: desant AI (kierunek AI→gracz był
> **martwy na obu końcach**, bo `InvasionSystem` czekał na kształt bitwy, którego w normalnej
> grze nic nie emituje), widoczność (audyt S25: **najgłośniejsze zdarzenia w tej grze były
> ciche**) i odwracalność (W3-1: podbój **zostaje**, kolonia dalej żyje i może zmienić ręce
> jeszcze raz).

**Zasady stałe (każda kupiona błędem, wszystkie obowiązują):** żadnego wielolinijkowego kodu
w cytatach blokowych · stolica WYŁĄCZNIE przez `KOSMOS.directorProduction.capitalOf(empireId)` ·
niedobory czytać **z silnika**, nigdy z listy w pamięci · `DebugLog` to pierścień **czyszczony
przy reloadzie** · **nigdy** gate równolegle z pracą CC · dźwignie stanu tylko przez zwalidowane
narzędzia · **nigdy nie filtruj Dziennika po WYŚWIETLANYM TEKŚCIE** — filtruj po rodzaju
zdarzenia · ⚠ **kolonie i statki wybieraj po STEMPLU WŁASNOŚCI, nigdy po nazwie** (§Findings 20).

**Walidacja one-linerów:** wszystkie polecenia poniżej **WYKONANE** na żywym silniku przed
wpisaniem tutaj — łącznie z pełnym łańcuchem desantu i odczytem `previousOwner`.

---

## 0. Przygotowanie

- [ ] **CC nie pracuje.**
- [ ] ⚠ **Zapisz grę do pliku** (menu ☰) — ten gate ODDAJE Twoją kolonię wrogowi i chcesz mieć
      drogę powrotu niezależną od mechaniki odbijania.
- [ ] Odśwież grę (Live Server), konsola (F12). **Sandbox Bojowy** wystarcza w całości —
      w przeciwieństwie do §8 GATE 2 tu nie potrzebujesz zasięgu terytorialnego, bo cel desantu
      wskazuje BITWA, nie reguła.

---

## 1. Scena: wróg wygrywa orbitę nad Twoją kolonią

**L1 — kto trzyma orbitę PRZED (punkt zerowy):**

`KOSMOS.warSystem.getOrbitalController('sys_home')`

- [ ] `null` albo `'player'`. To jest stan, który zaraz się zmieni.

**L2 — postaw wrogi TRANSPORTOWIEC (nie zwykłą fregatę!):**

`KOSMOS.debug.spawnEnemyRaider({ autoOrder: false, templateId: 'frigate_laser_escort' })`

⚠ Sandbox stawia FRG-3 i **żaden z nich nie ma ładowni ani kapsuł desantowych** — to nie usterka,
tylko projekt katalogu (patrz L5, gdzie ten fakt jest właśnie tym, co sprawdzamy). Do desantu
potrzebny jest kadłub z **`troop_bay_*` + `drop_pods`**; jeśli w Twojej flocie AI takiego nie ma,
przejdź do L5 (odmowa) i wróć tu po zbudowaniu transportowca.

**L3 — doprowadź do bitwy, którą AI WYGRA nad Twoją planetą**, i sprawdź dominację:

`KOSMOS.warSystem.getOrbitalController('<systemId Twojej kolonii>')`

- [ ] Zwraca **id imperium**, nie `'player'`. Bez tego desantu NIE BĘDZIE (§2 L5).

⚠ **Wojna pojawia się przy PIERWSZEJ BITWIE, nie przy spawnie — i tak ma być.** Jeśli
`spawnEnemyAttack`/`spawnEnemyRaider` nie utworzyły wojny, to nie usterka: wypowiedzenie robi
`EnemyAttackHandler` w chwili rozstrzygania starcia (`enemy_attack_arrived`), bo dopiero wtedy
jest zdarzenie, które da się uzasadnić. Zobaczysz to w Dzienniku jako „… declared war".
⚠ **Jeśli walka toczyła się w INNYM układzie niż Twoja kolonia** — dominacja i bitwa księgują
się w układzie **CELU** (W3-4b), więc pytaj o ten układ, nie o `sys_home` z automatu.

---

## 2. SEDNO — wojsko schodzi na Twoją planetę

**L4 — czy desant się odbył:**

`KOSMOS.invasionSystem.listActive().map(i => [i.planetId, i.aggressor, i.landedTroops.length])`

- [ ] Wpis z **Twoją planetą**, id imperium i liczbą jednostek **> 0**.
      Przed W3-6 ta lista zostawała **pusta zawsze**: `InvasionSystem` wychodził, dopóki
      `participantA.type !== 'empire'` — a ten kształt emitują wyłącznie floty abstrakcyjne,
      których w normalnej grze **nie ma**. Każda realna bitwa emituje `vessel_group`.

**L5 — próg desantu jest WYPROWADZONY Z KADŁUBÓW (to sprawdzasz, gdy desantu NIE ma):**

`KOSMOS.debugLog.query({ kind: 'invasion:blocked' }).map(e => e.data.reason)`

- [ ] Trzy możliwe odpowiedzi, wszystkie poprawne i wszystkie coś znaczą:
      `no_orbital_dominance` (wygrał bitwę, ale nie trzyma orbity) ·
      **`no_drop_capable_hull`** (ma czym walczyć, nie ma czym zejść na dół — flota bojowa
      ≠ flota desantowa, dokładnie ta sama presja, którą czujesz Ty) · brak wpisu = desant poszedł.
- [ ] ⚠ Zauważ, czego tu **NIE MA**: progu „siły floty". Na ścieżce prawdziwych kadłubów
      `strength` nie ma znaczenia — liczy się, czy **ocalał** kadłub ze zrzutem.

> ### ⚠ TO POLECENIE ZMIENIŁO SIĘ PO TWOJEJ PRÓBIE z 2026-08-18 — przeczytaj
>
> Zatrzymałeś się tu na ciszy i miałeś rację, że to zgłosiłeś. Były **dwa** defekty, oba
> naprawione w `6e14b34`:
> 1. **`recordBattle` ogłaszał wynik, ZANIM dopisał jego skutek** — `battle:resolved` szło przed
>    `_updateOrbitalDominance`, więc bramka desantu czytała dominację **sprzed** tej właśnie
>    bitwy i odmawiała `no_orbital_dominance` w chwili, gdy orbita została zdobyta.
>    Naprawa siedzi w KSIĘGOWYM, nie u producentów — tak jak przy W3-2.
> 2. **`invasion:blocked` nie był śledzony w `DebugLog`** — odmowa padała za każdym razem,
>    tylko nikt jej nie zapisywał. Twoje „zero odmów" było artefaktem instrumentu, nie ciszą
>    systemu. Teraz to polecenie **naprawdę czyta** odmowy.
>
> ⚠ **Hipoteza ze zgłoszenia była błędna w jednym punkcie i warto to wiedzieć:** `EnemyAttackHandler`
> **też** emituje `participantA.type = 'vessel_group'`. Połówki slice'u spotykały się co do typu —
> rozjeżdżały się w CZASIE, nie w kształcie.
>
> **Na Twojej scenie (dwie eskorty bez ładowni) oczekiwana odpowiedź to `no_drop_capable_hull`.**

**L6 — jednostki naprawdę stoją na hexach:**

`KOSMOS.groundUnitManager.getUnitsOnPlanet('<planetId>').filter(u => u.owner !== 'player').map(u => [u.type ?? u.archetypeId, u.owner])`

- [ ] Lista niepusta — to są realne jednostki na Twojej mapie hex, do odbicia.
- [ ] Otwórz mapę kolonii: **widać je na siatce**.

---

## 3. WIDZISZ TO — i to jest połowa tego gate'u

**L7 — powiadomienie z dzwonka (to, czego NIE BYŁO):**

`KOSMOS.notificationCenter._items.map(i => [i.type, i.severity, i.title])`

- [ ] Wpis **`['invasion', 'alert', '⚔ Desant na …']`**. Do W3-7 zdarzenia `invasion:*`
      docierały **wyłącznie** do `DebugLog` — **zero** subskrybentów UI w całym drzewie.
- [ ] Ikona 🔔 na dolnym pasku ma **badge**, a klik otwiera wiersz.
- [ ] Wpis jest też w **Dzienniku, na kanale WALKA** (nie „system").

**L8 — najeźdźca jest ANONIMOWY, dopóki go nie rozpoznasz:**

- [ ] Podtytuł powiadomienia mówi o **nieznanym imperium**, jeśli nie masz na nim `detailed`.
      ⚠ To jest zamierzone i różni się od mobilizacji: **zdarzenie** widzisz zawsze (dzieje się
      na Twojej planecie — nie da się go „nie zauważyć"), **tożsamość** dostajesz stopniowo.
      Odwrotność byłaby ślepotą: nieznane imperium zajmuje kolonię w ciszy.

**L9 — czas ZWALNIA, a nie stoi w miejscu:**

- [ ] Przy utracie kolonii gra przechodzi w wolne tempo (auto-slow), **bez blokującego okna**.
- [ ] ⚠ **NIE MA natywnego okna `alert()` przeglądarki.** Do W3-7 utrata kolonii wyglądała jak
      awaria systemu operacyjnego, blokowała całą kartę i — przez zaszyte `previousOwner:'player'` —
      odpalała się TAKŻE przy przerzutach AI→AI (§Findings 22: gra ogłaszała Ci utratę kolonii,
      która nigdy nie była Twoja).

**L10 — kontrola tamtego defektu, na żywo:**

`KOSMOS.colonyManager.transferColony('<planetId kolonii AI>', 'emp_002', 'gate3')`

- [ ] Przerzut **między dwoma imperiami AI**: **NIE dostajesz** ani powiadomienia, ani toastu,
      ani wpisu o utracie. Cudza kolonia zmieniła ręce i to nie jest Twoja sprawa.
- [ ] Id kolonii AI weź po stemplu:
      `KOSMOS.empireRegistry.getColoniesByEmpire('<empireId>').map(c => c.planetId)`

---

## 4. IMPERIUM KORZYSTA ZE ZDOBYCZY (W3-1, na tym samym gate'cie)

- [ ] Po przejęciu Twojej kolonii przez AI:
      `KOSMOS.empireRegistry.getColoniesByEmpire('<empireId>').map(c => [c.planetId, c.name])`
      — zdobycz jest na liście jako **żywy obiekt z nazwą**, nie samo id.
- [ ] Znika z **Twojej** listy: `KOSMOS.colonyManager.getPlayerColonies().map(c => c.planetId)`.
- [ ] Mapa polityczna (Stratcom) maluje układ **barwą zdobywcy**.
- [ ] **Zapisz → F5 → wczytaj.** Wszystkie trzy odczyty wyżej **bez zmian**.
      To jest cała treść W3-1: podbój **zostaje**.

---

## 5. DROGA POWROTU — przegrana jest odwracalna (decyzja D7)

- [ ] Zbierz własne wojsko i **odbij kolonię** (wygraj orbitę → desant → wybij wrogie jednostki).
- [ ] Po odbiciu wraca na Twoją listę (`getPlayerColonies`), a Dziennik notuje przejęcie.
- [ ] ⚠ **To jest ta własność, dla której W3-1 przepisał `transferColony`**: kolonia przez cały
      czas **żyła** (produkowała, liczyła POPy), więc było co odbijać. Przed W3-1 przejęcie
      **kasowało** kolonię — imperium dostawało samo id, a wracać nie było do czego.

---

## 6. Brak regresji

- [ ] Twój własny desant na kolonię AI działa jak dotąd (ta sama maszyneria, drugi kierunek).
- [ ] Komunikaty zrzutu są **w Twoim języku** (grasz po angielsku — sprawdź „No drop pods",
      „Troop bay empty", „No orbital dominance…"). Do W3-7 były zaszyte **po polsku** (S26).
- [ ] Zwykła gra wstaje, czas płynie, konsola bez `TypeError`.

---

## Wynik

| pozycja | wynik |
|---|---|
| 1. Wróg wygrywa orbitę nad Twoją kolonią | ✅ PASS (na żywo) |
| 2. **Wojsko SCHODZI na planetę** (albo odmawia z sensownym powodem) | ✅ PASS — wojsko zeszło (`gu_42` na Nekkar d) |
| 3. Próg desantu z KADŁUBÓW (`no_drop_capable_hull`), nie z abstrakcyjnej siły | ✅ PASS — ⚠ i to jest DZIŚ jedyna osiągalna odpowiedź katalogu AI (Finding 49) |
| 4. **WIDZISZ to**: dzwonek + Dziennik (kanał Walka) + auto-slow, ZERO natywnego `alert()` | ✅ PASS |
| 5. Najeźdźca anonimowy bez rozpoznania, nazwany przy `detailed` | ⊘ nie testowane osobno (nieblokujące) |
| 6. Przerzut AI→AI **nie** ogłasza Ci Twojej straty (§Findings 22) | ⊘ nie testowane osobno (nieblokujące) |
| 7. Imperium KORZYSTA ze zdobyczy i przeżywa ona zapis | ✅ PASS — ⚠ zweryfikowane OBEJŚCIEM przez `transferColony` (Finding 51) |
| 8. **Kolonię da się ODBIĆ** — przegrana jest odwracalna | ✅ PASS — tą samą drogą co §7 |
| 9. Brak regresji, komunikaty w Twoim języku, konsola czysta | ✅ PASS |

**GATE 3:** ☐ ZDANY ☑ **ZDANY WARUNKOWO** ☐ NIEZDANY

> **GATE 3: ZDANY WARUNKOWO, 2026-08-18** (owner-witnessed live). §1-4, 7-9 PASS na żywo.
> §5-6 nie testowane osobno (nieblokujące). **Trzy warunki = `W3_PLAN.md` §Findings 49-51**
> (numeracja orkiestratora: 42-44 — rejestr stał już na 48, mapowanie zapisane przy wpisach),
> każdy z osobną, przypisaną przyszłą pracą; żaden nie blokuje zamknięcia slice'u:
> **49** katalog AI nie ma roli transportowej ⇒ `no_drop_capable_hull` jest jedyną osiągalną
> odpowiedzią bitwy→desant · **50** desant AI używa modelu LEGACY, nie archetypów (inny balans,
> brak morale/zaopatrzenia, sprzeczne domyślne morale) · **51** desant AI NIGDY nie kończy się
> przejęciem kolonii — po stronie AI nie ma wymogu zdobycia stolicy; §4/§5 zweryfikowane
> obejściem przez `transferColony` (ten sam mechanizm co W3-1).

---

## Gdyby coś poszło nie tak

- **`listActive()` puste, a bitwa była** → sprawdź L5. Najczęstsza przyczyna to
  `no_drop_capable_hull`: wygrana flota nie ma ani jednego kadłuba z `troop_bay_*` + `drop_pods`.
- **`no_orbital_dominance` mimo wygranej** → dominacja zapisuje się dla układu **CELU** (W3-4b);
  sprawdź `KOSMOS.gameState.get('orbitalDominance')` i czy bitwa toczyła się tam, gdzie myślisz.
- **Powiadomienia brak, a desant był** → `KOSMOS.debugLog.query({ kind: 'invasion:launched' }).length`.
  Wpis w pierścieniu, a brak w dzwonku ⇒ problem po stronie `NotificationCenter`, nie desantu.
- **Wrogie jednostki wyglądają jak Twoja piechota** → patrz nota niżej; to znany, zapisany limit.

---

## Znany limit, zapisany świadomie (nie blokuje gate'u)

**Desant AI ląduje jednostkami LEGACY (`infantry`), a nie archetypowymi.** W3-6 nauczył grę
mapować obce imperium na frakcję **nie-ludzką** deterministycznie — ale ta mapa działa na
ścieżce ARCHETYPÓW, a `INVASION_UNIT_POOLS` zwraca dziś typy legacy, które frakcji nie mają
w ogóle (`factionId: null`). Skutek: obca piechota wygląda jak Twoja.
Przełączenie puli na archetypy jest **zmianą balansu walki naziemnej** (inne statystyki, inne
kontry), więc należy do slice'u **GROUND** razem z defektem morale (S12) i zasianiem RNG (R13) —
a nie do commita o widoczności. Zapisane w `W3_PLAN.md` §Findings.
