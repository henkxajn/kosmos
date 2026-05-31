# Krok 0 — Paliwo: analiza pod projekt modelu (READ-ONLY)

**Data:** 2026-05-31
**Typ:** Krok 0 — analiza READ-ONLY + rekomendacje, wykonana PO audycie a PRZED projektem reformy paliwa/logistyki (**Droga C**). Decyzje projektowe podejmuje Filip.
**Zakres:** odpowiedzi na 4 pytania projektowe o paliwo (najmniej używany surowiec, Wodór vs istniejący, rafineria orbitalna + tankowce, liczba rzadkich surowców) + synteza modelu + zakres + ryzyka.
**Relacja do audytu:** buduje na `docs/audyt_fuel_porty_statki.md`. Audyt zmapował „jak jest dziś"; ten dokument odpowiada na pytania „co wybrać / ile to kosztuje / gdzie pułapki".
**Zaufanie do danych:** twierdzenia Q3 (architektura logistyki/tankowania/orbity) zweryfikowane bezpośrednio w plikach (cytaty z linii). Rankingi zużycia (Q1) oraz rarity/ceny (Q2/Q4) ze skanu pomocniczego — spójne i cytowane, ale przed użyciem konkretnej liczby w balansie warto zerknąć na dany obiekt.

> Rozwidlenie nadrzędne: cztery pytania zbiegają się w **jedną decyzję — skąd FIZYCZNIE bierze się paliwo** (rafineria naziemna z pospolitego minerału, czy harvesting ze specjalnych ciał). Ta decyzja rozstrzyga Q1+Q2 i nadaje sens Q3+Q4.

---

## Pytanie 1 ⭐ — Który surowiec jest najmniej używany (kandydat na bazę paliwa konwencjonalnego)?

### Dane z kodu

9 surowców wydobywalnych — `ResourcesData.js:14–24`, próg złoża wg `rarity` w `DepositSystem.js:35` (`RARITY_THRESHOLDS = [0, 0.01, 0.01, 0.05, 0.1, 2.0]`):

| Surowiec | rarity | Próg złoża | Dostępność | Obciążenie (liczba receptur) | Profil popytu |
|---|---|---|---|---|---|
| **Fe** Żelazo | 1 | 0.01% | wszędzie | **~55** — najwyższe | early→endgame, szkielet |
| **Ti** Tytan | 3 | 0.05% | rocky ~2% | **~40** | mid→endgame, „szkieletowy" (audyt) |
| **Si** Krzem | 2 | 0.01% | wszędzie | ~30 | elektronika + Dyson |
| **Cu** Miedź | 2 | 0.01% | wszędzie | ~25 | okablowanie + Dyson |
| **Hv** Metale ciężkie | 4 | 0.1% | gł. planetoidy | ~15 (gł. endgame Dyson) | nisza→endgame |
| **C** Węgiel | 1 | 0.01% | wszędzie | ~12 | **tylko tier-1 + spalanie; gaśnie po mid-game** |
| **Li** Lit | 3 | 0.05% | rocky (małe złoża) | ~11 | **baza `power_cells`** + dobra konsumpcyjne |
| **Xe** Ksenon | 5 | 2.0% | **tylko planetoidy** | ~7 (wszystkie tier-3+) | brak w early-game |
| **Nt** Neutronium | 5 | 2.0% | **misje only** (`missionReward:true`, cap 2 ciała) | ~5 | endgame only |

POP nie konsumuje żadnego minerału (`ResourcesData.js:56–60` — tylko food/water/energy).

Recepty paliwowe dziś: `power_cells = {Li:6,Cu:4,Si:2}` (`CommoditiesData.js:79/85`), `plasma_cores = {Ti:8,Hv:6,Li:4}` (`:204/211`), `warp_cores` (endgame, `:318`).

### Rekomendacja CC

**Literalnie najmniej używane są Xe i Nt — ale to PUŁAPKA dla paliwa *konwencjonalnego*.** Paliwo konwencjonalne musi być produkowalne przez KAŻDĄ kolonię od pierwszego roku. Xe jest planetoido-zależny (rocky ma Xe=0.01% < próg 2.0% → zero złóż; tylko metallic/carbonaceous/silicate planetoidy go niosą), a Nt jest nagrodą z misji (brak ścieżki wydobycia). **Oba dyskwalifikują się dla konwencjonalnego** — gracz bez planetoidy nie zatankowałby statku.

Filtr „powszechny + ma zapas popytu + tematyczny" zostawia dwóch realnych kandydatów:

1. **⭐ Węgiel (C) — najlepszy wybór dla NOWEGO projektu.** Rarity 1 (złoża na praktycznie każdym ciele), obciążenie ~12 ale **wyłącznie front-loaded** (wszystkie tier-1 commodities) i **gaśnie po mid-game** — żaden budynek/recepta tier-3+ ani segment Dysona go nie używa. Paliwowy sink *reaktywuje* surowiec, który inaczej staje się bezużyteczny w late-game. Temat idealny: węglowodory = chemiczny propelent (metan/RP-1). Bonus: tworzy zdrowe wczesne napięcie „commodities vs paliwo" — zgodne z filozofią MDA (CLAUDE.md: „gracz zawsze czegoś mu brakuje").

2. **Lit (Li) — najlepszy wybór dla KONTYNUACJI.** Już jest bazą `power_cells`. Jeśli „jedno paliwo konwencjonalne" = ewolucja dzisiejszych power_cells, baza Li to minimalna zmiana (recepty/save/intuicja gracza przechodzą bez szwu). Temat dobry (lit = realne paliwo fuzyjne + baterie). Koszt: rarity 3 (mniejsze złoża, rocky ~0.5%) i już umiarkowanie obciążony (dobra konsumpcyjne, military_supplies).

❌ **Cu/Si/Fe/Ti** — zbyt obciążone (paliwo konkurowałoby o wąskie gardło). ❌ **Xe/Nt** — odrzucone dla konwencjonalnego, ale **trzymaj je w pamięci jako bazę przyszłego paliwa egzotycznego/warp** (warp_cores i tak są endgame + planetoido/misjo-zależne — to ich naturalna nisza).

### Otwarte decyzje dla Filipa
- **C (świeży projekt, węglowodór) czy Li (kontynuacja power_cells)?**
- Paliwo = **pojedynczy minerał** rafinowany (C→paliwo), czy **receptura** (C + np. water/energy)? Receptura daje więcej dźwigni balansowej, pojedynczy minerał — czytelność.

---

## Pytanie 2 — Dodać Wodór jako nowy surowiec, czy oprzeć paliwo na istniejącym?

### Dane z kodu

- **Jak powstają surowce:** `DepositSystem.generateDeposits` (`:46–91`) iteruje `ELEMENT_TO_RESOURCE` (`ElementsData.js:45–55`), czyta `composition[element]`, i jeśli `% > próg(rarity)` tworzy złoże (`richness = clamp(%/(rarity×2), 0.1, 1.0)`, `totalAmount ≈ richness×10000`). Deterministyczne z `entity.id`. **Brak ważenia `loadByRarity` w generacji** — `loadByRarity` to tylko sortowanie cargo kuriera AI (`EmpireLogisticsSystem.js:350`).
- **⭐ Wodór już istnieje w danych, ale jest „martwy" do wydobycia:** `H` jest w `ELEMENTS`, gazowe olbrzymy mają **H≈61%, He≈27%** w składzie (`ElementsData.js:115`) — ale `H` **nie ma mapowania** w `ELEMENT_TO_RESOURCE` (`:45–55`) → **gazowe olbrzymy produkują ZERO złóż** (są dziś martwe górniczo). To kluczowy fakt.
- **Koszt dodania (skorygowany — lżejszy niż naiwna lista):** ponieważ `H` już jest w składzie, **NIE trzeba re-normalizować 8 szablonów składu**. Ścieżka „reuse istniejącego H": ~8–10 punktów dotyku — `ResourcesData.js` (def + namePL/EN), `ElementsData.js:45–55` (mapowanie `H→'H'`), `i18n/pl.js`+`en.js` (etykieta), `BuildingsData.js:~1502` (`RESOURCE_ICONS`), `TradeValuesData.js:15` (`BASE_PRICE`; `TRADEABLE_GOODS` auto-derive), `GameScene.js:~2681` (grant startowy — opcjonalnie), `SaveMigration.js` (bump + default 0), + recepty które mają go konsumować (`CommoditiesData.js`). Próg złoża wynika z `rarity` automatycznie — przy 61% składu gazowe giganty dostaną wielkie złoża.

### Rekomendacja CC

**To decyzja WARUNKOWA, sprzężona z Pytaniem 3 (lokalizacja rafinerii).** Nie jest niezależna:

- **Jeśli wizja paliwa = „rafineria naziemna, mineral→paliwo"** → **NIE dodawaj Wodoru.** Użyj Węgla (Q1). Zero nowego surowca, zero migracji surowca, węglowodór pasuje do rafinerii naziemnej.
- **Jeśli wizja paliwa = „pozyskiwanie blisko źródła" (gazowe olbrzymy / blisko słońca — co sugeruje sam zwrot Filipa „rafineria na bliskiej orbicie słonecznej")** → **Wodór wygrywa, i to potrójnie.** H wtedy spina **trzy z czterech pytań naraz**:
  - (Q2) tematycznie najlepsze paliwo (fuzja/chemia),
  - (Q3) daje gazowym olbrzymom (dziś martwym górniczo) **cel istnienia** + naturalny „harvesting" fantazję spójną z „orbitą słoneczną",
  - (Q4) staje się rzadkim surowcem przywiązanym do typu ciała (gaz) → **pogłębia handel z rzadkości** (kolonie przy gazowych olbrzymach eksportują H).

Mój wniosek: **domyślnie Węgiel (taniej, wystarcza)**; **Wodór tylko jeśli Filip świadomie chce mechanikę „harvesting paliwa ze specjalnych ciał"** — wtedy jego koszt (~8–10 punktów) zwraca się przez Q3+Q4.

### Otwarte decyzje dla Filipa
- **Źródło paliwa: naziemne (mineral→rafineria, → Węgiel) czy harvesting (gaz/słońce, → Wodór)?** To rozstrzyga zarówno Q1 jak i Q2.

---

## Pytanie 3 ⭐ — Rafineria orbitalna + tankowce w pętli (model Filipa)

### Dane z kodu

**EmpireLogisticsSystem** (`src/systems/EmpireLogisticsSystem.js`) — to **maszyna stanów kuriera route-based**, dokładnie wzorzec, o który pyta Filip:
- Stan per imperium: `routes[{routeId, motherId, outpostId, courierIds[]}]`, `couriersPerRoute=2`, kadłub `hull_small+cargo_small` (`:56–61`).
- Fazy derived z `vessel.state` (`:256–321`): IDLE@stolica → `dispatchOnMission` outbound → LOADING@outpost (`loadByRarity`) → pełny → `startReturn` → RETURNING → `unloadCargo` + `dockAtColony`.
- Buduje kurierów przez `cm.startShipBuild` gdy `route < cap` (`:200–214`).

**ALE — trzy twarde bariery reużycia dla GRACZA:**
1. **Player-excluded by design:** `_managedEmpires()` filtruje `ARCHETYPES[archetype]` (`:99–104`); claim kuriera odrzuca `ownerEmpireId === 'player'` (`:394–399`). System jest sprzężony z AI-imperiami.
2. **Trasy auto-derive ze złóż** (outposty z Xe/Nt, `:169–171`) — gracz chce **ustawić pętlę RĘCZNIE RAZ**. To inny model triggera.
3. **2-węzłowa pętla PULL** (outpost→stolica, zbieranie) — Filip opisuje **PUSH/dystrybucję, potencjalnie 3-węzłową** (rafineria→hub, hub→planeta). Prymitywy te same, topologia inna.

**`_tickRefueling`** (`VesselManager.js:1345–1383`): tankuje tylko `state==='docked'`, ciągnie paliwo z `colMgr.getColony(dockedAt).resourceSystem.inventory` wg `REFUEL_RATES` (`:54`). **Rozszerza się na „hub" AS-IS — pod warunkiem że hub jest encją rozwiązywalną przez `getColony()` z `.resourceSystem`** (czyli kolonią/outpostem na ciele). `ENERGY_PER_PC=5` (`:60`) zdefiniowane, ale **nieegzekwowane** (martwe).

**`dockAtColony`** (`:478–524`): `dockedAt = targetId` (encja z `_findEntity`); brama portu — **mały kadłub (`hull_small`) dokuje wszędzie bez portu** (`needsSpaceportForVessel`), medium/large bez portu → `orbiting`. Tankowiec z `hull_small` omija problem portu — jak kurier AI.

**Strefa wykluczenia Słońca** (`:49–51`, 0.3 AU + 0.1 margines): `_calcRoute` (`:1875–1928`) to **routing, nie placement** — statki omijają strefę waypointem tangencjalnym. Rafineria na ≥0.4 AU jest osiągalna. **Strefa NIE blokuje budowy.**

**Placement to prawdziwa bariera:** kolonia/outpost jest **intrinsycznie na ciele** — `bootstrapAutonomousOutpost` (`ColonyManager.js:421–494`) wymaga `_findEntity(planetId)` (ciało z `deposits`, `composition`, pozycją) + generuje `HexGrid` z encji. **Brak konceptu wolnostojącej struktury w przestrzeni.** `OrbitalSpaceSystem`/`OrbitalRolesData` pozycjonuje wizualnie **względem ciała** (`computeBodyRadius(entity) × mult`, `OrbitalRolesData.js:84–113`); rola `station` istnieje (`:57`, omega=0) ale `isStation` jest **czytane** (`:121`) i **nigdy nie ustawiane**. Czyli nawet wizualnie nie ma „stacji na orbicie słonecznej niezależnej od planety".

**Brak gracza route-automation:** plik `TradeRouteManager.js` **nie istnieje** (zweryfikowane). Player ma dziś tylko ręczne misje cargo. Pętle tankowców gracza = system do zbudowania od zera (UI + persistence + maszyna stanów).

### Rekomendacja CC — ocena 4 podpytań

| Podpytanie | Werdykt |
|---|---|
| **Reuse EmpireLogisticsSystem?** | **Wzorzec TAK, klasa NIE.** Maszyna stanów kuriera na prymitywach VM (`dispatchOnMission`/`startReturn`/`dockAtColony`/`loadCargo`) jest sprawdzona i idealna. Ale jest AI-coupled (player-excluded), auto-derive, 2-node-pull. Najlepiej: **wyabstrahować wspólny `RouteCourierSystem`** (lub nowy player-facing bliźniak) na tym samym fundamencie. |
| **Rafineria na orbicie słonecznej — sens?** | Strefa 0.3 AU nie blokuje (routing). **Placement blokuje** — brak wolnostojących struktur. **v1: hostuj rafinerię na najgłębszym dostępnym ciele** (hot_rocky/planetoid blisko słońca). Prawdziwa wolnostojąca stacja = nowy typ encji (większy zakres). |
| **`_tickRefueling` → hub orbitalny?** | **Działa BEZ ZMIAN, jeśli hub = outpost-kolonia na ciele** (ma `resourceSystem`, `getColony`-resolvable). Free-floating hub = generalizacja `_tickRefueling` na nie-kolonie. |
| **Spójność z kodem / zakres?** | **~80% reuse**, jeśli rafineria i hub to outpost-kolonie na ciałach. Nowe: 1 budynek (rafineria) + player route-config (UI + maszyna stanów portowana z EmpireLogistics) + opcjonalnie encja orbital-structure. |

**Model v1 reuse-heavy (rekomendowany):** rafineria = budynek na najgłębszym ciele (outpost-kolonia); hub = outpost-kolonia na dogodnym ciele; tankowce = `hull_small+cargo_small` w pętli (player-facing port wzorca EmpireLogistics, ładuje TYLKO paliwo zamiast `loadByRarity`); auto-refuel w hubie = `_tickRefueling` bez zmian. **Odłóż wolnostojące stacje orbitalne** (aktywacja martwego `isStation` + placement w (r,θ) niezależnym od ciała) do osobnego milestone'u.

### Otwarte decyzje dla Filipa
- **Wolnostojąca stacja teraz, czy v1 na ciele (innermost body) + stacje później?**
- **Topologia:** 3-węzłowa pętla (rafineria→hub→planeta) czy dwie pętle 2-węzłowe (rafineria↔hub, hub↔planety)? (EmpireLogistics dziś tylko 2-węzłowa.)
- **Gwarancja inner body:** czy generator ma gwarantować ciało blisko słońca pod rafinerię, czy rafineria może stanąć na dowolnym ciele?

---

## Pytanie 4 — Ile rzadkich surowców dla handlu opartego na rzadkości?

### Dane z kodu

- **Rarity:** 5 tierów (`ResourcesData.js:14–24`). „Rzadkie" realnie: **Hv(4), Xe(5), Nt(5)**. Z nich **Nt = misje only + cap 2 ciała** (nie jest podażą handlową), **Xe = tylko planetoidy** (rocky: 0.01% < próg 2.0% → zero złóż; dom dostaje wymuszone mini-złoże). **Hv to jedyny „rzadki" z szerszym dostępem** (planetoidy + ślady na rocky).
- **Cena:** `BASE_PRICE` (`TradeValuesData.js:15–66`) **koreluje z rarity ręcznie** (Fe/C=1 → Si=1.5 → Cu=2 → Ti=4 → Li=5 → Hv=8 → Xe=12 → Nt=15), ale **nie jest liczona z `rarity`** — to płaska, ręcznie ustawiona tabela. Dynamiczna dźwignia ceny to `scarcityMultiplier(stock, consumption)` 0.2–3.0× (`:76–97`) — **lokalna podaż/popyt, NIE rarity**. Kr per transfer = `qty × BASE_PRICE × scarcity × {0.06 eksport / 0.03 import}` (`CivilianTradeSystem.js:299–309`).

### Rekomendacja CC

**2 surowce (Xe, Nt) to za mało — handel z rzadkości byłby płytki i degeneracyjny.** Nt jest faktycznie poza handlem (misje, cap 2). Xe jest planetoido-zależny → w wielu sesjach 1 właściciel metallic planetoidy monopolizuje, reszta nie ma czego eksportować. Handel zapadłby się do „kto ma planetoidę sprzedaje Xe/Hv wszystkim" — brak wzajemnej sieci.

Dla **głębi** (różne imperia specjalizują się w różnych rzadkich eksportach → prawdziwe sieci handlowe) celuj w **~4–6 surowców strategicznych z SPECJALIZACJĄ per typ ciała**, np.:
- gazowy olbrzym → **Wodór/He-3** (spina z Q2!),
- lodowy → lotne (volatiles),
- wulkaniczny/hot_rocky → siarka / Hv,
- metallic planetoid → Xe / Pt,
- carbonaceous → egzotyczny węgiel/organika.

To sprawia, że **typ ciała determinuje eksport** → kolonie naturalnie się różnią. Dodatkowo: **powiąż cenę z `rarity`** (dziś nie jest — to mała, ale realna zmiana w `TradeValuesData`). Nie projektuj teraz dokładnego rosteru — wystarczy decyzja „2 to za mało, cel ~4–6 ze specjalizacją typów ciał".

### Otwarte decyzje dla Filipa
- **Docelowa liczba strategicznych (~4–6?) i ich przypisanie do typów ciał.**
- **Czy cena handlowa ma być `f(rarity)` zamiast płaskiej `BASE_PRICE`?**

---

## SYNTEZA — spójny model paliwa

Cztery pytania zbiegają się w **jedną decyzję rozwidlającą: skąd FIZYCZNIE bierze się paliwo.** To rozstrzyga Q1+Q2 i nadaje sens Q3+Q4.

| | **Opcja α — Rafineria naziemna** | **Opcja β — Harvesting (gaz/słońce)** |
|---|---|---|
| Baza paliwa (Q1/Q2) | **Węgiel (C)**, istniejący | **Wodór (H)**, +8–10 punktów |
| Źródło | rafineria-budynek na kolonii | rafineria na gazowym olbrzymie / innermost body blisko słońca |
| Q3 placement | dowolna kolonia — trywialne | innermost/gas body (v1) lub wolnostojąca stacja (większy zakres) |
| Q4 synergia | brak (C pospolity) | **H = rzadki eksport gazowych = pogłębia handel** |
| Cel gazowych olbrzymów | nadal martwe górniczo | **dostają sens istnienia** |
| Koszt | **niski** | średni, ale zwraca się przez Q3+Q4 |
| Klimat | „przemysłowy" (RP-1) | „Expanse: skim z gazowca" |

**Wspólny rdzeń obu opcji (niezależny od rozwidlenia):**
1. **Spłaszczenie 3→2 paliwa:** silniki chemical/ion/fusion konsumują **JEDNO paliwo konwencjonalne** (różnią się mnożnikami, które już istnieją: chem ×1.0, ion ×1.8/fuel×0.6, fusion ×3.0/fuel×0.4 — `ShipModulesData.js:14–79`). `plasma_cores` przestaje być paliwem (zostaje jako commodity tier-3 lub znika). `warp_cores` zostaje osobnym, drugim paliwem. Reguła `fuelType` „ostatni silnik wygrywa" (`:576`) upraszcza się do „konwencjonalne ∨ warp".
2. **Rafineria** = dedykowany producent surowiec→paliwo (zastępuje rywalizację o punkty generycznej fabryki — najsłabsze ogniwo z audytu). Reaktywne auto-paliwo (`FactorySystem.js:1163`, dziś hardcode `power_cells`) automatycznie staje się poprawne dla jednego paliwa.
3. **Pętla tankowców** = player-facing system na wzorcu EmpireLogistics (maszyna stanów + prymitywy VM), tankowce `hull_small` (dokują wszędzie), ładują tylko paliwo.
4. **Auto-refuel w hubie** = `_tickRefueling` bez zmian (hub jako outpost-kolonia z `resourceSystem`).
5. **Konsekwencja braku paliwa = twardy stop** (decyzja Filipa) — implementowana w głównej ścieżce `dispatchOnMission` (dziś tylko clampuje do 0, `:352–355`), nie tylko w rozkazach M4.

---

## ZAKRES (co dodać / przebudować / spłaszczyć)

| Element | Rozmiar | Uwagi |
|---|---|---|
| **Spłaszczenie 3→2 paliwa** | **M** | engine_fusion → paliwo konwencjonalne; deprecjacja plasma_cores-jako-paliwa; `REFUEL_RATES`, `fuelType` resolution, recepty, **migracja save** (remap istniejących `plasma_cores` na statkach/w magazynach) |
| **Rafineria (budynek)** | **S–M** | nowy budynek surowiec→paliwo + namePL/EN; reaktywne auto-paliwo „samo się naprawia" |
| **Baza = Węgiel** (Opcja α) | **S** | tylko recepta rafinerii |
| **Baza = Wodór** (Opcja β) | **M** | +8–10 punktów dotyku surowca + migracja; H już w składzie gazowców (bez re-normalizacji) |
| **Player route-automation (pętle tankowców)** | **L** | nie istnieje — UI route-config + maszyna stanów (port EmpireLogistics) + persistence/save |
| **Rafineria/hub jako outpost na ciele (v1)** | **S** | reuse `bootstrapAutonomousOutpost`; `_tickRefueling` AS-IS |
| **Wolnostojąca stacja orbitalna** | **L** | nowy typ encji + placement (r,θ) niezależny od ciała + dok + aktywacja `isStation` — **odłożyć** |
| **Twardy stop przy braku paliwa** | **M** | stranding w głównym dispatch; **ryzyko: psuje założenie AI** (niżej) |
| **Handel z rzadkości (~4–6 strategicznych + cena=f(rarity))** | **M–L** | osobny tor danych+balans; sprzęga się z H (Opcja β) |
| **Los Endurance** (zamrożony, `enduranceDrainActive=false`) | **decyzja** | reforma musi rozstrzygnąć: odmrozić / złożyć w paliwo / usunąć |

---

## RYZYKA / pułapki

1. **⭐ Twardy „brak paliwa → stop" łamie założenie AI.** `EmpireLogisticsSystem` komentuje wprost (`:27`): *„consumeFuel clampuje do 0, NIGDY nie strandi → fuel non-blocking dla AI."* Wprowadzenie strandingu może **zakleszczyć kurierów i floty AI**. Trzeba albo dać AI świadomość paliwa (tankowanie w pętli), albo wyłączyć stranding dla AI — inaczej imperia umrą logistycznie.
2. **⭐ Wolnostojąca rafineria „na orbicie słonecznej" to pułapka zakresu.** Bez nowego typu encji nie ma jej gdzie postawić. v1 na ciele = tani; prawdziwa stacja = duży, osobny milestone. Nie wpadnij w to przy v1.
3. **Brak gwarantowanego ciała blisko słońca.** Generator (Titius-Bode, `MAX_ORBIT_AU=25`) nie gwarantuje ciała na ≤0.5 AU. „Rafineria blisko słońca" potrzebuje fallbacku (dowolne ciało? gwarancja inner body?).
4. **Player route-automation = budowa od zera** (nie tweak). EmpireLogistics to wzorzec, ale jest AI-coupled — wyabstrahowanie/zduplikowanie + UI + save to realna robota „L".
5. **Płytki handel z rzadkości** przy 2 surowcach (degeneracja: monopol właściciela planetoidy). Wymaga rosteru ~4–6 + specjalizacji typów ciał — własny koszt danych/balansu.
6. **Łańcuch migracji save:** spłaszczenie paliw (remap plasma_cores), nowe paliwo konwencjonalne, rafineria, (opcja) Wodór, persistence pętli, cena=f(rarity). Kilka kroków — centralizuj w `SaveMigration.js` (CLAUDE.md).
7. **Endurance + ENERGY_PER_PC** to dwa świadome placeholdery czekające właśnie na tę reformę (audyt §4). Reforma MUSI zdecydować ich los, inaczej zostaną martwe na zawsze.
8. **Sprzężenie Q1↔Q2↔Q3↔Q4.** Wodór nie jest izolowaną decyzją — opłaca się tylko w pakiecie z harvesting-rafinerią i głębszym handlem. Nie decyduj o nich osobno.

---

## Najważniejsze do rozstrzygnięcia z Filipem (kolejność)

1. **Źródło paliwa: Opcja α (Węgiel, rafineria naziemna, tanio) czy β (Wodór, harvesting gaz/słońce, spina Q2+Q3+Q4)?** — to rozwidlenie determinuje 3 z 4 pytań.
2. **Rafineria/hub na ciele (v1, reuse-heavy) czy wolnostojąca stacja (większy zakres)?**
3. **Twardy stop przy braku paliwa — także dla AI?** (ryzyko #1)
4. **Handel: roster ~4–6 strategicznych + cena=f(rarity)?**

---

*Analiza READ-ONLY. Nie zmieniano kodu gry. Następny krok: projekt modelu paliwa (Droga C) z Filipem.*
