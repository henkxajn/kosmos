# KOSMOS — Backlog niezrealizowanych planów (widok high-level)

> Zestawienie **pomysłów, reform i planów, które NIE zostały jeszcze zrealizowane** —
> zebrane z ROADMAP, dokumentów koncepcyjnych, audytów i sekcji „backlog / deferred / future"
> rozproszonych po `docs/` i plikach koncepcyjnych.
> Sporządzone: 2026-07-23. Celowo high-level — szczegóły są w linkowanych dokumentach źródłowych.
>
> **Uwaga:** to lista „co jeszcze przed nami", nie plan wykonawczy. Wiele pozycji wymaga
> najpierw decyzji designerskiej Filipa. Duże arcy już ukończone (strefy wpływów, obraz
> operacyjny, dok taktyczny, holotable, reforma paliwa S3.0a, unified order service, stacje
> S3.4) **nie są tu wymieniane**.

---

## 1. Populacja i społeczeństwo (największy nietknięty obszar)

- 
- **Lojalność (Loyalty)** jako ważona wypadkowa satysfakcji poszczególnych warstw.
- **Tożsamość kulturowa (Cultural Identity)** budowana z historii zdarzeń (timeline), a nie abstrakcyjnego floata.
- **Wielofazowe rewolucje** (Niezadowolenie → Ruch → Rewolucja → Aftermath) z wyborami gracza i różnymi typami (kupiecka/naukowa/robotnicza/separatystyczna).
- **Frakcje POP + polityka gubernatora** per kolonia; stan Autonomii jako trzecia forma władania (obok imperium/utraty).
- **Cultural Traits** zdobywane przez dekady, wpływające na bonusy kolonii.
- **Kohorty demograficzne** (youth/adult/elder), fale baby-boom, „pokolenie gniewu" (generational delay do rewolucji).
- **Syntetycy** — droidy/androidy/AI collective jako jednostki pracy: nowa gałąź tech, budynki (robot_assembly, android_lab, ai_nexus), displacement biologicznych POPów → ruch luddystyczny.
- **laborEfficiency per budynek** zamiast globalnego employmentPenalty.

*Źródła: `docs/pop-strata-*`, `docs/pop-system-5-options.md`, `docs/loyalty-identity-concepts.md`. Cały temat = koncepcje, zero kodu.*

---

## 2. Reforma planet i generacji światów

- **Reforma generacji światów** — planety ziemiopodobne generują większość hexów jako ocean (mniej miejsca na budowę) → naturalna presja ekspansji. urozmaicenie jakie hexy sie pojawiaja na roznychg cialach, zrobic analize.
- **Dokończyć lub usunąć terraformowanie** (budynek istnieje, nic nie mutuje atmosfery planety).
- **Trwałość asteroid/komet w save** (dziś znikają po reloadzie).
- Ewentualnie **więcej rzadkich surowców** dla głębi handlu.

*Źródło: `PLANET_SYSTEM_AUDIT.md`, ROADMAP §7 „Reforma generacji światów".*

---

## 3. Multi-Empire — Slice 3 (główny następny rozdział, design-first)

- **Model B: współistnienie 2 imperiów na jednym ciele** (współdzielony grid z ownerId hexów lub osobne gridy z composite key) — dziś 1 ciało = 1 właściciel.
- **AI research per-imperium** — imperia badają tech w czasie (dziś aiTech w 100% statyczny); alternatywnie ≥2 archetypy z różnymi startowymi drzewami tech.
- **Więcej realnych archetypów imperiów** (Diplomat / Militarist / Expansionist) — nie tylko personality-stuby.
- **Interakcje między imperiami** — granice, świadomość obecności, pełny fog-of-war widoku vs gameplayu.
- **Handel inter-empire z cenami wg hostility** + embargo przy wojnie (kierunek Kr między skarbcami). *(Częściowo ruszone w S3.5b cross-empire trade — do rozwinięcia.)*

*Źródło: ROADMAP §5, `docs/kosmos_ai_architecture.md`.*

---

## 4. Konflikt i dyplomacja — Slice 4

- **Wojna AI vs AI** oraz pełne AI vs gracz na poziomie strategicznym.
- **Ataki na cargo shipy** (kurierki jako cele przechwycenia — uzasadnienie fizycznego transportu).
- **Blokady ekonomiczne** (halt civilian trade + orbital battle) z eventami „przejęcie cargo".
- **Sojusze, pakty, embarga** rozbudowane ponad obecny light-diplomacy.
- **Porty / heavy cargo (Warstwa 3 transportu)** — większy throughput przez porty (stub w ESS).
- **Wyczerpywalność deposits** — AI reaguje proaktywnie (dziś tylko warning log).
- **Empire tech state / combat tech scaling dla AI** (dziś weapon/sensor mult tylko dla gracza; wróg flat BASE) — *oznaczone jako „NEXT" w reformie detekcji.*
- **Warunki endgame** dla rywalizacji multi-empire.

*Źródło: ROADMAP §6, `docs/plan-war-diplomacy-ai.md`.*

---

## 5. AI imperiów (rdzeń zachowań)

- **Warstwa B: deklaratywne target-states per archetyp** (year_10/20/30/40 targets) — czeka na nagrania gracza jako ground truth.
- **System nagrywania/replay gracza** do generowania tych target-states.
- **Warstwa C: akcje handlu, eksploracji i militarne** + FleetTacticalAI.
- **Personality System** (5-osiowy wektor) modyfikujący cooldowny akcji AI.
- **EconAI jako 2-poziomowy GOAP** (roczny cel strategiczny → rozkład na akcje) — Faza 7 ongoing, do dopracowania.
- **Realny hull-gating dla AI** (dziś AI zwolnione — buduje wszystko) → mniej rozwinięte AI buduje więcej małych kadłubów.

*Źródło: `docs/kosmos_ai_architecture.md`, ROADMAP §5–6.*

---

## 6. Flota — zarządzanie i walka

- **Odmrożenie endurance / reforma paliwa M4 P4** — presja zasobowa na floty (dziś `enduranceDrainActive=OFF`).
- **Pełna unifikacja walki** — jeden agregator zamiast osobnych ścieżek player-vessels vs empire-fleet; materialized fleet ↔ abstract strength bidirectional.
- **Flota bez kolonii broni systemu** (dziś `_isPlayerInSystem` patrzy tylko na kolonie).
- **Fix drift state (BUG#4)** po auto-retreat + ręczny przycisk „Re-dock to colony".
- **Znaczniki UI statków na mapie** (counter-scale, widoczne z dalekiej kamery — wzorzec Stellaris/HOI) — prerequisite Slice 4.
- **Fleet Groups P4+:** wizualny cluster na mapie 3D, control groups Ctrl+1..9, fleet templates (presety składów), POI rally jako cel floty, shared cargo pool, auto-formation, auto-tuning doktryn po porażce.
- **Reforma zarządzania flotą — otwarte soczewki:** tryb taktyczny top-down `T` z „duchami ETA" (M3), przełącznik zakresu Układ/Wszędzie/Tranzyt z dwustronną sync (K1).

*Źródło: `docs/design/milestone-*`, `docs/plan-fleet-groups.md`, `docs/KOSMOS_koncepcje_reforma_zarzadzania_flota.md`.*

---

## 7. Stacje orbitalne (rozwinięcie po S3.4)

- **Stacje AI** (dziś tylko gracza).
- **Tier 2+ i klasy stacji** + logistics slots jako limiter rozbudowy (model Sins).
- **Endurance jako maintenance stacji orbitalnych** (uruchomić na końcu reform floty).
- **Handel cywilny przez stację** — realny transfer orbita↔grunt zamiast księgowego bonusu.
- **Stacje w Outlinerze / minimapie**.
- **Szablon „Statek pasażerski" w kreatorze** + selektor ilości POP w transporcie.
- **Rozstrzygnąć offset pozycji stacji** (~0.858 AU) — celowy staging point vs stale-anchor.
- **Balans czasu budowy stacji** (obserwacja z live-gate C6c-1, 2026-07-31): koszt surowców pobierany
  poprawnie, ale budowa stacji kończy się niemal natychmiast — czas budowy za krótki względem kosztu.
  Kwestia tuningu symulacji (nie UI); zestroić `buildTime` stacji/`_tickPendingStationOrders` z ciężarem
  ekonomicznym. Standalone — niezależne od arca C6/C6c (relokacja UI).

*Źródło: `docs/KOSMOS_research_fuel_porty.md`, `docs/KOSMOS_decyzje_reforma.md`, CLAUDE.md (backlog S3.4).*

---

## 8. Wywiad / intel

- **Empire↔empire intel sharing** przez traktaty (częściowy wywiad sojusznika).
- **Poziom `detailed` ujawnia hull + moduły wroga** w UI (przewaga informacyjna w walce).
- **Away team → deep-scan** ciała/vessela do poziomu detailed.
- **Obserwatorium utrzymujące kontakt bez degradacji**.
- **Prediction cone „tryb hover"** (stożek tylko na najechany cel, toggle).
- **Banner ostrzegawczy**, gdy wróg zbliża się do patrolu (ProximitySystem awareness w UI).

*Źródło: `docs/design/milestone-2b-intelligence-poi.md`, `milestone-3-runtime-and-ui.md`.*

---

## 9. Ekonomia i handel

- **S3.5a-2: pozostałe sinki Kredytów** (poza utrzymaniem floty) — *NEXT.*
- **Handel oparty na rzadkości surowców** — pełny roster rzadkich surowców (odłożony do S3.3+).
- **Escape-velocity / gravity launch tax** — koszt startu z powierzchni skalowany grawitacją (doc-only, brak w kodzie).
- **ProductionRequestBoard** — zlecenia imperialne / rosnący dochód z sieci handlowej (model Sins).
- **Korporacje jako frakcje** (podstawa lub DLC, przyszłość).

*Źródło: `docs/KOSMOS_decyzje_reforma.md`, `docs/KOSMOS_research_fuel_porty.md`, CLAUDE.md.*

---

## 10. Jednostki naziemne — rekrutacja (Opcja C, odłożona)

- **Gating rekrutacji** przez budynek Barracks Lv1-3 + techy ground/drone warfare.
- **Rzadkie materiały per archetyp** (Ti/Si/Hv/Xe) wymuszające outposty + POP cost (laborer lock) + koszt/upkeep w Kredytach.
- **Cap militarny od populacji** (floor(pop/4)) + reintegracja POPów po śmierci jednostki.
- *(Uwaga: Supply/Organization/Morale + SupplyCoverageSystem z v3 wygląda na już wdrożone — do weryfikacji.)*

*Źródło: `docs/plan-ground-unit-recruitment-option-c(-v3).md`. Dziś: Opcja B flat cost.*

---

## 11. UI / render (duży, świadomie odłożony redesign)

- **Przepisanie warstwy UI/HUD/overlayów z Canvas 2D na DOM+CSS** (cel docelowy).
- **Konsolidacja ~17 overlayów do ~5 hubów** ze wspólną nawigacją.
- **Zamrożenie palety Cold Blue** jako tokeny CSS + wspólny język komponentów, webfonty, ostre assety.
- **Naprawa fragmentacji kolorów** — warstwa 3D (orbity) nie czyta THEME.
- **Most stanu EventBus→DOM**.
- **Nowa ścieżka UI „widoczne-ale-zablokowane z powodem"** dla budynków (dziś ciche ukrywanie).
- Grafika (polish opcjonalny): proceduralna mgławica FBM, dithering, pełny skybox w Stratcomie.

*Źródło: `docs/KOSMOS_UI_redesign_render_options.md`, `analiza-grafiki-mapy-3d.md`.*

---

## 12. Dług techniczny (nie blokuje, ale ma nie zginąć)

- **Separacja viewedColony (UI) vs activeColony (gameplay)** — klik kolonii AI nie powinien wpływać na symulację ani wyciekać eventów za fog-of-war.
- **`_findFreeTile` root-cause** — proponuje hexy odrzucane przez `_build` (fail non-tech).
- **Rebalans progu prosperity/food** (3.0 vs realne 2.5).
- **Konsolidacja formatterów floty** na `FleetPictureLogic` (jedno źródło słownika).
- **Reset kamery klawiszem H w civMode** (dziś nieosiągalny — keymap konsumuje klawisz).
- **NaN w pasku zasobów** przy ekstremalnym fast-forward (Power Test).
- **Odświeżenie/wycięcie przestarzałych smoke** (fleet P1/P3 — migracje sprzed break v75→v76).
- **Tuning heurystyk** `MAX_PENDING_BUILDS/UPGRADES` po dłuższych testach.

*Źródło: `docs/tech_debt_ai_ui_events.md`, ROADMAP §3–4, §7.*

---

## 13. Zapis / storage

- **Multi-slot IndexedDB — ODRZUCONY** (pliki .json zastąpiły sloty). Ewentualny powrót IndexedDB tylko jako zamiana magazynu (nie multi-slot), gdyby quota bolała w endgame.

*Źródło: `docs/plan-multi-save-indexeddb.md`.*

---

### Priorytetowa sekwencja wynikająca z ROADMAP

```
TechDebt Faza 2/3 (częściowo done) → Slice 3 Multi-Empire (Model B, AI research)
                                          → Slice 4 Conflict & Diplomacy (cargo raids, blokady, endgame)
Równolegle/kiedykolwiek: M4 P4 (endurance/fuel) · reforma POP/strata · reforma planet · UI redesign DOM
```

## Brakujące pliki wideo zdarzeń (404) — zebrane przy GATE 1 Directora

Dwa zdarzenia odwołują się do plików, których nie ma w `assets/event-videos/`
(18 mp4 obecnych). Ta sama klasa usterki, oba sprzed workstreamu C:

- `population_milestone.mp4` — zauważone w przebiegu 3 GATE 1 (2026-08-11), **zgłoszone ponownie
  w przebiegu W2 / GATE 3 (2026-08-17)** — wciąż 404
- `cultural_festival.mp4` — zauważone już przy live-gate D1 (`D1_LIVE_GATE_CHECKLIST.md:380`)

Prompty do wygenerowania obu istnieją: `assets/event-videos/midjourney_prompts.md`
(poz. 10 i 12). Zadanie = wygenerować pliki albo zdjąć odwołania, nie kod.

⚠ **To hałas w konsoli, nie awaria — i nie należy do wiersza „konsola czysta" w żadnym gate'cie.**
Łańcuch fallbacku (`GameScene.js:3028-3034`) próbuje `<id>.mp4` → `<videoCategory>.mp4` → `default.mp4`,
a dla `population_milestone` kategoria to `colony` (`ScheduledEventsData.js:329`) i `colony.mp4`
**istnieje** — popup gra normalnie, 404 dotyczy tylko pierwszego ogniwa.

## 🔴 Podwójne pobranie Kr za jednostki naziemne (zgłoszone 2026-08-25, ZMIERZONE, NIENAPRAWIONE)

Znalezione przy audycie utrzymania floty (wariant B). **Nie należy do tamtego arca** — właściciel
polecił zalogować osobno, do naprawy kiedyś.

**Mechanizm.** `ColonyManager._tickGroundUnitUpkeep` odejmuje kredyty RĘCZNIE **i** emituje
`trade:spendCredits`, które ma żywego odbiorcę:

```
ColonyManager.js:1543-1546   home.credits = Math.max(0, (home.credits ?? 0) - bucket.total);
                             EventBus.emit('trade:spendCredits', { colonyId: homeId, amount: bucket.total, … });
CivilianTradeSystem.js:46/57 this._onSpend = ({ colonyId, amount, purpose }) => this.spendCredits(colonyId, amount, purpose);
```

⚠ **Niuans, bez którego pomiar wygląda na losowy:** drugie pobranie przechodzi TYLKO wtedy, gdy po
pierwszym zostało `>= bucket.total` (bramka salda `CivilianTradeSystem.js:879`) ⇒ **bogata kolonia
płaci 2×, biedna 1×**. Do tego kadencja jest w latach **CYWILIZACYJNYCH**
(`ColonyManager.js:1505-1507`, wołane z `:150`) = 12 rozliczeń na rok gry, a panel BUDŻET wpisuje tę
pozycję do sumy „Kr/rok".

**Bliźniak, NIEZMIERZONY:** ten sam wzór przy rekrutacji jednostki (`ColonyManager.js:1441-1442`).

**Kontrast — wzorzec jest niespójny w trzech miejscach:** `shipyard_surge` (`ColonyManager.js:1773`)
oraz `TradeOverlay.js:1085/1095/1105` emitują **bez** ręcznego minusa, czyli pobierają raz.
`VesselManager._tickVesselMaintenance` omija problem, wołając fasadę bezpośrednio — jego komentarz
(`:1973-1974`) nazywa to „double-deduct latentny w ground-unit upkeep". **Nie jest latentny — jest żywy.**

⚠ **Nie dotyczyło zgłoszenia właściciela o unieruchomionej flocie:** `ColonyManager.js:1517`
(`if (allUnits.length === 0) return;`), a partia startuje **bez** jednostek naziemnych
(AI_CAPTURE decyzja D8/AC-3). Przy zerze jednostek ten wypływ wnosi dokładnie zero.

**Naprawa** = usunąć ręczne `-=` i zostawić sam emit (albo odwrotnie — byle jeden wzorzec), plus
keeper wykonaniowy: saldo przed/po jednym rozliczeniu == dokładnie tabela `GROUND_UNIT_UPKEEP`.
⚠ Keeper musi mieć **bogatą** kolonię w fixture, inaczej bramka salda ukryje drugie pobranie
i test przejdzie jałowo.
